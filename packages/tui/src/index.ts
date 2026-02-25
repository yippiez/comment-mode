#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const READY_PREFIX = "COMMENT_MODE_SERVER_READY ";
const READY_TIMEOUT_MS = 15000;

type InternalServer = {
  url: string;
  stop: () => void;
};

const rootDir = process.cwd();
const password = randomBytes(32).toString("hex");
const internalServer = await launchInternalServer(rootDir, password);

process.env.COMMENT_MODE_SERVER_URL = internalServer.url;
process.env.COMMENT_MODE_SERVER_PASSWORD = password;

const cleanup = () => {
  internalServer.stop();
};

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

try {
  await import("./main.ts");
} catch (error) {
  cleanup();
  throw error;
}

async function launchInternalServer(root: string, serverPassword: string): Promise<InternalServer> {
  const child = spawn(
    "bun",
    ["run", "packages/server/src/index.ts", "--internal", "--port", "0", "--root", root],
    {
      cwd: root,
      env: {
        ...process.env,
        COMMENT_MODE_SERVER_PASSWORD: serverPassword,
        COMMENT_MODE_SERVER_ROOT: root,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stopping = false;
  let resolvedReady = false;

  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (child.killed) return;
    child.kill("SIGTERM");
  };

  let readyUrl: string;
  try {
    readyUrl = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for internal server startup."));
      }, READY_TIMEOUT_MS);

      const clear = () => {
        clearTimeout(timeout);
      };

      const handleLine = (line: string, isStderr: boolean) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed.startsWith(READY_PREFIX)) {
          const payloadText = trimmed.slice(READY_PREFIX.length);
          try {
            const payload = JSON.parse(payloadText) as { url?: unknown };
            if (typeof payload.url !== "string" || payload.url.trim().length === 0) {
              throw new Error("Internal server did not provide a url.");
            }
            resolvedReady = true;
            clear();
            resolve(payload.url.trim());
            return;
          } catch (error) {
            clear();
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
          }
        }

        const target = isStderr ? process.stderr : process.stdout;
        target.write(`[comment-mode-server] ${trimmed}\n`);
      };

      child.on("error", (error) => {
        clear();
        reject(error);
      });

      child.on("exit", (code, signal) => {
        if (resolvedReady || stopping) return;
        clear();
        reject(
          new Error(
            `Internal server exited before startup (code=${String(code)}, signal=${String(signal)}).`,
          ),
        );
      });

      let stdoutBuffer = "";
      let stderrBuffer = "";

      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdoutBuffer = consumeLines(stdoutBuffer, String(chunk), (line) => {
          handleLine(line, false);
        });
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderrBuffer = consumeLines(stderrBuffer, String(chunk), (line) => {
          handleLine(line, true);
        });
      });
    });
  } catch (error) {
    stop();
    throw error;
  }

  child.on("exit", (code, signal) => {
    if (stopping) return;
    process.stderr.write(
      `[comment-mode-server] exited unexpectedly (code=${String(code)}, signal=${String(signal)})\n`,
    );
  });

  return {
    url: readyUrl,
    stop,
  };
}

function consumeLines(buffer: string, chunk: string, onLine: (line: string) => void): string {
  const full = buffer + chunk;
  const parts = full.split(/\r?\n/);
  const tail = parts.pop() ?? "";
  for (const line of parts) {
    onLine(line);
  }
  return tail;
}
