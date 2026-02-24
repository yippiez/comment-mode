import { existsSync } from "node:fs";
import path from "node:path";
import type { StartupConfig } from "./types";

const DEFAULT_STANDALONE_PORT = 4042;

export function parseStartupConfig(argv: string[]): StartupConfig | null {
  let passwordFromArg: string | null = null;
  let portFromArg: number | null = null;
  let internal = false;
  let rootFromArg: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--help" || token === "-h") {
      printHelp();
      return null;
    }

    if (token === "--internal") {
      internal = true;
      continue;
    }

    if (token === "--password") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--password requires a value.");
      }
      passwordFromArg = value;
      index += 1;
      continue;
    }

    if (token === "--port") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--port requires a value.");
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new Error("--port must be an integer between 0 and 65535.");
      }
      portFromArg = parsed;
      index += 1;
      continue;
    }

    if (token === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--root requires a value.");
      }
      rootFromArg = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  const passwordFromEnv = process.env.COMMENT_MODE_SERVER_PASSWORD?.trim();
  const password = passwordFromArg ?? passwordFromEnv;
  if (!password) {
    throw new Error(
      "Server password is required. Provide --password <value> or COMMENT_MODE_SERVER_PASSWORD.",
    );
  }

  const rootDir = path.resolve(rootFromArg ?? process.env.COMMENT_MODE_SERVER_ROOT ?? process.cwd());
  if (!existsSync(rootDir)) {
    throw new Error(`Workspace root does not exist: ${rootDir}`);
  }

  return {
    rootDir,
    password,
    port: portFromArg ?? (internal ? 0 : DEFAULT_STANDALONE_PORT),
    internal,
  };
}

function printHelp(): void {
  console.log("comment-mode server");
  console.log("");
  console.log("Options:");
  console.log("  --password <value>   Required auth password");
  console.log("  --port <number>      Bind port (default 4042, internal uses 0)");
  console.log("  --root <path>        Workspace root (default current directory)");
  console.log("  --internal           Internal mode (used by TUI)");
  console.log("  --help               Show this help");
}
