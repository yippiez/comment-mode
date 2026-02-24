import type { CodeFileEntry } from "../types";
import type { FileTreeRow, ModeClipboardContext, ModePromptContext, ModePromptSelection } from "./types";

export function filterFilesModeEntries(entries: readonly CodeFileEntry[]): CodeFileEntry[] {
  return [...entries];
}

export function buildFilesPromptSelection(context: ModePromptContext): ModePromptSelection | null {
  const selectedFiles = new Set<string>();
  const selectedRows: ModePromptSelection["selection"] = [];

  for (const line of context.selection) {
    if (line.blockKind !== "file") continue;
    const row = context.fileTreeRowsByLine.get(line.globalLine);
    if (!row || row.kind !== "file") continue;
    selectedFiles.add(row.filePath);
    selectedRows.push(line);
  }

  if (selectedFiles.size === 0 || selectedRows.length === 0) return null;

  const sections: string[] = ["Mode: FILES", "Selected files:"];
  for (const filePath of selectedFiles) {
    sections.push(`- ${filePath}`);
  }

  return {
    selection: selectedRows,
    selectedText: sections.join("\n"),
  };
}

export function buildFilesClipboardText(context: ModeClipboardContext): string | null {
  const files: string[] = [];
  const seen = new Set<string>();
  for (const line of context.selection) {
    if (line.blockKind !== "file") continue;
    const row = context.fileTreeRowsByLine.get(line.globalLine);
    if (!row || row.kind !== "file") continue;
    if (seen.has(row.filePath)) continue;
    seen.add(row.filePath);
    files.push(row.filePath);
  }

  return files.length > 0 ? files.join("\n") : null;
}

/** Builds a collapsible tree list from relative file paths. */
export function buildFileTreeRows(
  entries: readonly CodeFileEntry[],
  currentDirectoryPath: string,
): FileTreeRow[] {
  const directoryPath = normalizeDirectoryPath(currentDirectoryPath);
  const prefix = directoryPath.length > 0 ? `${directoryPath}/` : "";
  const rows: FileTreeRow[] = [];

  if (directoryPath.length > 0) {
    const parentPath = parentDirectoryPath(directoryPath);
    rows.push({
      key: `dir:${parentPath}:up`,
      kind: "dir",
      path: parentPath,
      filePath: parentPath,
      depth: 0,
      label: "../",
    });
  }

  const childDirectories = new Map<string, number>();
  const childFiles: Array<{ path: string; name: string; lineCount: number }> = [];

  for (const entry of entries) {
    if (prefix.length > 0 && !entry.relativePath.startsWith(prefix)) continue;
    const relative = prefix.length > 0 ? entry.relativePath.slice(prefix.length) : entry.relativePath;
    if (!relative) continue;

    const slashIndex = relative.indexOf("/");
    if (slashIndex >= 0) {
      const directoryName = relative.slice(0, slashIndex);
      const directoryFullPath = prefix.length > 0 ? `${directoryPath}/${directoryName}` : directoryName;
      childDirectories.set(directoryFullPath, (childDirectories.get(directoryFullPath) ?? 0) + 1);
      continue;
    }

    childFiles.push({
      path: entry.relativePath,
      name: relative,
      lineCount: entry.lineCount,
    });
  }

  const sortedDirectories = [...childDirectories.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [directoryFullPath, fileCount] of sortedDirectories) {
    const directoryName = directoryFullPath.split("/").pop() ?? directoryFullPath;
    rows.push({
      key: `dir:${directoryFullPath}`,
      kind: "dir",
      path: directoryFullPath,
      filePath: directoryFullPath,
      depth: 0,
      label: `${directoryName}/`,
      childFileCount: fileCount,
    });
  }

  const sortedFiles = [...childFiles].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sortedFiles) {
    rows.push({
      key: `file:${file.path}`,
      kind: "file",
      path: file.path,
      filePath: file.path,
      depth: 0,
      label: file.name,
      lineCount: file.lineCount,
    });
  }

  return rows;
}

function normalizeDirectoryPath(directoryPath: string): string {
  if (!directoryPath) return "";
  return directoryPath
    .split("/")
    .filter(Boolean)
    .join("/");
}

function parentDirectoryPath(directoryPath: string): string {
  const normalized = normalizeDirectoryPath(directoryPath);
  if (!normalized) return "";
  const parts = normalized.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}
