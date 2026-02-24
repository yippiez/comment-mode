import { requestServer } from "./server-client";
import type { CodeFileEntry } from "./types";

type ServerCodeFileEntry = Omit<CodeFileEntry, "uncommittedLines"> & {
  uncommittedLines: number[];
};

export async function listCodeFiles(_root: string): Promise<string[]> {
  const entries = await loadCodeFileEntries(_root);
  return entries.map((entry) => entry.relativePath);
}

export async function loadCodeFileEntries(_root: string): Promise<CodeFileEntry[]> {
  const payload = await requestServer<unknown>("workspace.entries.list");
  if (!Array.isArray(payload)) return [];

  const entries: CodeFileEntry[] = [];
  for (const item of payload) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as Partial<ServerCodeFileEntry>;
    if (typeof record.relativePath !== "string") continue;
    if (typeof record.content !== "string") continue;
    if (typeof record.typeLabel !== "string") continue;
    if (typeof record.typePriority !== "number") continue;
    if (typeof record.lineCount !== "number") continue;

    const uncommitted = Array.isArray(record.uncommittedLines)
      ? record.uncommittedLines.filter((line): line is number => Number.isInteger(line) && line > 0)
      : [];

    entries.push({
      relativePath: record.relativePath,
      content: record.content,
      filetype: typeof record.filetype === "string" ? record.filetype : undefined,
      typeLabel: record.typeLabel,
      typePriority: record.typePriority,
      lineCount: record.lineCount,
      uncommittedLines: new Set(uncommitted),
    });
  }

  return entries;
}
