import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { PromptTarget } from "../controllers/prompt";
import type { Cursor } from "../controllers/cursor";
import type { AppStateStore } from "../controllers/state";
import type { Highlight } from "../controllers/highlight";
import type { AgentUpdate, CodeFileEntry, FocusMode } from "../types";
import type { LineModel } from "../line-model";
import type { PromptComposerBar, PromptComposerLayout } from "./prompt-composer-bar";
import type { FileExplorer } from "./file_explorer";
import type { AgentTimeline } from "./agent_timeline";
import type { DocumentBlocks } from "./document_blocks";
import { modes } from "./view_modes";
import { theme } from "../theme";
import { clearChildren, makeSlashLine } from "../utils/ui";
import { clamp } from "../utils/math";
import { displayWidth } from "../utils/text";
import { resolvePromptComposerLayout as resolvePromptComposerLayoutForSelection } from "./selection";

type RenderTypeChipsOptions = {
  renderer: CliRenderer;
  chipsRow: BoxRenderable;
  sortedTypes: readonly string[];
  selectedChipIndex: number;
  chipWindowStartIndex: number;
  chipsFocused: boolean;
  getTypeCount: (type: string) => number;
  isTypeEnabled: (type: string) => boolean;
  onChipSelected: (index: number) => void;
  onToggleSelectedChip: () => void;
};

type CursorRestorePoint = {
  cursorGlobalLine: number;
  cursorFilePath: string | null;
  cursorFileLine: number | null;
  visualMode: boolean;
  anchorGlobalLine: number | null;
  anchorFilePath: string | null;
  anchorFileLine: number | null;
};

type RenderContentOptions = {
  cursorTargetFilePath?: string;
};

type AppRendererOptions = {
  renderer: CliRenderer;
  root: BoxRenderable;
  chipsRow: BoxRenderable;
  scrollbox: ScrollBoxRenderable;
  promptComposer: PromptComposerBar;
  state: AppStateStore;
  cursor: Cursor;
  lineModel: LineModel;
  visualHighlights: Highlight;
  fileExplorer: FileExplorer;
  agentTimeline: AgentTimeline;
  documentBlocks: DocumentBlocks;
  getEntries: () => CodeFileEntry[];
  getSortedTypes: () => readonly string[];
  getTypeCount: (type: string) => number;
  isTypeEnabled: (type: string) => boolean;
  getFocusMode: () => FocusMode;
  onChipSelected: (index: number) => void;
  onToggleSelectedChip: () => void;
  getUpdatesForFile: (filePath: string) => AgentUpdate[];
  scheduleFileContentLoad: (entry: CodeFileEntry) => void;
  isPromptVisible: () => boolean;
  refreshPromptView: () => void;
};

const CHIP_SCROLL_LEFT_TRIGGER_RATIO = 0.2;
const CHIP_SCROLL_RIGHT_TRIGGER_RATIO = 0.8;
const CHIP_GAP_WIDTH = 1;
const CHIP_OVERFLOW_LEFT_INDICATOR = "<-";
const CHIP_OVERFLOW_RIGHT_INDICATOR = "->";
const CHIP_OVERFLOW_INDICATOR_COLOR = "#00ffff";

export class AppRenderer {
  private readonly renderer: CliRenderer;
  private readonly root: BoxRenderable;
  private readonly chipsRow: BoxRenderable;
  private readonly scrollbox: ScrollBoxRenderable;
  private readonly promptComposer: PromptComposerBar;
  private readonly state: AppStateStore;
  private readonly cursor: Cursor;
  private readonly lineModel: LineModel;
  private readonly visualHighlights: Highlight;
  private readonly fileExplorer: FileExplorer;
  private readonly agentTimeline: AgentTimeline;
  private readonly documentBlocks: DocumentBlocks;
  private readonly getEntries: () => CodeFileEntry[];
  private readonly getSortedTypes: () => readonly string[];
  private readonly getTypeCount: (type: string) => number;
  private readonly isTypeEnabled: (type: string) => boolean;
  private readonly getFocusMode: () => FocusMode;
  private readonly onChipSelected: (index: number) => void;
  private readonly onToggleSelectedChip: () => void;
  private readonly getUpdatesForFile: (filePath: string) => AgentUpdate[];
  private readonly scheduleFileContentLoad: (entry: CodeFileEntry) => void;
  private readonly isPromptVisible: () => boolean;
  private readonly refreshPromptView: () => void;

  private dividerByFilePath = new Map<string, TextRenderable>();

  constructor(options: AppRendererOptions) {
    this.renderer = options.renderer;
    this.root = options.root;
    this.chipsRow = options.chipsRow;
    this.scrollbox = options.scrollbox;
    this.promptComposer = options.promptComposer;
    this.state = options.state;
    this.cursor = options.cursor;
    this.lineModel = options.lineModel;
    this.visualHighlights = options.visualHighlights;
    this.fileExplorer = options.fileExplorer;
    this.agentTimeline = options.agentTimeline;
    this.documentBlocks = options.documentBlocks;
    this.getEntries = options.getEntries;
    this.getSortedTypes = options.getSortedTypes;
    this.getTypeCount = options.getTypeCount;
    this.isTypeEnabled = options.isTypeEnabled;
    this.getFocusMode = options.getFocusMode;
    this.onChipSelected = options.onChipSelected;
    this.onToggleSelectedChip = options.onToggleSelectedChip;
    this.getUpdatesForFile = options.getUpdatesForFile;
    this.scheduleFileContentLoad = options.scheduleFileContentLoad;
    this.isPromptVisible = options.isPromptVisible;
    this.refreshPromptView = options.refreshPromptView;
  }

  public applyTheme(): void {
    this.root.backgroundColor = theme.getBackgroundColor();
    this.chipsRow.backgroundColor = theme.getBackgroundColor();
    this.scrollbox.backgroundColor = theme.getBackgroundColor();
    this.promptComposer.applyTheme();
    this.root.requestRender();
  }

  public renderAll(options: RenderContentOptions = {}): void {
    this.applyTheme();
    this.renderChips();
    this.renderContent(options);
    this.applyLineHighlights();
    if (this.isPromptVisible()) {
      this.refreshPromptView();
    }
    this.root.requestRender();
  }

  public renderChips(): void {
    this.state.chipWindowStartIndex = renderTypeChips({
      renderer: this.renderer,
      chipsRow: this.chipsRow,
      sortedTypes: this.getSortedTypes(),
      selectedChipIndex: this.state.selectedChipIndex,
      chipWindowStartIndex: this.state.chipWindowStartIndex,
      chipsFocused: this.getFocusMode() === "chips",
      getTypeCount: this.getTypeCount,
      isTypeEnabled: this.isTypeEnabled,
      onChipSelected: this.onChipSelected,
      onToggleSelectedChip: this.onToggleSelectedChip,
    });
  }

  public renderContent(options: RenderContentOptions = {}): void {
    const entries = this.getEntries();
    const restorePoint = this.captureCursorRestorePoint();
    clearChildren(this.scrollbox);
    this.lineModel.reset();
    this.visualHighlights.reset();
    this.dividerByFilePath = new Map();
    this.agentTimeline.resetForRender();
    this.fileExplorer.clearRows();

    if (entries.length === 0) {
      this.renderEmptyState("No code files found.");
      this.cursor.configure(0);
      return;
    }

    const filteredEntries = entries.filter((entry) => this.isTypeEnabled(entry.typeLabel));
    if (filteredEntries.length === 0) {
      this.renderEmptyState("No files for selected types.");
      this.cursor.configure(0);
      return;
    }

    const entriesToRender = modes.filterEntries(this.state.viewMode, filteredEntries);
    if (entriesToRender.length === 0) {
      this.renderEmptyState(modes.getEmptyStateMessage(this.state.viewMode));
      this.cursor.configure(0);
      return;
    }

    if (this.state.viewMode === "files") {
      this.fileExplorer.ensureDirectoryVisible(entriesToRender);
      this.renderFilesModeContent(entriesToRender);
      if (this.isPromptVisible()) {
        this.refreshPromptView();
      }
      return;
    }

    const dividerWidth = Math.max(24, this.renderer.width);
    let nextLineNumber = 1;
    let nextDisplayRow = 0;

    for (const entry of entriesToRender) {
      const updatesForFile = this.getUpdatesForFile(entry.relativePath);
      let nextUpdateIndex = 0;
      const dividerRow = nextDisplayRow;
      this.lineModel.markDivider(nextDisplayRow);
      const divider = new TextRenderable(this.renderer, {
        width: "100%",
        overflow: "hidden",
        truncate: true,
        wrapMode: "none",
        content: makeSlashLine(entry.relativePath, dividerWidth),
        fg: theme.getDividerForegroundColor(),
        bg: theme.getDividerBackgroundColor(),
      });
      this.dividerByFilePath.set(entry.relativePath, divider);
      this.scrollbox.add(divider);
      nextDisplayRow += 1;
      const fileAnchorLine = nextLineNumber;

      if (this.fileExplorer.isCollapsed(entry.relativePath)) {
        const result = this.documentBlocks.addCollapsedPlaceholderBlock(
          entry,
          entry.isContentLoaded ? entry.lineCount : null,
          dividerWidth,
          1,
          nextLineNumber,
          nextDisplayRow,
        );
        nextLineNumber = result.nextLineNumber;
        nextDisplayRow = result.nextDisplayRow;
        while (nextUpdateIndex < updatesForFile.length) {
          const update = updatesForFile[nextUpdateIndex];
          if (!update) break;
          const agentResult = this.agentTimeline.addUpdateWithMessages(
            update,
            nextLineNumber,
            nextDisplayRow,
          );
          nextLineNumber = agentResult.nextLineNumber;
          nextDisplayRow = agentResult.nextDisplayRow;
          nextUpdateIndex += 1;
        }
      } else if (!entry.isContentLoaded) {
        this.scheduleFileContentLoad(entry);
        const result = this.documentBlocks.addCollapsedPlaceholderBlock(
          entry,
          null,
          dividerWidth,
          1,
          nextLineNumber,
          nextDisplayRow,
          "↑ loading file content... ↓",
        );
        nextLineNumber = result.nextLineNumber;
        nextDisplayRow = result.nextDisplayRow;
      } else {
        const sourceLines = entry.content.split("\n");
        let fileLineCursor = 1;
        while (nextUpdateIndex < updatesForFile.length) {
          const update = updatesForFile[nextUpdateIndex];
          if (!update) break;
          const anchorLine = clamp(update.selectionEndFileLine, 1, Math.max(1, entry.lineCount));
          if (anchorLine >= fileLineCursor) {
            const chunkLines = sourceLines.slice(fileLineCursor - 1, anchorLine);
            const result = this.documentBlocks.addCodeBlock(
              entry,
              chunkLines.join("\n"),
              fileLineCursor,
              chunkLines.length,
              nextLineNumber,
              nextDisplayRow,
            );
            nextLineNumber = result.nextLineNumber;
            nextDisplayRow = result.nextDisplayRow;
            fileLineCursor = anchorLine + 1;
          }

          const agentResult = this.agentTimeline.addUpdateWithMessages(
            update,
            nextLineNumber,
            nextDisplayRow,
          );
          nextLineNumber = agentResult.nextLineNumber;
          nextDisplayRow = agentResult.nextDisplayRow;
          nextUpdateIndex += 1;
        }

        if (fileLineCursor <= entry.lineCount) {
          const chunkLines = sourceLines.slice(fileLineCursor - 1);
          const result = this.documentBlocks.addCodeBlock(
            entry,
            chunkLines.join("\n"),
            fileLineCursor,
            chunkLines.length,
            nextLineNumber,
            nextDisplayRow,
          );
          nextLineNumber = result.nextLineNumber;
          nextDisplayRow = result.nextDisplayRow;
        }
      }

      while (nextUpdateIndex < updatesForFile.length) {
        const update = updatesForFile[nextUpdateIndex];
        if (!update) break;
        const agentResult = this.agentTimeline.addUpdateWithMessages(
          update,
          nextLineNumber,
          nextDisplayRow,
        );
        nextLineNumber = agentResult.nextLineNumber;
        nextDisplayRow = agentResult.nextDisplayRow;
        nextUpdateIndex += 1;
      }

      if (nextLineNumber > fileAnchorLine) {
        this.lineModel.addFileAnchor({ line: fileAnchorLine, dividerRow, filePath: entry.relativePath });
      }
    }

    this.lineModel.setTotalLines(nextLineNumber - 1);
    const pendingPath = this.fileExplorer.consumePendingCodeTargetPath();
    const targetPath = options.cursorTargetFilePath ?? pendingPath;
    const targetAnchor = targetPath ? this.lineModel.getFileAnchorByPath(targetPath) : undefined;
    if (targetAnchor) {
      this.cursor.configureWithTarget(this.lineModel.totalLines, targetAnchor.line, "keep");
    } else {
      const restoreTarget = this.resolveCursorRestoreTarget(restorePoint);
      this.cursor.configureWithTarget(
        this.lineModel.totalLines,
        restoreTarget.cursorLine,
        "keep",
        restoreTarget.visualAnchorLine,
      );
    }
    if (this.isPromptVisible()) {
      this.refreshPromptView();
    }
  }

  public getViewportHeight(): number {
    return Math.max(
      1,
      this.scrollbox.viewport.height || this.scrollbox.height || this.renderer.height - 2,
    );
  }

  public getMaxScrollTop(): number {
    const measuredRows = this.scrollbox.scrollHeight;
    const mappedRows = this.lineModel.mappedDisplayRowCount;
    const totalRows = Math.max(measuredRows, mappedRows);
    return Math.max(0, totalRows - this.getViewportHeight());
  }

  public resolvePromptComposerLayout(
    target: PromptTarget | null,
    fallbackAnchorLine: number | null,
  ): PromptComposerLayout {
    return resolvePromptComposerLayoutForSelection({
      target,
      fallbackAnchorLine,
      lineModel: this.lineModel,
      cursorLine: this.cursor.cursorLine,
      scrollboxY: this.scrollbox.y,
      scrollTop: this.scrollbox.scrollTop,
      viewportHeight: this.getViewportHeight(),
    });
  }

  public applyLineHighlights(): void {
    const { start: selectionStart, end: selectionEnd } = this.cursor.selectionRange;
    const cursorLine = this.cursor.cursorLine;
    this.visualHighlights.apply(
      this.lineModel.blocks,
      selectionStart,
      selectionEnd,
      cursorLine,
      this.cursor.isVisualModeEnabled,
    );
    this.agentTimeline.applyHighlights(selectionStart, selectionEnd, cursorLine);
  }

  public getAnchorDividerDisplayRow(anchor: { filePath: string; dividerRow: number }): number {
    const divider = this.dividerByFilePath.get(anchor.filePath);
    if (!divider) return anchor.dividerRow;

    const resolved = divider.y - this.scrollbox.content.y;
    if (!Number.isFinite(resolved)) return anchor.dividerRow;
    return Math.max(0, Math.round(resolved));
  }

  private renderFilesModeContent(entries: readonly CodeFileEntry[]): void {
    const rows = this.fileExplorer.buildRows(entries);
    if (rows.length === 0) {
      this.renderEmptyState("No files in tree.");
      this.cursor.configure(0);
      return;
    }

    let nextDisplayRow = 0;
    let nextLineNumber = 1;

    for (const row of rows) {
      const rowDisplayStart = nextDisplayRow;
      const rowResult = this.documentBlocks.addFileTreeRowBlock(row, nextLineNumber, nextDisplayRow);
      nextLineNumber = rowResult.nextLineNumber;
      nextDisplayRow = rowResult.nextDisplayRow;

      if (row.kind === "file") {
        this.lineModel.addFileAnchor({
          line: rowResult.blockStartLine,
          dividerRow: rowDisplayStart,
          filePath: row.filePath,
        });

        const updatesForFile = this.getUpdatesForFile(row.filePath);
        for (const update of updatesForFile) {
          const agentResult = this.agentTimeline.addUpdateWithMessages(
            update,
            nextLineNumber,
            nextDisplayRow,
          );
          nextLineNumber = agentResult.nextLineNumber;
          nextDisplayRow = agentResult.nextDisplayRow;
        }
      }
    }

    this.lineModel.setTotalLines(nextLineNumber - 1);
    this.cursor.configure(this.lineModel.totalLines);
  }

  private renderEmptyState(message: string): void {
    clearChildren(this.scrollbox);
    this.scrollbox.add(
      new TextRenderable(this.renderer, {
        content: message,
        fg: theme.getEmptyStateColor(),
        attributes: TextAttributes.DIM,
      }),
    );
  }

  private captureCursorRestorePoint(): CursorRestorePoint {
    const cursorGlobalLine = this.cursor.cursorLine;
    const cursorInfo = this.lineModel.getVisibleLineInfo(cursorGlobalLine);
    if (!this.cursor.isVisualModeEnabled) {
      return {
        cursorGlobalLine,
        cursorFilePath: cursorInfo?.filePath ?? null,
        cursorFileLine: cursorInfo?.fileLine ?? null,
        visualMode: false,
        anchorGlobalLine: null,
        anchorFilePath: null,
        anchorFileLine: null,
      };
    }

    const { start, end } = this.cursor.selectionRange;
    const anchorGlobalLine = cursorGlobalLine === start ? end : start;
    const anchorInfo = this.lineModel.getVisibleLineInfo(anchorGlobalLine);
    return {
      cursorGlobalLine,
      cursorFilePath: cursorInfo?.filePath ?? null,
      cursorFileLine: cursorInfo?.fileLine ?? null,
      visualMode: true,
      anchorGlobalLine,
      anchorFilePath: anchorInfo?.filePath ?? null,
      anchorFileLine: anchorInfo?.fileLine ?? null,
    };
  }

  private resolveCursorRestoreTarget(restorePoint: CursorRestorePoint): {
    cursorLine: number;
    visualAnchorLine?: number;
  } {
    const cursorLine = this.resolveGlobalLineForRestore(
      restorePoint.cursorGlobalLine,
      restorePoint.cursorFilePath,
      restorePoint.cursorFileLine,
    );
    if (!restorePoint.visualMode) {
      return { cursorLine };
    }

    return {
      cursorLine,
      visualAnchorLine: this.resolveGlobalLineForRestore(
        restorePoint.anchorGlobalLine ?? restorePoint.cursorGlobalLine,
        restorePoint.anchorFilePath,
        restorePoint.anchorFileLine,
      ),
    };
  }

  private resolveGlobalLineForRestore(
    globalLine: number,
    filePath: string | null,
    fileLine: number | null,
  ): number {
    if (filePath && typeof fileLine === "number") {
      const mappedLine = this.lineModel.findGlobalLineForFileLine(filePath, fileLine);
      if (typeof mappedLine === "number") {
        return mappedLine;
      }
    }
    if (this.lineModel.totalLines <= 0) {
      return 1;
    }
    return clamp(globalLine, 1, this.lineModel.totalLines);
  }
}

export function renderTypeChips(options: RenderTypeChipsOptions): number {
  clearChildren(options.chipsRow);

  if (options.sortedTypes.length === 0) {
    return 0;
  }

  const chipLabels = options.sortedTypes.map((type) => `${type} (${options.getTypeCount(type)})`);
  const chipWidths = chipLabels.map((label) => Math.max(1, displayWidth(label) + 2));
  const selectedChipIndex = clampIndex(options.selectedChipIndex, 0, chipWidths.length - 1);
  const viewportWidth = resolveChipsViewportWidth(options);
  const { startIndex, endIndex, hasHiddenLeft, hasHiddenRight } = resolveChipWindow(
    chipWidths,
    viewportWidth,
    selectedChipIndex,
    options.chipWindowStartIndex,
  );

  options.chipsRow.add(createOverflowIndicator(options.renderer, "left", hasHiddenLeft));
  const chipsViewport = new BoxRenderable(options.renderer, {
    flexDirection: "row",
    flexWrap: "no-wrap",
    alignItems: "center",
    gap: CHIP_GAP_WIDTH,
    flexGrow: 1,
  });
  options.chipsRow.add(chipsViewport);

  for (let index = startIndex; index < endIndex; index += 1) {
    const type = options.sortedTypes[index];
    if (!type) continue;
    const enabled = options.isTypeEnabled(type);
    const selected = index === selectedChipIndex;

    const chip = new BoxRenderable(options.renderer, {
      paddingLeft: 1,
      paddingRight: 1,
      backgroundColor: selected
        ? theme.getChipSelectedBackgroundColor(options.chipsFocused)
        : theme.getChipBackgroundColor(enabled),
      onMouseDown: () => {
        options.onChipSelected(index);
        options.onToggleSelectedChip();
      },
    });

    chip.add(
      new TextRenderable(options.renderer, {
        content: chipLabels[index] ?? "",
        fg: theme.getChipTextColor(selected, enabled),
        attributes: selected
          ? TextAttributes.BOLD | TextAttributes.UNDERLINE
          : enabled
            ? TextAttributes.BOLD
            : TextAttributes.DIM,
      }),
    );

    chipsViewport.add(chip);
  }

  options.chipsRow.add(createOverflowIndicator(options.renderer, "right", hasHiddenRight));

  return startIndex;
}

export function computeFilesModeViewportWidth(
  viewportWidth: number,
  scrollboxWidth: number,
  rendererWidth: number,
): number {
  const resolved = resolveViewportWidth(viewportWidth, scrollboxWidth, rendererWidth);
  return Math.max(1, resolved - 1);
}

export function formatCollapsedContentLine(label: string, width: number): string {
  const trimmed = label.trim();
  if (trimmed.length >= width) return trimmed.slice(0, width);
  const remaining = width - trimmed.length;
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return `${" ".repeat(left)}${trimmed}${" ".repeat(right)}`;
}

export function formatAgentUpdateLine(update: AgentUpdate): string {
  const prefix =
    update.status === "running"
      ? "AGENT RUNNING"
      : update.status === "completed"
        ? "AGENT DONE"
        : update.status === "failed"
          ? "AGENT FAILED"
          : "AGENT DRAFT";
  const prompt = update.prompt.trim().length > 0 ? update.prompt : "<type prompt>";
  const variantSuffix = update.variant ? ` · think:${update.variant}` : "";
  const runSuffix = update.runId ? ` · ${update.runId}` : "";
  const errorSuffix = update.error ? ` | error: ${update.error}` : "";
  return `● ${prefix} · ${update.model}${variantSuffix} · ${prompt}${runSuffix}${errorSuffix}`;
}

export function computeAgentContentWidth(
  viewportWidth: number,
  scrollboxWidth: number,
  rendererWidth: number,
  paddingLeft: number,
  paddingRight: number,
): number {
  const resolved = resolveViewportWidth(viewportWidth, scrollboxWidth, rendererWidth);
  return Math.max(8, resolved - Math.max(0, paddingLeft) - Math.max(0, paddingRight));
}

function resolveViewportWidth(viewportWidth: number, scrollboxWidth: number, rendererWidth: number): number {
  if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
    return Math.floor(viewportWidth);
  }
  if (Number.isFinite(scrollboxWidth) && scrollboxWidth > 0) {
    return Math.floor(scrollboxWidth);
  }
  return Math.max(1, Math.floor(rendererWidth));
}

function resolveChipsViewportWidth(options: RenderTypeChipsOptions): number {
  if (typeof options.chipsRow.width === "number" && Number.isFinite(options.chipsRow.width)) {
    const rowWidth = Math.floor(options.chipsRow.width);
    if (rowWidth > 1) return rowWidth;
  }

  const rendererWidth = Math.floor(options.renderer.width);
  if (Number.isFinite(rendererWidth) && rendererWidth > 1) {
    return rendererWidth;
  }

  return Number.MAX_SAFE_INTEGER;
}

function resolveChipWindow(
  chipWidths: readonly number[],
  viewportWidth: number,
  selectedChipIndex: number,
  previousStartIndex: number,
): { startIndex: number; endIndex: number; hasHiddenLeft: boolean; hasHiddenRight: boolean } {
  if (chipWidths.length === 0) {
    return { startIndex: 0, endIndex: 0, hasHiddenLeft: false, hasHiddenRight: false };
  }

  const safeSelectedIndex = clampIndex(selectedChipIndex, 0, chipWidths.length - 1);
  const safeViewportWidth = Math.max(1, Math.floor(viewportWidth));
  const chipsViewportWidth = resolveChipsViewportForWindow(safeViewportWidth);
  if (computeTotalChipWidth(chipWidths) <= chipsViewportWidth) {
    return { startIndex: 0, endIndex: chipWidths.length, hasHiddenLeft: false, hasHiddenRight: false };
  }

  let startIndex = clampIndex(previousStartIndex, 0, chipWidths.length - 1);

  const ensureSelectionVisible = (): void => {
    if (safeSelectedIndex < startIndex) {
      startIndex = safeSelectedIndex;
      return;
    }
    while (safeSelectedIndex >= computeWindowEnd(chipWidths, startIndex, chipsViewportWidth)) {
      if (startIndex >= safeSelectedIndex) break;
      startIndex += 1;
    }
  };

  ensureSelectionVisible();

  const leftTrigger = Math.max(0, Math.floor((chipsViewportWidth - 1) * CHIP_SCROLL_LEFT_TRIGGER_RATIO));
  const rightTrigger = Math.max(
    leftTrigger + 1,
    Math.floor((chipsViewportWidth - 1) * CHIP_SCROLL_RIGHT_TRIGGER_RATIO),
  );
  let cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex);
  while (cursorPosition > rightTrigger && startIndex < safeSelectedIndex) {
    startIndex += 1;
    cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex);
  }

  while (cursorPosition < leftTrigger && startIndex > 0) {
    startIndex -= 1;
    cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex);
  }

  ensureSelectionVisible();
  const endIndex = computeWindowEnd(chipWidths, startIndex, chipsViewportWidth);

  return {
    startIndex,
    endIndex,
    hasHiddenLeft: startIndex > 0,
    hasHiddenRight: endIndex < chipWidths.length,
  };
}

function resolveChipsViewportForWindow(viewportWidth: number): number {
  let available = Math.max(1, Math.floor(viewportWidth));
  available -= computeIndicatorFootprint() * 2;
  return Math.max(1, available);
}

function computeTotalChipWidth(chipWidths: readonly number[]): number {
  if (chipWidths.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < chipWidths.length; index += 1) {
    total += Math.max(1, Math.floor(chipWidths[index] ?? 1));
    if (index > 0) total += 1;
  }
  return total;
}

function computeWindowEnd(chipWidths: readonly number[], startIndex: number, viewportWidth: number): number {
  const safeViewportWidth = Math.max(1, Math.floor(viewportWidth));
  let consumed = 0;
  let index = startIndex;

  while (index < chipWidths.length) {
    const chipWidth = Math.max(1, Math.floor(chipWidths[index] ?? 1));
    const additionalWidth = consumed === 0 ? chipWidth : chipWidth + CHIP_GAP_WIDTH;
    if (consumed > 0 && consumed + additionalWidth > safeViewportWidth) {
      break;
    }
    consumed += additionalWidth;
    index += 1;
    if (consumed >= safeViewportWidth) {
      break;
    }
  }

  return Math.max(startIndex + 1, index);
}

function computeChipCursorPosition(
  chipWidths: readonly number[],
  startIndex: number,
  selectedChipIndex: number,
): number {
  let cursor = 0;
  for (let index = startIndex; index < selectedChipIndex; index += 1) {
    cursor += Math.max(1, Math.floor(chipWidths[index] ?? 1)) + CHIP_GAP_WIDTH;
  }
  const selectedWidth = Math.max(1, Math.floor(chipWidths[selectedChipIndex] ?? 1));
  return cursor + Math.floor(selectedWidth / 2);
}

function computeIndicatorFootprint(): number {
  return computeOverflowIndicatorWidth() + CHIP_GAP_WIDTH;
}

function createOverflowIndicator(
  renderer: CliRenderer,
  direction: "left" | "right",
  visible: boolean,
): TextRenderable {
  const arrow = direction === "left" ? CHIP_OVERFLOW_LEFT_INDICATOR : CHIP_OVERFLOW_RIGHT_INDICATOR;
  const width = computeOverflowIndicatorWidth();
  return new TextRenderable(renderer, {
    content: visible ? arrow : " ".repeat(width),
    fg: CHIP_OVERFLOW_INDICATOR_COLOR,
    attributes: visible ? TextAttributes.BOLD : TextAttributes.NONE,
  });
}

function computeOverflowIndicatorWidth(): number {
  return Math.max(
    displayWidth(CHIP_OVERFLOW_LEFT_INDICATOR),
    displayWidth(CHIP_OVERFLOW_RIGHT_INDICATOR),
  );
}

function clampIndex(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
