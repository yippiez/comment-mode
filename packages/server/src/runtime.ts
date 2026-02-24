import path from "node:path";
import { listOpencodeModelCatalog, startHeadlessOpencodeRun } from "./opencode";
import { isAuthorizedRequest, isLoopbackAddress } from "./security";
import type { OpencodeRunRequestBody, RpcEvent, RpcRequest, RpcResponse, Runtime, StartupConfig } from "./types";
import { getIgnoredDirs, loadCodeFileEntries, watchWorkspace } from "./workspace";

type SocketData = {
  watchingWorkspace: boolean;
  activeRuns: Map<string, () => void>;
};

export async function startRuntime(config: StartupConfig): Promise<Runtime> {
  const sockets = new Set<Bun.ServerWebSocket<SocketData>>();
  const ignoredDirs = await getIgnoredDirs(config.rootDir);

  const broadcastWorkspaceChange = () => {
    for (const socket of sockets) {
      if (!socket.data.watchingWorkspace) continue;
      sendEvent(socket, {
        event: "workspace.changed",
      });
    }
  };

  const watcher = await watchWorkspace(config.rootDir, ignoredDirs, broadcastWorkspaceChange);

  let server!: Bun.Server;
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: config.port,
    idleTimeout: 255,
    fetch(request, bunServer) {
      const source = server.requestIP(request);
      if (source && !isLoopbackAddress(source.address)) {
        return jsonError(403, "Only loopback clients are allowed.");
      }

      const requestUrl = new URL(request.url);
      if (requestUrl.pathname === "/health") {
        return jsonOk({ ok: true, localhostOnly: true, rootDir: config.rootDir, transport: "ws" });
      }

      if (requestUrl.pathname === "/ws") {
        if (!isAuthorizedRequest(request, config.password)) {
          return jsonError(401, "Unauthorized.");
        }

        const upgraded = bunServer.upgrade(request, {
          data: {
            watchingWorkspace: false,
            activeRuns: new Map<string, () => void>(),
          },
        });
        if (upgraded) {
          return;
        }
        return jsonError(500, "Failed to upgrade websocket connection.");
      }

      return jsonError(404, "Not found.");
    },
    websocket: {
      idleTimeout: 255,
      open(socket) {
        sockets.add(socket as Bun.ServerWebSocket<SocketData>);
      },
      message(socket, message) {
        void handleSocketMessage(socket as Bun.ServerWebSocket<SocketData>, message, {
          rootDir: config.rootDir,
          ignoredDirs,
        });
      },
      close(socket) {
        const typed = socket as Bun.ServerWebSocket<SocketData>;
        sockets.delete(typed);
        typed.data.watchingWorkspace = false;
        for (const stop of typed.data.activeRuns.values()) {
          stop();
        }
        typed.data.activeRuns.clear();
      },
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}`,
    close: () => {
      watcher.close();
      for (const socket of sockets) {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
      sockets.clear();
      server.stop(true);
    },
  };
}

async function handleSocketMessage(
  socket: Bun.ServerWebSocket<SocketData>,
  message: string | Buffer | ArrayBuffer | Uint8Array,
  options: {
    rootDir: string;
    ignoredDirs: ReadonlySet<string>;
  },
): Promise<void> {
  const text = decodeSocketMessage(message);
  if (!text) {
    sendResponse(socket, {
      id: "",
      ok: false,
      error: "Message must be UTF-8 text.",
    });
    return;
  }

  const request = parseRpcRequest(text);
  if (!request) {
    sendResponse(socket, {
      id: "",
      ok: false,
      error: "Message must be a JSON object with string id and method.",
    });
    return;
  }

  const fail = (error: string) => {
    sendResponse(socket, {
      id: request.id,
      ok: false,
      error,
    });
  };

  if (request.method === "workspace.entries.list") {
    const entries = await loadCodeFileEntries(options.rootDir, options.ignoredDirs);
    sendResponse(socket, {
      id: request.id,
      ok: true,
      result: entries,
    });
    return;
  }

  if (request.method === "workspace.watch.start") {
    socket.data.watchingWorkspace = true;
    sendResponse(socket, {
      id: request.id,
      ok: true,
      result: { watching: true },
    });
    return;
  }

  if (request.method === "workspace.watch.stop") {
    socket.data.watchingWorkspace = false;
    sendResponse(socket, {
      id: request.id,
      ok: true,
      result: { watching: false },
    });
    return;
  }

  if (request.method === "opencode.models.list") {
    const catalog = await listOpencodeModelCatalog(options.rootDir);
    sendResponse(socket, {
      id: request.id,
      ok: true,
      result: catalog,
    });
    return;
  }

  if (request.method === "opencode.run.start") {
    const parseResult = parseRunRequestParams(request.params);
    if (!parseResult.ok) {
      fail(parseResult.error);
      return;
    }

    const runId = createRunId(parseResult.value.filePath);
    const runResult = await startHeadlessOpencodeRun({
      ...parseResult.value,
      runId,
      rootDir: options.rootDir,
      onMessage: (messageText) => {
        sendEvent(socket, {
          event: "opencode.run.message",
          data: {
            runId,
            message: messageText,
          },
        });
      },
      onExit: ({ success, error }) => {
        socket.data.activeRuns.delete(runId);
        sendEvent(socket, {
          event: "opencode.run.done",
          data: {
            runId,
            success,
            error,
          },
        });
      },
    });

    if (!runResult.ok) {
      fail(runResult.error);
      return;
    }

    socket.data.activeRuns.set(runId, runResult.stop);
    sendResponse(socket, {
      id: request.id,
      ok: true,
      result: {
        runId,
      },
    });
    return;
  }

  if (request.method === "opencode.run.stop") {
    const params = asRecord(request.params);
    const runId = toText(params?.runId);
    if (!runId) {
      fail("runId is required.");
      return;
    }

    const stop = socket.data.activeRuns.get(runId);
    if (!stop) {
      fail(`Run not found: ${runId}`);
      return;
    }

    stop();
    sendResponse(socket, {
      id: request.id,
      ok: true,
      result: { stopped: true },
    });
    return;
  }

  fail(`Unknown method: ${request.method}`);
}

function parseRunRequestParams(
  value: unknown,
): { ok: true; value: OpencodeRunRequestBody } | { ok: false; error: string } {
  const record = asRecord(value);
  if (!record) {
    return { ok: false, error: "params must be an object." };
  }

  const model = toText(record.model);
  const filePath = toText(record.filePath);
  const prompt = toText(record.prompt);
  const selectedText = typeof record.selectedText === "string" ? record.selectedText : "";
  const variant = toText(record.variant);
  const contextMode = toText(record.contextMode);
  const selectionStartFileLine = Number(record.selectionStartFileLine);
  const selectionEndFileLine = Number(record.selectionEndFileLine);

  if (!model) return { ok: false, error: "model is required." };
  if (!filePath) return { ok: false, error: "filePath is required." };
  if (!prompt) return { ok: false, error: "prompt is required." };
  if (!Number.isInteger(selectionStartFileLine) || selectionStartFileLine < 1) {
    return { ok: false, error: "selectionStartFileLine must be a positive integer." };
  }
  if (!Number.isInteger(selectionEndFileLine) || selectionEndFileLine < 1) {
    return { ok: false, error: "selectionEndFileLine must be a positive integer." };
  }
  if (contextMode && contextMode !== "code" && contextMode !== "files") {
    return { ok: false, error: "contextMode must be 'code' or 'files'." };
  }

  return {
    ok: true,
    value: {
      model,
      variant,
      contextMode: contextMode as "code" | "files" | undefined,
      filePath,
      selectionStartFileLine,
      selectionEndFileLine,
      prompt,
      selectedText,
    },
  };
}

function decodeSocketMessage(message: string | Buffer | ArrayBuffer | Uint8Array): string | null {
  if (typeof message === "string") return message;
  if (message instanceof ArrayBuffer) {
    return Buffer.from(message).toString("utf8");
  }
  if (ArrayBuffer.isView(message)) {
    return Buffer.from(message.buffer, message.byteOffset, message.byteLength).toString("utf8");
  }
  return null;
}

function parseRpcRequest(text: string): RpcRequest | null {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }

  const record = asRecord(payload);
  if (!record) return null;
  const id = toText(record.id);
  const method = toText(record.method);
  if (!id || !method) return null;
  return {
    id,
    method,
    params: record.params,
  };
}

function sendResponse(socket: Bun.ServerWebSocket<SocketData>, payload: RpcResponse): void {
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function sendEvent(socket: Bun.ServerWebSocket<SocketData>, payload: RpcEvent): void {
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function createRunId(filePath: string): string {
  const safeStem = path
    .basename(filePath)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const unique = Date.now().toString(36);
  return `run-${safeStem || "task"}-${unique}`;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
