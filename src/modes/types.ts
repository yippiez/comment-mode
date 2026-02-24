import type { BlockKind, CodeFileEntry, ViewMode } from "../types";

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
