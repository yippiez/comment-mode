import {
  BoxRenderable,
  CodeRenderable,
  LineNumberRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { syntaxStyle } from "./theme";
import type { CodeFileEntry, FocusMode, RenderedLineBlock } from "./types";
import { clamp, clearChildren, makeSlashLine } from "./ui-utils";

export class CodeBrowserApp {
  private static readonly GG_CHORD_TIMEOUT_MS = 500;

  private readonly renderer: CliRenderer;
  private entries: CodeFileEntry[];

  private readonly root: BoxRenderable;
  private readonly chipsRow: BoxRenderable;
  private readonly scrollbox: ScrollBoxRenderable;

  private typeCounts: Map<string, number>;
  private sortedTypes: string[];
  private enabledTypes: Map<string, boolean>;

  private selectedChipIndex = 0;
  private focusMode: FocusMode = "code";
  private cursorLine = 1;
  private visualMode = false;
  private visualAnchorLine = 1;

  private renderedLineBlocks: RenderedLineBlock[] = [];
  private lineToDisplayRow: number[] = [0];
  private displayRowToLine: Array<number | undefined> = [];
  private totalVisibleLines = 0;
  private preferredCursorViewportOffset = 0;
  private lastKnownScrollTop = 0;
  private ignoreScrollSync = false;
  private pendingGChordAt: number | null = null;

  constructor(renderer: CliRenderer, entries: CodeFileEntry[]) {
    this.renderer = renderer;
    this.entries = entries;

    this.root = new BoxRenderable(renderer, {
      id: "root",
      flexGrow: 1,
      flexDirection: "column",
    });

    this.chipsRow = new BoxRenderable(renderer, {
      id: "chips",
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 1,
      marginBottom: 1,
    });

    this.scrollbox = new ScrollBoxRenderable(renderer, {
      id: "content",
      flexGrow: 1,
      width: "100%",
      verticalScrollbarOptions: { visible: false },
      horizontalScrollbarOptions: { visible: false },
    });

    this.root.add(this.chipsRow);
    this.root.add(this.scrollbox);
    this.renderer.root.add(this.root);
    this.chipsRow.focusable = false;
    this.scrollbox.focusable = false;

    this.scrollbox.verticalScrollBar.on("change", (event: { position?: number } | undefined) => {
      const position = event?.position;
      if (typeof position !== "number") return;
      this.syncCursorToViewportScroll(position);
    });

    this.typeCounts = new Map();
    this.sortedTypes = [];
    this.enabledTypes = new Map();
    this.recomputeTypesState();
  }

  public start(): void {
    this.renderChips();
    this.renderContent();

    this.registerKeyboardHandlers();
    this.setFocusMode("code");
  }

  public refreshEntries(entries: CodeFileEntry[]): void {
    this.entries = entries;
    this.recomputeTypesState();
    this.renderChips();
    this.renderContent();
  }

  private registerKeyboardHandlers(): void {
    this.renderer.keyInput.on("keypress", (key) => {
      const keyName = this.getKeyName(key.name);

      if (keyName === "tab") {
        this.consumeKey(key);
        this.setFocusMode(this.focusMode === "chips" ? "code" : "chips");
        return;
      }

      if (this.focusMode === "chips") {
        this.pendingGChordAt = null;
        this.handleChipsKeypress(keyName, key);
        return;
      }

      this.handleCodeKeypress(keyName, key.name, key);
    });
  }

  private handleChipsKeypress(
    keyName: string,
    key: { preventDefault?: () => void; stopPropagation?: () => void },
  ): void {
    if (keyName === "left") {
      this.consumeKey(key);
      this.moveChipSelection(-1);
      return;
    }

    if (keyName === "right") {
      this.consumeKey(key);
      this.moveChipSelection(1);
      return;
    }

    if (keyName === "space" || keyName === "return" || keyName === "enter") {
      this.consumeKey(key);
      this.toggleSelectedChip();
    }
  }

  private handleCodeKeypress(
    keyName: string,
    rawKeyName: string | undefined,
    key: { shift?: boolean; preventDefault?: () => void; stopPropagation?: () => void },
  ): void {
    if (this.handleVimNavigationKeypress(keyName, rawKeyName, key)) {
      return;
    }

    if (keyName === "up" || keyName === "k") {
      this.consumeKey(key);
      this.moveCursor(-1);
      return;
    }

    if (keyName === "down" || keyName === "j") {
      this.consumeKey(key);
      this.moveCursor(1);
      return;
    }

    if (keyName === "pageup") {
      this.consumeKey(key);
      this.moveCursor(-this.getPageStep());
      return;
    }

    if (keyName === "pagedown") {
      this.consumeKey(key);
      this.moveCursor(this.getPageStep());
      return;
    }

    if (keyName === "v") {
      this.consumeKey(key);
      this.toggleVisualMode();
    }
  }

  private handleVimNavigationKeypress(
    keyName: string,
    rawKeyName: string | undefined,
    key: { shift?: boolean; preventDefault?: () => void; stopPropagation?: () => void },
  ): boolean {
    const isShiftG = keyName === "g" && (Boolean(key.shift) || rawKeyName === "G");
    if (isShiftG) {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.jumpToBottom();
      return true;
    }

    if (keyName === "g" && !key.shift) {
      this.consumeKey(key);
      const now = Date.now();
      if (
        this.pendingGChordAt !== null &&
        now - this.pendingGChordAt <= CodeBrowserApp.GG_CHORD_TIMEOUT_MS
      ) {
        this.pendingGChordAt = null;
        this.jumpToTop();
      } else {
        this.pendingGChordAt = now;
      }
      return true;
    }

    if (keyName === "n") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.jumpToNextFileStart();
      return true;
    }

    if (keyName === "b") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.jumpToPreviousFileStart();
      return true;
    }

    this.pendingGChordAt = null;
    return false;
  }

  private consumeKey(key: { preventDefault?: () => void; stopPropagation?: () => void }): void {
    key.preventDefault?.();
    key.stopPropagation?.();
  }

  private getKeyName(name: string | undefined): string {
    return (name ?? "").toLowerCase();
  }

  private isTypeEnabled(type: string): boolean {
    return this.enabledTypes.get(type) ?? false;
  }

  private setFocusMode(mode: FocusMode): void {
    this.focusMode = mode;
    this.renderChips();
  }

  private moveChipSelection(delta: number): void {
    if (this.sortedTypes.length === 0) return;
    const nextIndex = this.selectedChipIndex + delta;
    this.selectedChipIndex =
      ((nextIndex % this.sortedTypes.length) + this.sortedTypes.length) % this.sortedTypes.length;
    this.renderChips();
  }

  private toggleSelectedChip(): void {
    if (this.sortedTypes.length === 0) return;
    const selectedType = this.sortedTypes[this.selectedChipIndex];
    if (!selectedType) return;
    this.enabledTypes.set(selectedType, !this.isTypeEnabled(selectedType));
    this.renderChips();
    this.renderContent();
  }

  private renderChips(): void {
    clearChildren(this.chipsRow);

    for (const [index, type] of this.sortedTypes.entries()) {
      const enabled = this.isTypeEnabled(type);
      const selected = index === this.selectedChipIndex;
      const chipsFocused = this.focusMode === "chips";

      const chip = new BoxRenderable(this.renderer, {
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: selected
          ? chipsFocused
            ? "#f3f4f6"
            : "#9ca3af"
          : enabled
            ? "#6b7280"
            : "#1f2937",
        onMouseDown: () => {
          this.selectedChipIndex = index;
          this.setFocusMode("chips");
          this.toggleSelectedChip();
        },
      });

      chip.add(
        new TextRenderable(this.renderer, {
          content: `${type} (${this.typeCounts.get(type) ?? 0})`,
          fg: selected ? "#111827" : enabled ? "#ffffff" : "#9ca3af",
          attributes: selected
            ? TextAttributes.BOLD | TextAttributes.UNDERLINE
            : enabled
              ? TextAttributes.BOLD
              : TextAttributes.DIM,
        }),
      );

      this.chipsRow.add(chip);
    }
  }

  private renderContent(): void {
    clearChildren(this.scrollbox);
    this.renderedLineBlocks = [];
    this.lineToDisplayRow = [0];
    this.displayRowToLine = [];
    this.totalVisibleLines = 0;

    if (this.entries.length === 0) {
      this.renderEmptyState("No code files found.");
      this.clampCursorLine();
      return;
    }

    const filteredEntries = this.entries.filter((entry) => this.isTypeEnabled(entry.typeLabel));
    if (filteredEntries.length === 0) {
      this.renderEmptyState("No files for selected types.");
      this.clampCursorLine();
      return;
    }

    const dividerWidth = Math.max(24, this.renderer.width);
    let nextLineNumber = 1;
    let nextDisplayRow = 0;

    for (const entry of filteredEntries) {
      this.displayRowToLine[nextDisplayRow] = undefined;
      this.scrollbox.add(
        new TextRenderable(this.renderer, {
          content: makeSlashLine(entry.relativePath, dividerWidth),
          fg: "#ffffff",
          bg: "#6b7280",
        }),
      );
      nextDisplayRow += 1;

      const code = new CodeRenderable(this.renderer, {
        width: "100%",
        content: entry.content,
        filetype: entry.filetype,
        syntaxStyle,
        wrapMode: "none",
        bg: "transparent",
        conceal: entry.filetype === "markdown",
      });

      const lineView = new LineNumberRenderable(this.renderer, {
        width: "100%",
        target: code,
        showLineNumbers: true,
        lineNumberOffset: nextLineNumber - 1,
        fg: "#e5e7eb",
        bg: "transparent",
      });

      this.scrollbox.add(lineView);

      this.renderedLineBlocks.push({
        lineView,
        lineStart: nextLineNumber,
        lineEnd: nextLineNumber + entry.lineCount - 1,
      });

      for (let lineOffset = 0; lineOffset < entry.lineCount; lineOffset += 1) {
        const displayRow = nextDisplayRow + lineOffset;
        const lineNumber = nextLineNumber + lineOffset;
        this.lineToDisplayRow[lineNumber] = displayRow;
        this.displayRowToLine[displayRow] = lineNumber;
      }

      nextLineNumber += entry.lineCount;
      nextDisplayRow += entry.lineCount;
    }

    this.totalVisibleLines = nextLineNumber - 1;
    this.clampCursorLine();
    this.applyLineHighlights();
    this.ensureCursorVisible(0);
    this.updatePreferredCursorViewportOffset();
  }

  private renderEmptyState(message: string): void {
    clearChildren(this.scrollbox);
    this.scrollbox.add(
      new TextRenderable(this.renderer, {
        content: message,
        fg: "#9ca3af",
        attributes: TextAttributes.DIM,
      }),
    );
  }

  private clampCursorLine(): void {
    if (this.totalVisibleLines <= 0) {
      this.cursorLine = 1;
      this.visualAnchorLine = 1;
      return;
    }

    this.cursorLine = clamp(this.cursorLine, 1, this.totalVisibleLines);
    this.visualAnchorLine = clamp(this.visualAnchorLine, 1, this.totalVisibleLines);
  }

  private getDisplayRowForLine(globalLine: number): number {
    const directHit = this.lineToDisplayRow[globalLine];
    if (directHit !== undefined) return directHit;
    if (globalLine <= 1) return 0;
    return Math.max(0, this.scrollbox.scrollHeight - 1);
  }

  private getViewportHeight(): number {
    return Math.max(1, this.scrollbox.viewport.height || this.scrollbox.height || this.renderer.height - 3);
  }

  private getPageStep(): number {
    return Math.max(1, this.getViewportHeight() - 1);
  }

  private getMaxScrollTop(): number {
    return Math.max(0, this.scrollbox.scrollHeight - this.getViewportHeight());
  }

  private setScrollTop(nextTop: number): void {
    const bounded = clamp(Math.round(nextTop), 0, this.getMaxScrollTop());
    this.ignoreScrollSync = true;
    try {
      this.scrollbox.scrollTo(bounded);
      this.lastKnownScrollTop = this.scrollbox.scrollTop;
    } finally {
      this.ignoreScrollSync = false;
    }
  }

  private ensureCursorVisible(moveDelta: number): void {
    if (this.totalVisibleLines <= 0) return;

    const row = this.getDisplayRowForLine(this.cursorLine);
    const viewportHeight = this.getViewportHeight();
    const currentTop = this.scrollbox.scrollTop;
    const currentBottom = currentTop + viewportHeight - 1;

    let nextTop = currentTop;
    if (row < currentTop) {
      nextTop = row;
    } else if (row > currentBottom) {
      nextTop = row - viewportHeight + 1;
    } else {
      const topBandOffset = Math.floor(viewportHeight * 0.2);
      const bottomBandOffset = Math.max(topBandOffset, Math.ceil(viewportHeight * 0.8) - 1);
      const minTop = row - bottomBandOffset;
      const maxTop = row - topBandOffset;

      if (moveDelta > 0 && currentTop < minTop) {
        nextTop = minTop;
      } else if (moveDelta < 0 && currentTop > maxTop) {
        nextTop = maxTop;
      }
    }

    this.setScrollTop(nextTop);

    // Final hard guarantee: keep the cursor line inside the viewport even after clamping.
    const finalTop = this.scrollbox.scrollTop;
    const finalBottom = finalTop + viewportHeight - 1;
    if (row < finalTop) {
      this.setScrollTop(row);
    } else if (row > finalBottom) {
      this.setScrollTop(row - viewportHeight + 1);
    }
  }

  private applyLineHighlights(): void {
    for (const block of this.renderedLineBlocks) {
      block.lineView.clearAllLineColors();
    }

    if (this.totalVisibleLines <= 0) return;

    const selectionStart = this.visualMode ? Math.min(this.visualAnchorLine, this.cursorLine) : this.cursorLine;
    const selectionEnd = this.visualMode ? Math.max(this.visualAnchorLine, this.cursorLine) : this.cursorLine;

    for (const block of this.renderedLineBlocks) {
      const overlapStart = Math.max(selectionStart, block.lineStart);
      const overlapEnd = Math.min(selectionEnd, block.lineEnd);
      if (overlapStart > overlapEnd) continue;

      for (let globalLine = overlapStart; globalLine <= overlapEnd; globalLine += 1) {
        const localLine = globalLine - block.lineStart;
        const isCursor = globalLine === this.cursorLine;
        block.lineView.setLineColor(localLine, {
          gutter: isCursor ? "#facc15" : "#f59e0b",
          content: isCursor ? "#facc15" : "#f59e0b",
        });
      }
    }
  }

  private moveCursor(delta: number): void {
    if (this.totalVisibleLines <= 0) return;
    this.cursorLine = clamp(this.cursorLine + delta, 1, this.totalVisibleLines);
    this.applyLineHighlights();
    this.ensureCursorVisible(delta);
    this.updatePreferredCursorViewportOffset();
  }

  private jumpToTop(): void {
    this.setCursorLine(1, "top");
  }

  private jumpToBottom(): void {
    this.setCursorLine(this.totalVisibleLines, "bottom");
  }

  private jumpToNextFileStart(): void {
    if (this.totalVisibleLines <= 0) return;
    const nextBlock = this.renderedLineBlocks.find((block) => block.lineStart > this.cursorLine);
    if (!nextBlock) return;
    this.setCursorLine(nextBlock.lineStart, "auto");
  }

  private jumpToPreviousFileStart(): void {
    if (this.totalVisibleLines <= 0) return;
    let targetLine: number | null = null;
    for (const block of this.renderedLineBlocks) {
      if (block.lineStart >= this.cursorLine) break;
      targetLine = block.lineStart;
    }
    if (targetLine === null) {
      this.setCursorLine(1, "top");
      return;
    }
    this.setCursorLine(targetLine, "auto");
  }

  private setCursorLine(targetLine: number, positionMode: "auto" | "top" | "bottom"): void {
    if (this.totalVisibleLines <= 0) return;
    const previousLine = this.cursorLine;
    this.cursorLine = clamp(targetLine, 1, this.totalVisibleLines);
    this.applyLineHighlights();

    if (positionMode === "top") {
      this.setScrollTop(0);
    } else if (positionMode === "bottom") {
      this.setScrollTop(this.getMaxScrollTop());
    } else {
      this.ensureCursorVisible(this.cursorLine - previousLine);
    }

    this.updatePreferredCursorViewportOffset();
  }

  private toggleVisualMode(): void {
    if (this.totalVisibleLines <= 0) return;
    this.visualMode = !this.visualMode;
    this.visualAnchorLine = this.cursorLine;
    this.applyLineHighlights();
    this.ensureCursorVisible(0);
    this.updatePreferredCursorViewportOffset();
  }

  private syncCursorToViewportScroll(nextTop: number): void {
    if (this.ignoreScrollSync) return;

    const normalizedTop = clamp(Math.round(nextTop), 0, this.getMaxScrollTop());
    const delta = normalizedTop - this.lastKnownScrollTop;
    this.lastKnownScrollTop = normalizedTop;
    if (this.totalVisibleLines <= 0) return;

    const viewportHeight = this.getViewportHeight();
    const targetOffset = clamp(this.preferredCursorViewportOffset, 0, viewportHeight - 1);
    const targetRow = normalizedTop + targetOffset;
    const nextLine = this.findLineForDisplayRow(targetRow, delta);
    if (nextLine === undefined) return;

    if (nextLine !== this.cursorLine) {
      this.cursorLine = clamp(nextLine, 1, this.totalVisibleLines);
      this.applyLineHighlights();
    }

    this.updatePreferredCursorViewportOffset();
  }

  private findLineForDisplayRow(targetRow: number, movementDelta: number): number | undefined {
    if (this.displayRowToLine.length === 0) return undefined;

    const clampedRow = clamp(Math.round(targetRow), 0, this.displayRowToLine.length - 1);
    const exactLine = this.displayRowToLine[clampedRow];
    if (exactLine !== undefined) return exactLine;

    if (movementDelta >= 0) {
      return this.findLineAtOrBelow(clampedRow) ?? this.findLineAtOrAbove(clampedRow);
    }

    return this.findLineAtOrAbove(clampedRow) ?? this.findLineAtOrBelow(clampedRow);
  }

  private findLineAtOrBelow(startRow: number): number | undefined {
    for (let row = startRow; row < this.displayRowToLine.length; row += 1) {
      const line = this.displayRowToLine[row];
      if (line !== undefined) return line;
    }
    return undefined;
  }

  private findLineAtOrAbove(startRow: number): number | undefined {
    for (let row = startRow; row >= 0; row -= 1) {
      const line = this.displayRowToLine[row];
      if (line !== undefined) return line;
    }
    return undefined;
  }

  private updatePreferredCursorViewportOffset(): void {
    if (this.totalVisibleLines <= 0) {
      this.preferredCursorViewportOffset = 0;
      this.lastKnownScrollTop = this.scrollbox.scrollTop;
      return;
    }

    const viewportHeight = this.getViewportHeight();
    const row = this.getDisplayRowForLine(this.cursorLine);
    this.preferredCursorViewportOffset = clamp(row - this.scrollbox.scrollTop, 0, viewportHeight - 1);
    this.lastKnownScrollTop = this.scrollbox.scrollTop;
  }

  private recomputeTypesState(): void {
    const previousEnabled = new Map(this.enabledTypes);

    this.typeCounts = new Map();
    for (const entry of this.entries) {
      this.typeCounts.set(entry.typeLabel, (this.typeCounts.get(entry.typeLabel) ?? 0) + 1);
    }

    this.sortedTypes = [...this.typeCounts.keys()].sort((a, b) => a.localeCompare(b));

    const nextEnabled = new Map<string, boolean>();
    for (const type of this.sortedTypes) {
      nextEnabled.set(type, previousEnabled.get(type) ?? true);
    }
    this.enabledTypes = nextEnabled;

    if (this.sortedTypes.length === 0) {
      this.selectedChipIndex = 0;
      return;
    }

    this.selectedChipIndex = clamp(this.selectedChipIndex, 0, this.sortedTypes.length - 1);
  }
}
