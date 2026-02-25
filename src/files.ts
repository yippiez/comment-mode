import { readFile } from "node:fs/promises";
import path from "node:path";
import { getIgnoredDirs, loadCodeFileEntries as loadWorkspaceCodeFileEntries } from "./workspace";
import type { CodeFileEntry } from "./types";

export async function loadCodeFileEntries(): Promise<CodeFileEntry[]> {
  const rootDir = process.cwd();
  const ignoredDirs = await getIgnoredDirs(rootDir);
  const entries = await loadWorkspaceCodeFileEntries(rootDir, ignoredDirs);

  return entries.map((entry) => ({
    ...entry,
    uncommittedLines: new Set(entry.uncommittedLines),
  }));
}

export async function hydrateCodeFileEntry(entry: CodeFileEntry): Promise<void> {
  if (entry.isContentLoaded) return;

  const absolutePath = path.join(process.cwd(), entry.relativePath);
  const content = await readFile(absolutePath, "utf8");

  entry.content = content;
  entry.lineCount = countLogicalLines(content);
  entry.isContentLoaded = true;
}

function countLogicalLines(content: string): number {
  if (content.length === 0) return 1;
  return content.split("\n").length;
}
