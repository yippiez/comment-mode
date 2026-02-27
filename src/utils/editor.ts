import { spawnSync } from "node:child_process";
import path from "node:path";

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
