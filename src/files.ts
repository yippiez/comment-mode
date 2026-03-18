import { readFile } from "node:fs/promises";
import path from "node:path";
import { getIgnoredDirs, loadCodeFileEntries as loadWorkspaceCodeFileEntries } from "./workspace";
import type { CodeFileEntry } from "./types";
import { countLogicalLines } from "./utils/text";

export function isMissingCodeFileError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function loadCodeFileEntries(rootDir = process.cwd()): Promise<CodeFileEntry[]> {
  const ignoredDirs = await getIgnoredDirs(rootDir);
  const entries = await loadWorkspaceCodeFileEntries(rootDir, ignoredDirs);

  return entries.map((entry) => ({
    ...entry,
    uncommittedLines: new Set(entry.uncommittedLines),
  }));
}

export async function hydrateCodeFileEntry(
  entry: CodeFileEntry,
  rootDir = process.cwd(),
): Promise<void> {
  if (entry.isContentLoaded) return;

  const absolutePath = path.join(rootDir, entry.relativePath);
  const content = await readFile(absolutePath, "utf8");

  entry.content = content;
  entry.lineCount = countLogicalLines(content);
  entry.isContentLoaded = true;
}
