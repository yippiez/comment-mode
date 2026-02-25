#!/usr/bin/env bun

type Command = "health" | "entries" | "models" | "run";

type Options = {
  url: string;
  password: string;
  command: Command;
  limit?: number;
  model?: string;
  variant?: string;
  mode?: "code" | "files";
  filePath?: string;
  startLine?: number;
  endLine?: number;
  prompt?: string;
  selectedText?: string;
};

type ServerEvent = {
  event: string;
  data?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type RpcSocket = {
  request: <T>(method: string, params?: unknown) => Promise<T>;
  onEvent: (listener: (event: ServerEvent) => void) => () => void;
  onClose: (listener: () => void) => () => void;
  close: () => void;
};

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options) return;

  if (options.command === "health") {
    const response = await fetch(joinUrl(options.url, "/health"));
    await printJsonResponse(response);
    return;
  }

  if (options.command === "entries") {
    const socket = await openRpcSocket(options.url, options.password);
    try {
      const payload = await socket.request<unknown>("workspace.entries.list");
      if (!Array.isArray(payload)) {
        console.log("Unexpected response payload.");
        process.exit(1);
      }

      const entries = payload
        .map((item) => (typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item) => (typeof item.relativePath === "string" ? item.relativePath : null))
        .filter((item): item is string => item !== null);

      const limit = options.limit ?? entries.length;
      for (const entry of entries.slice(0, Math.max(0, limit))) {
        console.log(entry);
      }
      return;
    } finally {
      socket.close();
    }
  }

  if (options.command === "models") {
    const socket = await openRpcSocket(options.url, options.password);
    try {
      const payload = await socket.request<unknown>("opencode.models.list");
      if (!Array.isArray(payload)) {
        console.log("Unexpected response payload.");
        process.exit(1);
      }

      for (const item of payload) {
        if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
        const model = typeof item.model === "string" ? item.model : null;
        if (!model) continue;
        if (Array.isArray(item.variants) && item.variants.length > 0) {
          const variants = item.variants.filter((entry: unknown): entry is string => typeof entry === "string");
          console.log(`${model} [${variants.join(", ")}]`);
        } else {
          console.log(model);
        }
      }
      return;
    } finally {
      socket.close();
    }
  }

  if (options.command === "run") {
    const socket = await openRpcSocket(options.url, options.password);
    let finished = false;

    try {
      const donePromise = new Promise<boolean>((resolve, reject) => {
        const detachEvents = socket.onEvent((event) => {
          if (event.event === "opencode.run.message") {
            const data = asRecord(event.data);
            if (!data) return;
            const runId = toText(data.runId);
            if (!runId) return;
            const message = toText(data.message);
            if (!message) return;
            console.log(JSON.stringify({ type: "message", runId, message }));
            return;
          }

          if (event.event === "opencode.run.done") {
            const data = asRecord(event.data);
            if (!data) return;
            const runId = toText(data.runId);
            if (!runId) return;
            const success = data.success === true;
            const error = success ? undefined : toText(data.error) ?? "opencode run failed.";
            console.log(JSON.stringify({ type: "done", runId, success, error }));
            finished = true;
            detachEvents();
            detachClose();
            resolve(success);
          }
        });

        const detachClose = socket.onClose(() => {
          if (finished) return;
          detachEvents();
          detachClose();
          reject(new Error("Server connection closed during run."));
        });
      });

      const startResult = await socket.request<unknown>("opencode.run.start", {
        model: options.model,
        variant: options.variant,
        contextMode: options.mode,
        filePath: options.filePath,
        selectionStartFileLine: options.startLine,
        selectionEndFileLine: options.endLine,
        prompt: options.prompt,
        selectedText: options.selectedText ?? "",
      });

      const runId = toText(asRecord(startResult)?.runId);
      if (!runId) {
        throw new Error("Server did not return runId.");
      }

      const success = await donePromise;
      if (!success) {
        process.exit(1);
      }
      return;
    } finally {
      socket.close();
    }
  }
}

function parseArgs(argv: string[]): Options | null {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    printUsage();
    return null;
  }

  const getValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    return argv[index + 1];
  };

  const command = argv.find((token) => {
    return token === "health" || token === "entries" || token === "models" || token === "run";
  }) as Command | undefined;

  if (!command) {
    throw new Error("Missing command. Use one of: health, entries, models, run.");
  }

  const url = getValue("--url") ?? process.env.COMMENT_MODE_SERVER_URL ?? "http://127.0.0.1:4042";
  const password = getValue("--password") ?? process.env.COMMENT_MODE_SERVER_PASSWORD;

  if (command !== "health" && (!password || password.trim().length === 0)) {
    throw new Error("Password is required. Use --password or COMMENT_MODE_SERVER_PASSWORD.");
  }

  const options: Options = {
    url,
    password: password ?? "",
    command,
  };

  if (command === "entries") {
    const limitText = getValue("--limit");
    if (limitText) {
      const parsed = Number.parseInt(limitText, 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("--limit must be a non-negative integer.");
      }
      options.limit = parsed;
    }
  }

  if (command === "run") {
    const model = getValue("--model");
    const filePath = getValue("--file");
    const prompt = getValue("--prompt");
    const startText = getValue("--start");
    const endText = getValue("--end");

    if (!model) throw new Error("--model is required for run.");
    if (!filePath) throw new Error("--file is required for run.");
    if (!prompt) throw new Error("--prompt is required for run.");
    if (!startText) throw new Error("--start is required for run.");
    if (!endText) throw new Error("--end is required for run.");

    const startLine = Number.parseInt(startText, 10);
    const endLine = Number.parseInt(endText, 10);
    if (!Number.isInteger(startLine) || startLine < 1) {
      throw new Error("--start must be a positive integer.");
    }
    if (!Number.isInteger(endLine) || endLine < 1) {
      throw new Error("--end must be a positive integer.");
    }

    const mode = getValue("--mode");
    if (mode && mode !== "code" && mode !== "files") {
      throw new Error("--mode must be 'code' or 'files'.");
    }

    options.model = model;
    options.filePath = filePath;
    options.prompt = prompt;
    options.startLine = startLine;
    options.endLine = endLine;
    options.mode = mode as "code" | "files" | undefined;
    options.variant = getValue("--variant");
    options.selectedText = getValue("--selected") ?? "";
  }

  return options;
}

async function openRpcSocket(baseUrl: string, password: string): Promise<RpcSocket> {
  const socketUrl = buildSocketUrl(baseUrl, password);
  const ws = await openSocket(socketUrl);

  let requestCounter = 0;
  let closed = false;
  const pending = new Map<string, PendingRequest>();
  const eventListeners = new Set<(event: ServerEvent) => void>();
  const closeListeners = new Set<() => void>();

  const closeWithReason = (reason: string) => {
    if (closed) return;
    closed = true;
    for (const request of pending.values()) {
      request.reject(new Error(reason));
    }
    pending.clear();
    for (const listener of closeListeners) {
      listener();
    }
    closeListeners.clear();
    eventListeners.clear();
  };

  ws.addEventListener("message", (event) => {
    void (async () => {
      const text = await messageDataToText(event.data);
      if (!text) return;

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return;
      }

      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return;
      }
      const record = payload as Record<string, unknown>;

      if (typeof record.event === "string") {
        const eventFrame: ServerEvent = { event: record.event, data: record.data };
        for (const listener of eventListeners) {
          listener(eventFrame);
        }
        return;
      }

      const id = toText(record.id);
      if (!id) return;
      const pendingRequest = pending.get(id);
      if (!pendingRequest) return;
      pending.delete(id);

      if (record.ok === true) {
        pendingRequest.resolve(record.result);
        return;
      }

      const errorMessage = toText(record.error) ?? "Server request failed.";
      pendingRequest.reject(new Error(errorMessage));
    })();
  });

  ws.addEventListener("close", () => {
    closeWithReason("Server websocket closed.");
  });

  ws.addEventListener("error", () => {
    closeWithReason("Server websocket error.");
  });

  return {
    request: async <T>(method: string, params?: unknown): Promise<T> => {
      if (closed || ws.readyState !== WebSocket.OPEN) {
        throw new Error("Server connection is closed.");
      }

      requestCounter += 1;
      const id = `req-${Date.now().toString(36)}-${requestCounter.toString(36)}`;

      const resultPromise = new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });

      ws.send(
        JSON.stringify({
          id,
          method,
          params,
        }),
      );

      return (await resultPromise) as T;
    },
    onEvent: (listener) => {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    onClose: (listener) => {
      if (closed) {
        listener();
        return () => {
          // noop
        };
      }
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
    close: () => {
      if (closed) return;
      ws.close();
      closeWithReason("Server websocket closed.");
    },
  };
}

function buildSocketUrl(baseUrl: string, password: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.searchParams.set("token", password);
  return url.toString();
}

async function openSocket(url: string): Promise<WebSocket> {
  const OPEN_TIMEOUT_MS = 10000;

  return await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error("Timed out connecting to local server websocket."));
    }, OPEN_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };

    socket.addEventListener("open", () => {
      finish(() => resolve(socket));
    });

    socket.addEventListener("error", () => {
      finish(() => reject(new Error("Failed to connect to local server websocket.")));
    });

    socket.addEventListener("close", () => {
      if (settled) return;
      finish(() => reject(new Error("Server websocket closed before connection was ready.")));
    });
  });
}

async function printJsonResponse(response: Response): Promise<void> {
  const text = await response.text();
  if (!text) {
    console.log(`${response.status} ${response.statusText}`);
    return;
  }

  try {
    const parsed = JSON.parse(text);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(text);
  }
}

function joinUrl(baseUrl: string, pathname: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

async function messageDataToText(data: unknown): Promise<string | null> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return await data.text();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function printUsage(): void {
  console.log("comment-mode server cli");
  console.log("");
  console.log("Usage:");
  console.log("  bun run packages/cli/src/index.ts <command> [options]");
  console.log("");
  console.log("Global options:");
  console.log("  --url <url>            Server URL (default http://127.0.0.1:4042)");
  console.log("  --password <token>     Server password (or COMMENT_MODE_SERVER_PASSWORD)");
  console.log("");
  console.log("Commands:");
  console.log("  health");
  console.log("  entries [--limit <n>]");
  console.log("  models");
  console.log("  run --model <id> --file <path> --start <n> --end <n> --prompt <text> [--selected <text>] [--mode code|files] [--variant <name>]");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
