type ServerConnection = {
  baseUrl: string;
  password: string;
};

type RpcResponse = {
  id?: unknown;
  ok?: unknown;
  result?: unknown;
  error?: unknown;
};

export type ServerEvent = {
  event: string;
  data?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type ServerSocket = {
  request: <T>(method: string, params?: unknown) => Promise<T>;
  onEvent: (listener: (event: ServerEvent) => void) => () => void;
  onClose: (listener: () => void) => () => void;
  waitForClose: () => Promise<void>;
  close: () => void;
};

const SERVER_URL_ENV = "COMMENT_MODE_SERVER_URL";
const SERVER_PASSWORD_ENV = "COMMENT_MODE_SERVER_PASSWORD";
const OPEN_TIMEOUT_MS = 10000;

export function getServerConnection(): ServerConnection | null {
  const baseUrl = process.env[SERVER_URL_ENV]?.trim();
  const password = process.env[SERVER_PASSWORD_ENV]?.trim();
  if (!baseUrl || !password) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    password,
  };
}

export function hasServerConnection(): boolean {
  return getServerConnection() !== null;
}

export async function requestServer<T>(method: string, params?: unknown): Promise<T> {
  const socket = await createServerSocket();
  try {
    return await socket.request<T>(method, params);
  } finally {
    socket.close();
  }
}

export async function createServerSocket(): Promise<ServerSocket> {
  const connection = getServerConnection();
  if (!connection) {
    throw new Error("Server connection is not configured.");
  }

  const socketUrl = buildSocketUrl(connection);
  const ws = await openSocket(socketUrl);
  return createRpcSocket(ws);
}

function createRpcSocket(ws: WebSocket): ServerSocket {
  let requestCounter = 0;
  let closed = false;

  const pending = new Map<string, PendingRequest>();
  const eventListeners = new Set<(event: ServerEvent) => void>();
  const closeListeners = new Set<() => void>();

  let closeResolve!: () => void;
  const closePromise = new Promise<void>((resolve) => {
    closeResolve = resolve;
  });

  const cleanup = (reason: string) => {
    if (closed) return;
    closed = true;
    for (const pendingRequest of pending.values()) {
      pendingRequest.reject(new Error(reason));
    }
    pending.clear();
    for (const listener of closeListeners) {
      listener();
    }
    closeListeners.clear();
    eventListeners.clear();
    closeResolve();
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
        const eventFrame: ServerEvent = {
          event: record.event,
          data: record.data,
        };
        for (const listener of eventListeners) {
          listener(eventFrame);
        }
        return;
      }

      const response = record as RpcResponse;
      if (typeof response.id !== "string") return;
      const pendingRequest = pending.get(response.id);
      if (!pendingRequest) return;

      pending.delete(response.id);
      if (response.ok === true) {
        pendingRequest.resolve(response.result);
      } else {
        const errorMessage =
          typeof response.error === "string" && response.error.trim().length > 0
            ? response.error
            : "Server request failed.";
        pendingRequest.reject(new Error(errorMessage));
      }
    })();
  });

  ws.addEventListener("close", () => {
    cleanup("Server connection closed.");
  });

  ws.addEventListener("error", () => {
    cleanup("Server connection error.");
  });

  return {
    request: async <T>(method: string, params?: unknown): Promise<T> => {
      if (closed || ws.readyState !== WebSocket.OPEN) {
        throw new Error("Server connection is closed.");
      }

      requestCounter += 1;
      const id = `req-${Date.now().toString(36)}-${requestCounter.toString(36)}`;

      const responsePromise = new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });

      try {
        ws.send(
          JSON.stringify({
            id,
            method,
            params,
          }),
        );
      } catch {
        pending.delete(id);
        throw new Error("Failed to send request to local server.");
      }

      return (await responsePromise) as T;
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
    waitForClose: () => closePromise,
    close: () => {
      if (closed) return;
      ws.close();
      cleanup("Server connection closed.");
    },
  };
}

function buildSocketUrl(connection: ServerConnection): string {
  const base = new URL(connection.baseUrl);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = "/ws";
  base.search = "";
  base.searchParams.set("token", connection.password);
  return base.toString();
}

async function openSocket(url: string): Promise<WebSocket> {
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
