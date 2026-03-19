import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * Opens a file in the user's preferred editor ($EDITOR) at a specific line number.
 * @param filePath - Relative or absolute path to the file
 * @param fileLine - Line number to open the editor at (1-indexed)
 * @param rootDir - Root directory for resolving relative paths (default: cwd)
 * @returns True if the editor command executed successfully, false otherwise
 * @example
 * openFileInEditor("src/index.ts", 42, "/project") // Opens editor at line 42
 * openFileInEditor("README.md", 1)                  // Opens at line 1
 */
export function openFileInEditor(filePath: string, fileLine: number, rootDir = process.cwd()): boolean {
    const editor = process.env.EDITOR?.trim();
    if (!editor) return false;

    const absolutePath = path.resolve(rootDir, filePath);
    const targetLine = Number.isFinite(fileLine) ? Math.max(1, Math.floor(fileLine)) : 1;
    const command = `${editor} +${String(targetLine)} ${shellEscape(absolutePath)}`;

    const result = spawnSync("sh", ["-lc", command], {
        stdio: "inherit",
    });

    return (result.status ?? 1) === 0;
}

function shellEscape(value: string): string {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}
