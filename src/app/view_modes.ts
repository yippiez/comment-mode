import type { BlockKind, CodeFileEntry, ViewMode } from "../types";
import { getParentPosixPath, normalizePosixPath } from "../utils/path";
import { wrapIndex } from "../utils/math";

export type ModeSelectionLineInfo = {
  globalLine: number;
  filePath: string;
  fileLine: number | null;
  text: string;
  blockKind: BlockKind;
};

export type FileTreeRow = {
  key: string;
  kind: "dir" | "file";
  path: string;
  filePath: string;
  depth: number;
  label: string;
  lineCount?: number;
  childFileCount?: number;
};

export type ModePromptSelection = {
  selection: ModeSelectionLineInfo[];
  selectedText: string;
};

export type ModePromptContext = {
  selection: readonly ModeSelectionLineInfo[];
  fileTreeRowsByLine: ReadonlyMap<number, FileTreeRow>;
};

export type ModeClipboardContext = {
  selection: readonly ModeSelectionLineInfo[];
  fileTreeRowsByLine: ReadonlyMap<number, FileTreeRow>;
};

export type ViewModePlugin = {
  id: ViewMode;
  emptyStateMessage: string;
  filterEntries: (entries: readonly CodeFileEntry[]) => CodeFileEntry[];
  buildPromptSelection: (context: ModePromptContext) => ModePromptSelection | null;
  buildClipboardText?: (context: ModeClipboardContext) => string | null;
};

function filterCodeModeEntries(entries: readonly CodeFileEntry[]): CodeFileEntry[] {
  return [...entries];
}

function buildCodePromptSelection(context: ModePromptContext): ModePromptSelection | null {
  const selectedCodeLines = context.selection.filter(
    (line) => line.blockKind === "code" && typeof line.fileLine === "number",
  );
  if (selectedCodeLines.length === 0) return null;

  const byFile = new Map<string, typeof selectedCodeLines>();
  for (const line of selectedCodeLines) {
    const existing = byFile.get(line.filePath);
    if (existing) {
      existing.push(line);
    } else {
      byFile.set(line.filePath, [line]);
    }
  }

  const sections: string[] = ["Mode: CODE", "Selected code:"];
  for (const [filePath, lines] of byFile.entries()) {
    sections.push(`File: ${filePath}`);
    for (const line of lines) {
      sections.push(`${String(line.fileLine)}: ${line.text}`);
    }
    sections.push("");
  }

  return {
    selection: selectedCodeLines,
    selectedText: sections.join("\n").trim(),
  };
}

function filterFilesModeEntries(entries: readonly CodeFileEntry[]): CodeFileEntry[] {
  return [...entries];
}

function buildFilesPromptSelection(context: ModePromptContext): ModePromptSelection | null {
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

function buildFilesClipboardText(context: ModeClipboardContext): string | null {
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

export function buildFileTreeRows(
  entries: readonly CodeFileEntry[],
  currentDirectoryPath: string,
): FileTreeRow[] {
  const directoryPath = normalizePosixPath(currentDirectoryPath);
  const prefix = directoryPath.length > 0 ? `${directoryPath}/` : "";
  const rows: FileTreeRow[] = [];

  if (directoryPath.length > 0) {
    const parentPath = getParentPosixPath(directoryPath);
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

const MODE_PLUGINS: readonly ViewModePlugin[] = [
  {
    id: "code",
    emptyStateMessage: "No files for selected types.",
    filterEntries: filterCodeModeEntries,
    buildPromptSelection: buildCodePromptSelection,
  },
  {
    id: "files",
    emptyStateMessage: "No files for selected types.",
    filterEntries: filterFilesModeEntries,
    buildPromptSelection: buildFilesPromptSelection,
    buildClipboardText: buildFilesClipboardText,
  },
];

class ModeRegistry {
  private index = 0;

  public getMode(): ViewMode {
    return MODE_PLUGINS[this.index]?.id ?? "code";
  }

  public setMode(mode: ViewMode): ViewMode {
    const nextIndex = MODE_PLUGINS.findIndex((entry) => entry.id === mode);
    if (nextIndex >= 0) {
      this.index = nextIndex;
    }
    return this.getMode();
  }

  public switchMode(): ViewMode {
    this.index = wrapIndex(this.index + 1, MODE_PLUGINS.length);
    return this.getMode();
  }

  public getPlugin(mode: ViewMode): ViewModePlugin {
    const plugin = MODE_PLUGINS.find((entry) => entry.id === mode);
    if (plugin) return plugin;
    const fallback = MODE_PLUGINS[0];
    if (!fallback) {
      throw new Error("No view mode plugins registered.");
    }
    return fallback;
  }

  public filterEntries(mode: ViewMode, entries: readonly CodeFileEntry[]): CodeFileEntry[] {
    return this.getPlugin(mode).filterEntries(entries);
  }

  public getEmptyStateMessage(mode: ViewMode): string {
    return this.getPlugin(mode).emptyStateMessage;
  }

  public buildPromptSelection(mode: ViewMode, context: ModePromptContext): ModePromptSelection | null {
    return this.getPlugin(mode).buildPromptSelection(context);
  }

  public buildClipboardText(mode: ViewMode, context: ModeClipboardContext): string | null {
    const plugin = this.getPlugin(mode);
    if (!plugin.buildClipboardText) return null;
    return plugin.buildClipboardText(context);
  }
}

export const modes = new ModeRegistry();
