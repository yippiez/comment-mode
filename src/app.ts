import {
  BoxRenderable,
  CodeRenderable,
  LineNumberRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { CameraController } from "./camera-controller";
import { CursorController } from "./cursor-controller";
import { LineModel } from "./line-model";
import { syntaxStyle } from "./theme";
import type { CodeFileEntry, FocusMode } from "./types";
import { clamp, clearChildren, makeSlashLine } from "./ui-utils";
import { VisualHighlightController } from "./visual-highlight-controller";

type DiffSegment =
  | { kind: "collapsed"; lineCount: number }
  | { kind: "code"; fileLineStart: number; lineCount: number; content: string };
type ShortcutSection = { title: string; entries: Array<{ keys: string; description: string }> };

export class CodeBrowserApp {
  private static readonly GG_CHORD_TIMEOUT_MS = 500;
  private static readonly SHORTCUTS_SECTIONS: ShortcutSection[] = [
    {
      title: "Global",
      entries: [
        { keys: "?", description: "Toggle this help popup" },
        { keys: "Tab", description: "Switch focus between chips and code" },
        { keys: "Esc / q", description: "Close help popup" },
      ],
    },
    {
      title: "Code",
      entries: [
        { keys: "Up / k", description: "Move cursor up" },
        { keys: "Down / j", description: "Move cursor down" },
        { keys: "PageUp", description: "Move cursor one page up" },
        { keys: "PageDown", description: "Move cursor one page down" },
        { keys: "v", description: "Toggle visual selection mode" },
        { keys: "Esc", description: "Exit visual selection mode" },
        { keys: "gg", description: "Jump to top" },
        { keys: "G", description: "Jump to bottom" },
        { keys: "n", description: "Jump to next file start" },
        { keys: "p", description: "Jump to previous file start" },
        { keys: "c", description: "Toggle collapse current file" },
        { keys: "d", description: "Toggle diff collapse mode" },
      ],
    },
    {
      title: "Chips",
      entries: [
        { keys: "Left/Right", description: "Move selected chip" },
        { keys: "Space/Enter", description: "Toggle selected chip" },
      ],
    },
  ];

  private readonly renderer: CliRenderer;
  private entries: CodeFileEntry[];

  private readonly root: BoxRenderable;
  private readonly chipsRow: BoxRenderable;
  private readonly scrollbox: ScrollBoxRenderable;
  private readonly helpOverlay: BoxRenderable;
  private readonly camera: CameraController;

  private typeCounts: Map<string, number>;
  private sortedTypes: string[];
  private enabledTypes: Map<string, boolean>;

  private selectedChipIndex = 0;
  private focusMode: FocusMode = "code";
  private diffMode = false;
  private helpVisible = false;
  private readonly cursor: CursorController;

  private readonly lineModel = new LineModel();
  private readonly visualHighlights = new VisualHighlightController();
  private dividerByFilePath = new Map<string, TextRenderable>();
  private pendingGChordAt: number | null = null;
  private collapsedFiles = new Set<string>();

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

    this.helpOverlay = new BoxRenderable(renderer, {
      id: "help-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "transparent",
      zIndex: 1000,
      visible: false,
      onMouseDown: () => {
        this.hideHelp();
      },
    });

    const helpPanel = new BoxRenderable(renderer, {
      width: "80%",
      maxWidth: 88,
      border: true,
      borderStyle: "single",
      borderColor: "#9ca3af",
      padding: 1,
      backgroundColor: "#000000",
      flexDirection: "column",
    });

    helpPanel.add(
      new TextRenderable(renderer, {
        content: "Shortcuts",
        fg: "#ffffff",
        attributes: TextAttributes.BOLD,
      }),
    );

    for (const section of CodeBrowserApp.SHORTCUTS_SECTIONS) {
      helpPanel.add(new TextRenderable(renderer, { content: "" }));
      helpPanel.add(
        new TextRenderable(renderer, {
          content: section.title,
          fg: "#ffffff",
          attributes: TextAttributes.BOLD,
        }),
      );

      for (const entry of section.entries) {
        const row = new BoxRenderable(renderer, {
          flexDirection: "row",
          width: "100%",
        });

        row.add(
          new TextRenderable(renderer, {
            content: entry.keys.padEnd(12),
            fg: "#a855f7",
            attributes: TextAttributes.BOLD,
          }),
        );

        row.add(
          new TextRenderable(renderer, {
            content: entry.description,
            fg: "#ffffff",
          }),
        );

        helpPanel.add(row);
      }
    }

    this.helpOverlay.add(helpPanel);

    this.root.add(this.helpOverlay);
    this.renderer.root.add(this.root);
    this.chipsRow.focusable = false;
    this.scrollbox.focusable = false;

    this.camera = new CameraController({
      getViewportHeight: () => this.getViewportHeight(),
      getMaxScrollTop: () => this.getMaxScrollTop(),
      getScrollTop: () => this.scrollbox.scrollTop,
      setScrollTop: (top) => {
        this.scrollbox.scrollTo(top);
      },
      getDisplayRowForLine: (line) => this.lineModel.getDisplayRowForLine(line),
      getLineForDisplayRow: (row, movementDelta) =>
        this.lineModel.findLineForDisplayRow(row, movementDelta),
    });
    this.cursor = new CursorController({
      camera: this.camera,
      onCursorChanged: () => this.applyLineHighlights(),
    });

    this.scrollbox.verticalScrollBar.on("change", (event: { position?: number } | undefined) => {
      const position = event?.position;
      if (typeof position !== "number") return;
      this.cursor.handleExternalScroll(position);
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
    this.pruneCollapsedFiles();
    this.recomputeTypesState();
    this.renderChips();
    this.renderContent();
  }

  private registerKeyboardHandlers(): void {
    this.renderer.keyInput.on("keypress", (key) => {
      const keyName = this.getKeyName(key.name);
      const rawKeyName = key.name;

      if (this.isHelpToggleKey(keyName, rawKeyName, key.shift)) {
        this.consumeKey(key);
        this.toggleHelp();
        return;
      }

      if (this.helpVisible) {
        if (keyName === "escape" || keyName === "q") {
          this.consumeKey(key);
          this.hideHelp();
          return;
        }

        this.consumeKey(key);
        return;
      }

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

      this.handleCodeKeypress(keyName, rawKeyName, key);
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
    if (keyName === "escape") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.cursor.disableVisualMode();
      return;
    }

    if (this.handleVimNavigationKeypress(keyName, rawKeyName, key)) return;

    if (keyName === "up" || keyName === "k") {
      this.consumeKey(key);
      this.cursor.moveBy(-1);
      return;
    }

    if (keyName === "down" || keyName === "j") {
      this.consumeKey(key);
      this.cursor.moveBy(1);
      return;
    }

    if (keyName === "pageup") {
      this.consumeKey(key);
      this.cursor.moveBy(-this.cursor.pageStep());
      this.cursor.goToMinVisibleHeight();
      return;
    }

    if (keyName === "pagedown") {
      this.consumeKey(key);
      this.cursor.moveBy(this.cursor.pageStep());
      this.cursor.goToMaxVisibleHeight();
      return;
    }

    if (keyName === "v") {
      this.consumeKey(key);
      this.cursor.toggleVisualMode();
      return;
    }

    if (keyName === "c") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.toggleCurrentFileCollapse();
      return;
    }

    if (keyName === "d") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.toggleDiffMode();
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
      this.cursor.goToLine(this.lineModel.totalLines, "bottom");
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
        this.cursor.goToLine(1, "top");
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

    if (keyName === "p") {
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

  private isHelpToggleKey(keyName: string, rawKeyName: string | undefined, shift?: boolean): boolean {
    return keyName === "?" || rawKeyName === "?" || (keyName === "/" && Boolean(shift));
  }

  private toggleHelp(): void {
    if (this.helpVisible) {
      this.hideHelp();
      return;
    }
    this.showHelp();
  }

  private showHelp(): void {
    this.helpVisible = true;
    this.helpOverlay.visible = true;
    this.helpOverlay.requestRender();
  }

  private hideHelp(): void {
    this.helpVisible = false;
    this.helpOverlay.visible = false;
    this.helpOverlay.requestRender();
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

  private toggleDiffMode(): void {
    this.diffMode = !this.diffMode;
    this.renderContent();
  }

  private toggleCurrentFileCollapse(): void {
    const currentFilePath = this.lineModel.getCurrentFilePath(this.cursor.cursorLine);
    if (!currentFilePath) return;

    if (this.collapsedFiles.has(currentFilePath)) {
      this.collapsedFiles.delete(currentFilePath);
    } else {
      this.collapsedFiles.add(currentFilePath);
    }

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
    this.lineModel.reset();
    this.visualHighlights.reset();
    this.dividerByFilePath = new Map();

    if (this.entries.length === 0) {
      this.renderEmptyState("No code files found.");
      this.cursor.configure(0);
      return;
    }

    const filteredEntries = this.entries.filter((entry) => this.isTypeEnabled(entry.typeLabel));
    if (filteredEntries.length === 0) {
      this.renderEmptyState("No files for selected types.");
      this.cursor.configure(0);
      return;
    }

    const dividerWidth = Math.max(24, this.renderer.width);
    let nextLineNumber = 1;
    let nextDisplayRow = 0;

    for (const entry of filteredEntries) {
      const dividerRow = nextDisplayRow;
      this.lineModel.markDivider(nextDisplayRow);
      const divider = new TextRenderable(this.renderer, {
        width: "100%",
        overflow: "hidden",
        truncate: true,
        wrapMode: "none",
        content: makeSlashLine(entry.relativePath, dividerWidth),
        fg: "#ffffff",
        bg: "#6b7280",
      });
      this.dividerByFilePath.set(entry.relativePath, divider);
      this.scrollbox.add(divider);
      nextDisplayRow += 1;
      const fileAnchorLine = nextLineNumber;

      if (this.collapsedFiles.has(entry.relativePath)) {
        const result = this.addCollapsedPlaceholderBlock(
          entry,
          entry.lineCount,
          "file",
          dividerWidth,
          nextLineNumber,
          nextDisplayRow,
        );
        nextLineNumber = result.nextLineNumber;
        nextDisplayRow = result.nextDisplayRow;
      } else if (!this.diffMode) {
        const result = this.addCodeBlock(entry, entry.content, 1, entry.lineCount, nextLineNumber, nextDisplayRow);
        nextLineNumber = result.nextLineNumber;
        nextDisplayRow = result.nextDisplayRow;
      } else {
        const segments = this.buildDiffSegments(entry);
        for (const segment of segments) {
          if (segment.kind === "collapsed") {
            const result = this.addCollapsedPlaceholderBlock(
              entry,
              segment.lineCount,
              "diff",
              dividerWidth,
              nextLineNumber,
              nextDisplayRow,
            );
            nextLineNumber = result.nextLineNumber;
            nextDisplayRow = result.nextDisplayRow;
            continue;
          }

          const result = this.addCodeBlock(
            entry,
            segment.content,
            segment.fileLineStart,
            segment.lineCount,
            nextLineNumber,
            nextDisplayRow,
          );
          nextLineNumber = result.nextLineNumber;
          nextDisplayRow = result.nextDisplayRow;
        }
      }

      if (nextLineNumber > fileAnchorLine) {
        this.lineModel.addFileAnchor({ line: fileAnchorLine, dividerRow, filePath: entry.relativePath });
      }
    }

    this.lineModel.setTotalLines(nextLineNumber - 1);
    this.cursor.configure(this.lineModel.totalLines);
  }

  private addCollapsedPlaceholderBlock(
    entry: CodeFileEntry,
    collapsedLineCount: number,
    kind: "file" | "diff",
    dividerWidth: number,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const label =
      kind === "file"
        ? `↑ ${collapsedLineCount} lines collapsed (file) ↓`
        : `↑ ${collapsedLineCount} lines collapsed ↓`;
    const content = this.formatCollapsedContentLine(label, dividerWidth);

    const code = new CodeRenderable(this.renderer, {
      width: "100%",
      content,
      syntaxStyle,
      wrapMode: "none",
      bg: "#374151",
    });

    const lineView = new LineNumberRenderable(this.renderer, {
      width: "100%",
      target: code,
      showLineNumbers: false,
      fg: "#d1d5db",
      bg: "#374151",
    });

    this.scrollbox.add(lineView);
    this.lineModel.addBlock({
      lineView,
      codeView: code,
      defaultLineNumberFg: "#d1d5db",
      defaultLineSigns: new Map(),
      lineStart: nextLineNumber,
      lineCount: 1,
      displayRowStart: nextDisplayRow,
      filePath: entry.relativePath,
    });

    return {
      nextLineNumber: nextLineNumber + 1,
      nextDisplayRow: nextDisplayRow + 1,
      blockStartLine: nextLineNumber,
    };
  }

  private formatCollapsedContentLine(label: string, width: number): string {
    const trimmed = label.trim();
    if (trimmed.length >= width) return trimmed.slice(0, width);
    const remaining = width - trimmed.length;
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    return `${" ".repeat(left)}${trimmed}${" ".repeat(right)}`;
  }

  private addCodeBlock(
    entry: CodeFileEntry,
    content: string,
    fileLineStart: number,
    lineCount: number,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const renderedLineCount = Math.max(1, lineCount);
    const code = new CodeRenderable(this.renderer, {
      width: "100%",
      content,
      filetype: entry.filetype,
      syntaxStyle,
      wrapMode: "none",
      bg: "transparent",
      conceal: false,
    });

    const lineView = new LineNumberRenderable(this.renderer, {
      width: "100%",
      target: code,
      showLineNumbers: true,
      lineNumberOffset: fileLineStart - 1,
      fg: "#e5e7eb",
      bg: "transparent",
    });

    for (let lineOffset = 0; lineOffset < renderedLineCount; lineOffset += 1) {
      const fileLine = fileLineStart + lineOffset;
      if (!entry.uncommittedLines.has(fileLine)) continue;
      lineView.setLineSign(lineOffset, {
        before: "▌",
        beforeColor: "#22c55e",
      });
    }
    const defaultLineSigns = new Map(lineView.getLineSigns());

    this.scrollbox.add(lineView);
    this.lineModel.addBlock({
      lineView,
      codeView: code,
      defaultLineNumberFg: "#e5e7eb",
      defaultLineSigns,
      lineStart: nextLineNumber,
      lineCount: renderedLineCount,
      displayRowStart: nextDisplayRow,
      filePath: entry.relativePath,
    });

    return {
      nextLineNumber: nextLineNumber + renderedLineCount,
      nextDisplayRow: nextDisplayRow + renderedLineCount,
      blockStartLine: nextLineNumber,
    };
  }

  private buildDiffSegments(entry: CodeFileEntry): DiffSegment[] {
    if (entry.lineCount <= 0) return [];
    if (entry.uncommittedLines.size === 0) {
      return [{ kind: "collapsed", lineCount: entry.lineCount }];
    }

    const lines = entry.content.split("\n");
    const segments: DiffSegment[] = [];
    let line = 1;

    while (line <= entry.lineCount) {
      const changed = entry.uncommittedLines.has(line);
      const rangeStart = line;
      while (line <= entry.lineCount && entry.uncommittedLines.has(line) === changed) {
        line += 1;
      }
      const rangeEnd = line - 1;
      const rangeCount = rangeEnd - rangeStart + 1;

      if (!changed) {
        segments.push({ kind: "collapsed", lineCount: rangeCount });
        continue;
      }

      segments.push({
        kind: "code",
        fileLineStart: rangeStart,
        lineCount: rangeCount,
        content: lines.slice(rangeStart - 1, rangeEnd).join("\n"),
      });
    }

    return segments;
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

  private getViewportHeight(): number {
    return Math.max(1, this.scrollbox.viewport.height || this.scrollbox.height || this.renderer.height - 3);
  }

  private getMaxScrollTop(): number {
    const measuredRows = this.scrollbox.scrollHeight;
    const mappedRows = this.lineModel.mappedDisplayRowCount;
    const totalRows = Math.max(measuredRows, mappedRows);
    return Math.max(0, totalRows - this.getViewportHeight());
  }

  private applyLineHighlights(): void {
    const { start: selectionStart, end: selectionEnd } = this.cursor.selectionRange;
    const cursorLine = this.cursor.cursorLine;
    this.visualHighlights.apply(this.lineModel.blocks, selectionStart, selectionEnd, cursorLine);
  }

  private jumpToNextFileStart(): void {
    if (this.lineModel.totalLines <= 0) return;
    const currentAnchorIndex = this.lineModel.findCurrentFileAnchorIndex(this.cursor.cursorLine);
    const target = this.lineModel.getFileAnchor(currentAnchorIndex + 1);
    if (!target) return;
    this.camera.placeDisplayRowAtMinVisibleHeight(this.getAnchorDividerDisplayRow(target), target.line);
    this.cursor.goToLine(target.line, "keep");
  }

  private jumpToPreviousFileStart(): void {
    if (this.lineModel.totalLines <= 0) return;
    const currentAnchorIndex = this.lineModel.findCurrentFileAnchorIndex(this.cursor.cursorLine);
    const currentAnchor = this.lineModel.getFileAnchor(currentAnchorIndex);
    if (!currentAnchor) return;

    const target =
      this.cursor.cursorLine > currentAnchor.line
        ? currentAnchor
        : this.lineModel.getFileAnchor(currentAnchorIndex - 1);
    if (!target) return;
    this.camera.placeDisplayRowAtMinVisibleHeight(this.getAnchorDividerDisplayRow(target), target.line);
    this.cursor.goToLine(target.line, "keep");
  }

  private getAnchorDividerDisplayRow(anchor: { filePath: string; dividerRow: number }): number {
    const divider = this.dividerByFilePath.get(anchor.filePath);
    if (!divider) return anchor.dividerRow;

    const resolved = divider.y - this.scrollbox.content.y;
    if (!Number.isFinite(resolved)) return anchor.dividerRow;
    return Math.max(0, Math.round(resolved));
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

  private pruneCollapsedFiles(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    for (const filePath of this.collapsedFiles) {
      if (existing.has(filePath)) continue;
      this.collapsedFiles.delete(filePath);
    }
  }
}
