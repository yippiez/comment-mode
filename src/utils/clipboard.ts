import { spawn } from "node:child_process";

const CLIPBOARD_COMMANDS: Array<{ command: string; args: string[] }> = [
  { command: "wl-copy", args: [] },
  { command: "xclip", args: ["-selection", "clipboard"] },
  { command: "xsel", args: ["--clipboard", "--input"] },
  { command: "pbcopy", args: [] },
];

/** Copies text to clipboard using native tools, then OSC52 fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  for (const entry of CLIPBOARD_COMMANDS) {
    const ok = await runClipboardCommand(entry.command, entry.args, text);
    if (ok) return true;
  }

  return writeOsc52Clipboard(text);
}

function runClipboardCommand(command: string, args: string[], text: string): Promise<boolean> {
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

function writeOsc52Clipboard(text: string): boolean {
  try {
    const base64 = Buffer.from(text, "utf8").toString("base64");
    process.stdout.write(`\u001b]52;c;${base64}\u0007`);
    return true;
  } catch {
    return false;
  }
}
