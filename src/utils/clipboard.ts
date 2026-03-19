import { spawn } from "node:child_process";

type ClipboardCommand = { command: string; args: string[] };

// const CLIPBOARD_WRITE_COMMANDS: ClipboardCommand[] = [
//   { command: "wl-copy", args: [] },
//   { command: "xclip", args: ["-selection", "clipboard"] },
//   { command: "xsel", args: ["--clipboard", "--input"] },
//   { command: "pbcopy", args: [] },
// ];

const CLIPBOARD_READ_COMMANDS: ClipboardCommand[] = [
    { command: "wl-paste", args: ["--no-newline"] },
    { command: "xclip", args: ["-selection", "clipboard", "-o"] },
    { command: "xsel", args: ["--clipboard", "--output"] },
    { command: "pbpaste", args: [] },
];

/**
 * Reads text from system clipboard using native tools.
 * Tries multiple backends (wl-paste, xclip, xsel, pbpaste) in order.
 * @returns The clipboard text content, or null if no clipboard tool succeeded
 * @example
 * const text = await readFromClipboard();
 * if (text) console.log("Clipboard:", text);
 */
export async function readFromClipboard(): Promise<string | null> {
    for (const entry of CLIPBOARD_READ_COMMANDS) {
        const text = await runClipboardReadCommand(entry.command, entry.args);
        if (text !== null) return text;
    }

    return null;
}

/**
 * Executes a clipboard write command via child process spawn.
 * @param command - The command to execute.
 * @param args - Arguments to pass to the command.
 * @param text - The text to write to the command's stdin.
 * @returns True if the command exited with code 0, false otherwise.
 */

/**
 * Executes a clipboard read command via child process spawn.
 * @param command - The command to execute (e.g., "wl-paste", "xclip")
 * @param args - Arguments to pass to the command
 * @returns The captured stdout text, or null if the command failed
 * @example
 * runClipboardReadCommand("wl-paste", ["--no-newline"]) // "clipboard contents" or null
 */
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

