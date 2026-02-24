import type { PromptTarget } from "../controllers/prompt";
import type { Cursor } from "../controllers/cursor";
import type { LineModel } from "../line-model";
import { modes, type FileTreeRow, type ModeSelectionLineInfo } from "../modes";
import type { ViewMode } from "../types";
import { clamp } from "../utils/ui";
import type { PromptComposerLayout } from "../components/prompt-composer-bar";

export type SelectionLineInfo = ModeSelectionLineInfo;

export function collectSelectionLineInfos(cursor: Cursor, lineModel: LineModel): SelectionLineInfo[] {
  const { start, end } = cursor.selectionRange;
  if (start <= 0 || end <= 0) return [];
  const selection: SelectionLineInfo[] = [];

  for (let globalLine = start; globalLine <= end; globalLine += 1) {
    const lineInfo = lineModel.getVisibleLineInfo(globalLine);
    if (!lineInfo) continue;
    selection.push({
      globalLine,
      filePath: lineInfo.filePath,
      fileLine: lineInfo.fileLine,
      text: lineInfo.text,
      blockKind: lineInfo.blockKind,
    });
  }

  return selection;
}

export function createPromptTargetFromSelection(
  viewMode: ViewMode,
  cursor: Cursor,
  lineModel: LineModel,
  fileTreeRowsByLine: ReadonlyMap<number, FileTreeRow>,
): PromptTarget | null {
  const selection = collectSelectionLineInfos(cursor, lineModel);
  if (selection.length === 0) return null;

  const modeSelection = modes.buildPromptSelection(viewMode, {
    selection,
    fileTreeRowsByLine,
  });
  if (!modeSelection) return null;

  return buildPromptTarget(viewMode, modeSelection.selection, modeSelection.selectedText);
}

export function buildClipboardSelectionText(
  viewMode: ViewMode,
  selection: readonly SelectionLineInfo[],
  fileTreeRowsByLine: ReadonlyMap<number, FileTreeRow>,
): string {
  const modeClipboard = modes.buildClipboardText(viewMode, {
    selection,
    fileTreeRowsByLine,
  });
  if (modeClipboard) return modeClipboard;

  return selection.map((line) => line.text).join("\n").trimEnd();
}

export function buildPromptTarget(
  viewMode: ViewMode,
  selection: readonly SelectionLineInfo[],
  selectedText: string,
): PromptTarget | null {
  const first = selection[0];
  const last = selection[selection.length - 1];
  if (!first || !last) return null;

  const primaryFilePath = first.filePath;
  const primaryFileLines = selection
    .filter((line) => line.filePath === primaryFilePath && typeof line.fileLine === "number")
    .map((line) => line.fileLine as number);
  const selectionStartFileLine = primaryFileLines.length > 0 ? Math.min(...primaryFileLines) : 1;
  const selectionEndFileLine = primaryFileLines.length > 0 ? Math.max(...primaryFileLines) : 1;

  return {
    viewMode,
    filePath: primaryFilePath,
    selectionStartFileLine,
    selectionEndFileLine,
    anchorLine: last.globalLine,
    selectedText,
    prompt: "",
    model: "opencode/big-pickle",
  };
}

export function resolvePromptComposerLayout(options: {
  target: PromptTarget | null;
  fallbackAnchorLine: number | null;
  lineModel: LineModel;
  cursorLine: number;
  scrollboxY: number;
  scrollTop: number;
  viewportHeight: number;
}): PromptComposerLayout {
  const viewportTop = Math.max(0, options.scrollboxY);
  const viewportHeight = Math.max(1, options.viewportHeight);
  const viewportBottom = viewportTop + viewportHeight - 1;
  const anchorLine = resolvePromptAnchorLine(
    options.target,
    options.fallbackAnchorLine,
    options.lineModel,
    options.cursorLine,
  );
  const anchorDisplayRow = options.lineModel.getDisplayRowForLine(anchorLine);
  const rowInViewport = anchorDisplayRow - options.scrollTop;
  const desiredTop = viewportTop + rowInViewport + 1;
  const top = clamp(desiredTop, viewportTop, viewportBottom);
  return {
    top,
    maxHeight: Math.max(1, viewportBottom - top + 1),
  };
}

export function resolvePromptAnchorLine(
  target: PromptTarget | null,
  fallbackAnchorLine: number | null,
  lineModel: LineModel,
  cursorLine: number,
): number {
  if (target) {
    const visibleLine = lineModel.findGlobalLineForFileLine(target.filePath, target.selectionEndFileLine);
    if (typeof visibleLine === "number") {
      return visibleLine;
    }
  }

  if (lineModel.totalLines <= 0) return 1;
  const fallback = fallbackAnchorLine ?? cursorLine;
  return clamp(fallback, 1, lineModel.totalLines);
}
