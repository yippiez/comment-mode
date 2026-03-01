import { spawn } from "node:child_process";

type ClipboardCommand = { command: string; args: string[] };

const CLIPBOARD_WRITE_COMMANDS: ClipboardCommand[] = [
  { command: "wl-copy", args: [] },
  { command: "xclip", args: ["-selection", "clipboard"] },
  { command: "xsel", args: ["--clipboard", "--input"] },
  { command: "pbcopy", args: [] },
];

const CLIPBOARD_READ_COMMANDS: ClipboardCommand[] = [
  { command: "wl-paste", args: ["--no-newline"] },
  { command: "xclip", args: ["-selection", "clipboard", "-o"] },
  { command: "xsel", args: ["--clipboard", "--output"] },
  { command: "pbpaste", args: [] },
];

/** Copies text to clipboard using native tools, then OSC52 fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  for (const entry of CLIPBOARD_WRITE_COMMANDS) {
    const ok = await runClipboardWriteCommand(entry.command, entry.args, text);
    if (ok) return true;
  }

  return writeOsc52Clipboard(text);
}

/** Reads text from system clipboard using native tools. */
export async function readFromClipboard(): Promise<string | null> {
  for (const entry of CLIPBOARD_READ_COMMANDS) {
    const text = await runClipboardReadCommand(entry.command, entry.args);
    if (text !== null) return text;
  }

  return null;
}

function runClipboardWriteCommand(command: string, args: string[], text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "ignore"],
    });

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
    child.stdin.on("error", () => finish(false));
    child.stdin.end(text);
  });
}

function runClipboardReadCommand(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const chunks: Buffer[] = [];
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "ignore"],
    });

    const finish = (text: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(text);
    };

    child.on("error", () => finish(null));
    child.stdout.on("error", () => finish(null));
    child.stdout.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        finish(null);
        return;
      }
      finish(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function writeOsc52Clipboard(text: string): boolean {
  try {
    const base64 = Buffer.from(text, "utf8").toString("base64");
    process.stdout.write(`\u001b]52;c;${base64}\u0007`);
    return true;
  } catch {
    return false;
  }
}
