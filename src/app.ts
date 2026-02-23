import {
  BoxRenderable,
  CodeRenderable,
  KeyEvent,
  LineNumberRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { CameraController } from "./camera-controller";
import { AgentController, type AgentSubmission } from "./controllers/agent-controller";
import { ContentLayoutBuilder, type DiffSegment } from "./controllers/content-layout-builder";
import { NavigationController } from "./controllers/navigation-controller";
import {
  PromptController,
  type PromptControllerTarget,
  type PromptSubmission,
} from "./controllers/prompt-controller";
import { createAgentRow, type AgentRowDecoration } from "./components/agent-row";
import { HelpModal } from "./components/help-modal";
import { PromptComposerBar, type PromptComposerLayout } from "./components/prompt-composer-bar";
import { CursorController } from "./cursor-controller";
import { LineModel } from "./line-model";
import { SearchModalController } from "./search-modal";
import type { SearchResult } from "./search-index";
import { CHIPS_KEYMAP, CODE_KEYMAP } from "./shortcuts";
import { AppStateStore } from "./state/app-state";
import { theme } from "./theme";
import type { AgentUpdate, AgentUpdateStatus, CodeFileEntry, FocusMode } from "./types";
import { clamp, clearChildren, makeSlashLine } from "./ui-utils";
import { VisualHighlightController } from "./visual-highlight-controller";
type CodeBrowserAppOptions = {
  rootDir: string;
  initialAgentUpdates?: AgentUpdate[];
  onAgentUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

export class CodeBrowserApp {
  private readonly renderer: CliRenderer;
  private readonly rootDir: string;
  private entries: CodeFileEntry[];
  private readonly state = new AppStateStore();

  private readonly root: BoxRenderable;
  private readonly chipsRow: BoxRenderable;
  private readonly scrollbox: ScrollBoxRenderable;
  private readonly helpModal: HelpModal;
  private readonly searchModal: SearchModalController;
  private readonly promptComposer: PromptComposerBar;
  private readonly camera: CameraController;
  private readonly navigationController: NavigationController;
  private readonly agentController: AgentController;
  private readonly promptController: PromptController;

  private typeCounts: Map<string, number>;
  private sortedTypes: string[];
  private enabledTypes: Map<string, boolean>;

  private readonly cursor: CursorController;

  private readonly lineModel = new LineModel();
  private readonly visualHighlights = new VisualHighlightController();
  private dividerByFilePath = new Map<string, TextRenderable>();
  private collapsedFiles = new Set<string>();
  private agentLineByUpdateId = new Map<string, number>();
  private updateIdByAgentLine = new Map<number, string>();
  private agentRowDecorations = new Map<number, AgentRowDecoration>();

  constructor(renderer: CliRenderer, entries: CodeFileEntry[], options: CodeBrowserAppOptions) {
    this.renderer = renderer;
    this.rootDir = options.rootDir;
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
      onMouseDown: () => {
        this.applyLineHighlights();
      },
    });

    this.root.add(this.chipsRow);
    this.root.add(this.scrollbox);

    this.helpModal = new HelpModal(renderer, {
      onDismiss: () => {
        this.hideHelp();
      },
    });
    this.searchModal = new SearchModalController(renderer, {
      onSelectResult: (result) => {
        this.jumpToSearchResult(result);
      },
      onClose: () => {
        this.setFocusMode("code");
      },
    });
    this.promptComposer = new PromptComposerBar(renderer);

    this.root.add(this.helpModal.renderable);
    this.root.add(this.searchModal.renderable);
    this.root.add(this.promptComposer.renderable);
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
      onCursorChanged: () => {
        this.applyLineHighlights();
        if (this.promptController.isVisible) {
          this.promptController.refreshView();
        }
      },
    });

    this.agentController = new AgentController({
      rootDir: this.rootDir,
      initialUpdates: options.initialAgentUpdates ?? [],
      onUpdatesChanged: options.onAgentUpdatesChanged,
      onRenderRequested: () => this.renderContent(),
    });

    this.promptController = new PromptController({
      rootDir: this.rootDir,
      promptComposer: this.promptComposer,
      onSubmission: async (submission) => this.handlePromptSubmission(submission),
      onFocusModeChange: (focusMode) => this.setFocusMode(focusMode),
      resolveLayout: (target, fallbackAnchorLine) =>
        this.resolvePromptComposerLayout(target, fallbackAnchorLine),
    });

    this.navigationController = new NavigationController({
      cursor: this.cursor,
      camera: this.camera,
      lineModel: this.lineModel,
      getAgentPromptLines: () => [...this.agentLineByUpdateId.values()],
      getAnchorDividerDisplayRow: (anchor) => this.getAnchorDividerDisplayRow(anchor),
      onDeleteCurrentAgentPrompt: () => this.deleteCurrentAgentPrompt(),
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
    this.applyTheme();
  }

  public start(): void {
    this.pruneAgentUpdates();
    this.searchModal.setEntries(this.entries);
    this.renderChips();
    this.renderContent();
    this.registerKeyboardHandlers();
    this.setFocusMode("code");
    this.promptController.start();
  }

  public refreshEntries(entries: CodeFileEntry[]): void {
    this.entries = entries;
    this.pruneCollapsedFiles();
    this.pruneAgentUpdates();
    this.searchModal.setEntries(this.entries);
    this.recomputeTypesState();
    this.renderChips();
    this.renderContent();
  }

  public getAgentUpdates(): AgentUpdate[] {
    return this.agentController.getUpdates();
  }

  public shutdown(): void {
    this.agentController.shutdown();
    if (this.promptController.isVisible) {
      this.promptController.close();
    }
    this.searchModal.shutdown();
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

      if (keyName === "t" && !this.promptController.isVisible && !this.searchModal.isVisible) {
        this.consumeKey(key);
        this.toggleTheme();
        return;
      }

      if (this.state.helpVisible) {
        if (keyName === "escape" || keyName === "q") {
          this.consumeKey(key);
          this.hideHelp();
          return;
        }

        this.consumeKey(key);
        return;
      }

      if (this.promptController.isVisible) {
        this.promptController.handleKeypress(keyName, rawKeyName, key, (event) =>
          this.consumeKey(event),
        );
        return;
      }

      if (this.searchModal.isVisible) {
        this.searchModal.handleKeypress(keyName, key, (event) => this.consumeKey(event));
        if (!this.searchModal.isVisible) {
          this.setFocusMode("code");
        }
        return;
      }

      if (this.isSearchOpenKey(keyName, rawKeyName, key)) {
        this.consumeKey(key);
        this.navigationController.resetChordState();
        this.openSearchModal();
        return;
      }

      if (keyName === "tab") {
        this.consumeKey(key);
        this.setFocusMode(this.state.focusMode === "chips" ? "code" : "chips");
        return;
      }

      if (this.state.focusMode === "chips") {
        this.navigationController.resetChordState();
        this.handleChipsKeypress(keyName, key);
        return;
      }

      this.handleCodeKeypress(keyName, rawKeyName, key);
    });
  }

  private handleChipsKeypress(keyName: string, key: KeyEvent): void {
    const action = CHIPS_KEYMAP[keyName];
    if (action === "move_left") {
      this.consumeKey(key);
      this.moveChipSelection(-1);
      return;
    }

    if (action === "move_right") {
      this.consumeKey(key);
      this.moveChipSelection(1);
      return;
    }

    if (action === "toggle_chip") {
      this.consumeKey(key);
      this.toggleSelectedChip();
    }
  }

  private handleCodeKeypress(
    keyName: string,
    rawKeyName: string | undefined,
    key: KeyEvent,
  ): void {
    const mappedAction = CODE_KEYMAP[keyName];

    if (mappedAction === "escape_visual") {
      this.consumeKey(key);
      this.navigationController.resetChordState();
      this.cursor.disableVisualMode();
      return;
    }

    if (this.handleAgentRowKeypress(keyName, key)) {
      this.navigationController.resetChordState();
      return;
    }

    if (mappedAction === "open_prompt") {
      this.consumeKey(key);
      this.navigationController.resetChordState();
      void this.handleEnterOnCodeView();
      return;
    }

    const navigationResult = this.navigationController.handleVimNavigationKeypress(
      keyName,
      rawKeyName,
      key,
      (event) => this.consumeKey(event),
    );
    if (navigationResult.handled) return;

    if (mappedAction === "move_up") {
      if (this.navigationController.shouldThrottleRepeatedMove(key)) {
        this.consumeKey(key);
        return;
      }
      this.consumeKey(key);
      this.cursor.moveBy(-1);
      return;
    }

    if (mappedAction === "move_down") {
      if (this.navigationController.shouldThrottleRepeatedMove(key)) {
        this.consumeKey(key);
        return;
      }
      this.consumeKey(key);
      this.cursor.moveBy(1);
      return;
    }

    if (mappedAction === "page_up") {
      this.consumeKey(key);
      this.cursor.moveBy(-this.cursor.pageStep());
      this.cursor.goToMinVisibleHeight();
      return;
    }

    if (mappedAction === "page_down") {
      this.consumeKey(key);
      this.cursor.moveBy(this.cursor.pageStep());
      this.cursor.goToMaxVisibleHeight();
      return;
    }

    if (mappedAction === "toggle_visual") {
      this.consumeKey(key);
      this.cursor.toggleVisualMode();
      return;
    }

    if (mappedAction === "collapse_file") {
      this.consumeKey(key);
      this.navigationController.resetChordState();
      this.toggleCurrentFileCollapse();
      return;
    }

    if (mappedAction === "toggle_diff") {
      this.consumeKey(key);
      this.navigationController.resetChordState();
      this.toggleDiffMode();
      return;
    }

    if (mappedAction === "quit") {
      this.consumeKey(key);
      this.renderer.destroy();
      return;
    }

  }

  private handleAgentRowKeypress(keyName: string, key: KeyEvent): boolean {
    const update = this.getAgentUpdateAtCursorLine();
    if (!update) return false;

    if (keyName === "delete") {
      this.consumeKey(key);
      this.agentController.remove(update.id);
      return true;
    }

    return false;
  }

  private async handleEnterOnCodeView(): Promise<void> {
    const update = this.getAgentUpdateAtCursorLine();
    if (update) {
      const anchorLine =
        this.lineModel.findGlobalLineForFileLine(update.filePath, update.selectionEndFileLine) ??
        this.cursor.cursorLine;
      this.promptController.open({
        updateId: update.id,
        filePath: update.filePath,
        selectionStartFileLine: update.selectionStartFileLine,
        selectionEndFileLine: update.selectionEndFileLine,
        anchorLine,
        selectedText: update.selectedText,
        prompt: update.prompt,
        model: update.model,
        thinkingLevel: update.variant,
      });
      return;
    }

    const target = this.createPromptTargetFromSelection();
    if (!target) return;
    this.promptController.open(target);
  }

  /** Builds a prompt target payload from current visual selection in active file. */
  private createPromptTargetFromSelection(): PromptControllerTarget | null {
    if (this.lineModel.totalLines <= 0) return null;
    const currentFilePath = this.lineModel.getCurrentFilePath(this.cursor.cursorLine);
    if (!currentFilePath) return null;

    const { start, end } = this.cursor.selectionRange;
    const selectedLines: string[] = [];
    let selectionStartFileLine: number | null = null;
    let selectionEndFileLine: number | null = null;
    let selectionEndGlobalLine: number | null = null;

    for (let globalLine = start; globalLine <= end; globalLine += 1) {
      const lineInfo = this.lineModel.getVisibleLineInfo(globalLine);
      if (!lineInfo) continue;
      if (lineInfo.filePath !== currentFilePath) continue;
      if (lineInfo.blockKind !== "code") continue;
      if (lineInfo.fileLine === null) continue;

      selectionStartFileLine = selectionStartFileLine ?? lineInfo.fileLine;
      selectionEndFileLine = lineInfo.fileLine;
      selectionEndGlobalLine = globalLine;
      selectedLines.push(lineInfo.text);
    }

    if (selectionStartFileLine === null || selectionEndFileLine === null) return null;

    return {
      filePath: currentFilePath,
      selectionStartFileLine,
      selectionEndFileLine,
      anchorLine: selectionEndGlobalLine ?? this.cursor.cursorLine,
      selectedText: selectedLines.join("\n"),
      prompt: "",
      model: "opencode/big-pickle",
    };
  }

  /** Persists prompt submission, triggers run, and restores cursor on created agent row. */
  private async handlePromptSubmission(submission: PromptSubmission): Promise<void> {
    const upsertPayload: AgentSubmission = {
      updateId: submission.updateId,
      filePath: submission.filePath,
      selectionStartFileLine: submission.selectionStartFileLine,
      selectionEndFileLine: submission.selectionEndFileLine,
      selectedText: submission.selectedText,
      prompt: submission.prompt,
      model: submission.model,
      thinkingLevel: submission.thinkingLevel,
    };
    const update = this.agentController.upsertFromSubmission(upsertPayload);
    this.cursor.disableVisualMode();
    this.renderContent();
    await this.agentController.launch(update);
    const targetLine = this.agentLineByUpdateId.get(update.id);
    if (typeof targetLine === "number") {
      this.cursor.goToLine(targetLine, "keep");
    }
  }

  private getAgentUpdateAtCursorLine(): AgentUpdate | undefined {
    return this.agentController.findByRenderedLine(this.cursor.cursorLine, this.updateIdByAgentLine);
  }

  private openSearchModal(): void {
    this.searchModal.open();
    this.setFocusMode("search");
  }

  private closeSearchModal(): void {
    if (!this.searchModal.isVisible) return;
    this.searchModal.close();
    this.setFocusMode("code");
  }

  private jumpToSearchResult(result: SearchResult): void {
    this.ensureSearchResultVisible(result);

    const targetLine =
      result.kind === "file"
        ? this.lineModel.getFileAnchorByPath(result.filePath)?.line
        : this.lineModel.findGlobalLineForFileLine(result.filePath, result.fileLine) ??
          this.lineModel.getFileAnchorByPath(result.filePath)?.line;
    if (!targetLine) return;

    this.cursor.disableVisualMode();
    this.cursor.goToLineAtMinVisibleHeight(targetLine);
  }

  private ensureSearchResultVisible(result: SearchResult): void {
    const entry = this.entries.find((item) => item.relativePath === result.filePath);
    if (!entry) return;

    let requiresRerender = false;
    if (!this.isTypeEnabled(entry.typeLabel)) {
      this.enabledTypes.set(entry.typeLabel, true);
      requiresRerender = true;
    }

    if (this.collapsedFiles.has(entry.relativePath)) {
      this.collapsedFiles.delete(entry.relativePath);
      requiresRerender = true;
    }

    if (this.state.diffMode && result.kind !== "file") {
      this.state.diffMode = false;
      requiresRerender = true;
    }

    if (!requiresRerender) return;
    this.renderChips();
    this.renderContent();
  }

  private consumeKey(key: KeyEvent): void {
    key.preventDefault?.();
    key.stopPropagation?.();
  }

  private getKeyName(name: string | undefined): string {
    return (name ?? "").toLowerCase();
  }

  private isHelpToggleKey(keyName: string, rawKeyName: string | undefined, shift?: boolean): boolean {
    return keyName === "?" || rawKeyName === "?" || (keyName === "/" && Boolean(shift));
  }

  private isSearchOpenKey(
    keyName: string,
    rawKeyName: string | undefined,
    key: KeyEvent,
  ): boolean {
    if (key.ctrl || key.meta || key.option) return false;
    if (keyName === "s" || rawKeyName === "s" || rawKeyName === "S") return true;
    return key.sequence === "s" || key.sequence === "S";
  }

  private toggleHelp(): void {
    if (this.state.helpVisible) {
      this.hideHelp();
      return;
    }
    if (this.searchModal.isVisible) {
      this.closeSearchModal();
    }
    if (this.promptController.isVisible) {
      this.promptController.close();
    }
    this.showHelp();
  }

  private showHelp(): void {
    this.state.helpVisible = true;
    this.helpModal.show();
  }

  private hideHelp(): void {
    this.state.helpVisible = false;
    this.helpModal.hide();
  }

  private isTypeEnabled(type: string): boolean {
    return this.enabledTypes.get(type) ?? false;
  }

  private setFocusMode(mode: FocusMode): void {
    this.state.focusMode = mode;
    this.renderChips();
  }

  private moveChipSelection(delta: number): void {
    if (this.sortedTypes.length === 0) return;
    const nextIndex = this.state.selectedChipIndex + delta;
    this.state.selectedChipIndex =
      ((nextIndex % this.sortedTypes.length) + this.sortedTypes.length) % this.sortedTypes.length;
    this.renderChips();
  }

  private toggleSelectedChip(): void {
    if (this.sortedTypes.length === 0) return;
    const selectedType = this.sortedTypes[this.state.selectedChipIndex];
    if (!selectedType) return;
    this.enabledTypes.set(selectedType, !this.isTypeEnabled(selectedType));
    this.renderChips();
    this.renderContent();
  }

  private toggleDiffMode(): void {
    this.state.diffMode = !this.state.diffMode;
    this.renderContent();
  }

  /** Cycles to next theme and re-renders themed UI surfaces. */
  private toggleTheme(): void {
    theme.toggleTheme();
    this.applyTheme();
    this.renderChips();
    this.renderContent();
  }

  /** Applies active theme colors to always-mounted UI containers and overlays. */
  private applyTheme(): void {
    this.root.backgroundColor = theme.getBackgroundColor();
    this.chipsRow.backgroundColor = theme.getBackgroundColor();
    this.scrollbox.backgroundColor = theme.getBackgroundColor();
    this.helpModal.applyTheme();
    this.searchModal.applyTheme();
    this.promptComposer.applyTheme();
    this.root.requestRender();
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
      const selected = index === this.state.selectedChipIndex;
      const chipsFocused = this.state.focusMode === "chips";

      const chip = new BoxRenderable(this.renderer, {
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: selected
          ? theme.getChipSelectedBackgroundColor(chipsFocused)
          : theme.getChipBackgroundColor(enabled),
        onMouseDown: () => {
          this.state.selectedChipIndex = index;
          this.setFocusMode("chips");
          this.toggleSelectedChip();
        },
      });

      chip.add(
        new TextRenderable(this.renderer, {
          content: `${type} (${this.typeCounts.get(type) ?? 0})`,
          fg: theme.getChipTextColor(selected, enabled),
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
    this.agentLineByUpdateId = new Map();
    this.updateIdByAgentLine = new Map();
    this.agentRowDecorations = new Map();

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

      if (this.collapsedFiles.has(entry.relativePath)) {
        const result = this.addCollapsedPlaceholderBlock(
          entry,
          entry.lineCount,
          "file",
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
          const agentResult = this.addAgentUpdateWithMessages(update, nextLineNumber, nextDisplayRow);
          nextLineNumber = agentResult.nextLineNumber;
          nextDisplayRow = agentResult.nextDisplayRow;
          nextUpdateIndex += 1;
        }
      } else if (!this.state.diffMode) {
        const sourceLines = entry.content.split("\n");
        let fileLineCursor = 1;
        while (nextUpdateIndex < updatesForFile.length) {
          const update = updatesForFile[nextUpdateIndex];
          if (!update) break;
          const anchorLine = clamp(update.selectionEndFileLine, 1, Math.max(1, entry.lineCount));
          if (anchorLine >= fileLineCursor) {
            const chunkLines = sourceLines.slice(fileLineCursor - 1, anchorLine);
            const result = this.addCodeBlock(
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

          const agentResult = this.addAgentUpdateWithMessages(update, nextLineNumber, nextDisplayRow);
          nextLineNumber = agentResult.nextLineNumber;
          nextDisplayRow = agentResult.nextDisplayRow;
          nextUpdateIndex += 1;
        }

        if (fileLineCursor <= entry.lineCount) {
          const chunkLines = sourceLines.slice(fileLineCursor - 1);
          const result = this.addCodeBlock(
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
      } else {
        const segments = this.buildDiffSegments(entry);
        for (const segment of segments) {
          const segmentEndLine = segment.fileLineStart + segment.lineCount - 1;
          while (nextUpdateIndex < updatesForFile.length) {
            const update = updatesForFile[nextUpdateIndex];
            if (!update) break;
            if (update.selectionEndFileLine >= segment.fileLineStart) break;
            const agentResult = this.addAgentUpdateWithMessages(update, nextLineNumber, nextDisplayRow);
            nextLineNumber = agentResult.nextLineNumber;
            nextDisplayRow = agentResult.nextDisplayRow;
            nextUpdateIndex += 1;
          }

          if (segment.kind === "collapsed") {
            const result = this.addCollapsedPlaceholderBlock(
              entry,
              segment.lineCount,
              "diff",
              dividerWidth,
              segment.fileLineStart,
              nextLineNumber,
              nextDisplayRow,
            );
            nextLineNumber = result.nextLineNumber;
            nextDisplayRow = result.nextDisplayRow;
            while (nextUpdateIndex < updatesForFile.length) {
              const update = updatesForFile[nextUpdateIndex];
              if (!update) break;
              if (update.selectionEndFileLine > segmentEndLine) break;
              const agentResult = this.addAgentUpdateWithMessages(update, nextLineNumber, nextDisplayRow);
              nextLineNumber = agentResult.nextLineNumber;
              nextDisplayRow = agentResult.nextDisplayRow;
              nextUpdateIndex += 1;
            }
            continue;
          }

          const segmentLines = segment.content.split("\n");
          let fileLineCursor = segment.fileLineStart;
          while (nextUpdateIndex < updatesForFile.length) {
            const update = updatesForFile[nextUpdateIndex];
            if (!update) break;
            if (update.selectionEndFileLine > segmentEndLine) break;

            if (update.selectionEndFileLine >= fileLineCursor) {
              const localEnd = update.selectionEndFileLine - segment.fileLineStart + 1;
              const localStart = fileLineCursor - segment.fileLineStart;
              const chunkLines = segmentLines.slice(localStart, localEnd);
              const result = this.addCodeBlock(
                entry,
                chunkLines.join("\n"),
                fileLineCursor,
                chunkLines.length,
                nextLineNumber,
                nextDisplayRow,
              );
              nextLineNumber = result.nextLineNumber;
              nextDisplayRow = result.nextDisplayRow;
              fileLineCursor = update.selectionEndFileLine + 1;
            }

            const agentResult = this.addAgentUpdateWithMessages(update, nextLineNumber, nextDisplayRow);
            nextLineNumber = agentResult.nextLineNumber;
            nextDisplayRow = agentResult.nextDisplayRow;
            nextUpdateIndex += 1;
          }

          if (fileLineCursor <= segmentEndLine) {
            const localStart = fileLineCursor - segment.fileLineStart;
            const chunkLines = segmentLines.slice(localStart);
            const result = this.addCodeBlock(
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
          const agentResult = this.addAgentUpdateWithMessages(update, nextLineNumber, nextDisplayRow);
          nextLineNumber = agentResult.nextLineNumber;
          nextDisplayRow = agentResult.nextDisplayRow;
          nextUpdateIndex += 1;
        }
      }

      if (nextLineNumber > fileAnchorLine) {
        this.lineModel.addFileAnchor({ line: fileAnchorLine, dividerRow, filePath: entry.relativePath });
      }
    }

    this.lineModel.setTotalLines(nextLineNumber - 1);
    this.cursor.configure(this.lineModel.totalLines);
    if (this.promptController.isVisible) {
      this.promptController.refreshView();
    }
  }

  private addCollapsedPlaceholderBlock(
    entry: CodeFileEntry,
    collapsedLineCount: number,
    kind: "file" | "diff",
    dividerWidth: number,
    fileLineStart: number,
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
      syntaxStyle: theme.getSyntaxStyle(),
      wrapMode: "none",
      bg: theme.getCollapsedBackgroundColor(),
    });
    code.selectable = false;

    const lineView = new LineNumberRenderable(this.renderer, {
      width: "100%",
      target: code,
      showLineNumbers: false,
      fg: theme.getCollapsedForegroundColor(),
      bg: theme.getCollapsedBackgroundColor(),
    });
    lineView.selectable = false;

    this.scrollbox.add(lineView);
    this.lineModel.addBlock({
      lineView,
      codeView: code,
      defaultLineNumberFg: theme.getCollapsedForegroundColor(),
      defaultLineSigns: new Map(),
      blockKind: "collapsed",
      fileLineStart,
      renderedLines: [content],
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
    const renderedLines = content.split("\n");
    const code = new CodeRenderable(this.renderer, {
      width: "100%",
      content,
      filetype: entry.filetype,
      syntaxStyle: theme.getSyntaxStyle(),
      wrapMode: "none",
      bg: theme.getTransparentColor(),
      conceal: false,
    });
    code.selectable = false;

    const lineView = new LineNumberRenderable(this.renderer, {
      width: "100%",
      target: code,
      showLineNumbers: true,
      lineNumberOffset: fileLineStart - 1,
      fg: theme.getCodeLineNumberColor(),
      bg: theme.getTransparentColor(),
    });
    lineView.selectable = false;

    for (let lineOffset = 0; lineOffset < renderedLineCount; lineOffset += 1) {
      const fileLine = fileLineStart + lineOffset;
      if (!entry.uncommittedLines.has(fileLine)) continue;
      lineView.setLineSign(lineOffset, {
        before: "▌",
        beforeColor: theme.getUncommittedLineSignColor(),
      });
    }
    const defaultLineSigns = new Map(lineView.getLineSigns());

    this.scrollbox.add(lineView);
    this.lineModel.addBlock({
      lineView,
      codeView: code,
      defaultLineNumberFg: theme.getCodeLineNumberColor(),
      defaultLineSigns,
      blockKind: "code",
      fileLineStart,
      renderedLines,
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

  private addAgentUpdateBlock(
    update: AgentUpdate,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const content = this.formatAgentUpdateLine(update);
    const decoration = createAgentRow(this.renderer, {
      content,
      baseBg: this.getAgentStatusBg(update.status),
      baseFg: theme.getAgentRowForegroundColor(),
      selectedBg: theme.getAgentRowSelectedBackgroundColor(),
      selectedFg: theme.getAgentRowSelectedForegroundColor(),
      cursorBg: theme.getAgentRowCursorBackgroundColor(),
      cursorFg: theme.getAgentRowCursorForegroundColor(),
      paddingLeft: 1,
      paddingRight: 1,
      bold: true,
    });

    this.scrollbox.add(decoration.row);
    this.lineModel.addBlock({
      lineView: null,
      codeView: null,
      defaultLineNumberFg: theme.getAgentRowForegroundColor(),
      defaultLineSigns: new Map(),
      blockKind: "agent",
      fileLineStart: update.selectionEndFileLine,
      renderedLines: [content],
      lineStart: nextLineNumber,
      lineCount: 1,
      displayRowStart: nextDisplayRow,
      filePath: update.filePath,
    });

    this.agentLineByUpdateId.set(update.id, nextLineNumber);
    this.updateIdByAgentLine.set(nextLineNumber, update.id);
    this.agentRowDecorations.set(nextLineNumber, decoration);
    return {
      nextLineNumber: nextLineNumber + 1,
      nextDisplayRow: nextDisplayRow + 1,
      blockStartLine: nextLineNumber,
    };
  }

  private addAgentUpdateWithMessages(
    update: AgentUpdate,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const main = this.addAgentUpdateBlock(update, nextLineNumber, nextDisplayRow);
    return this.addAgentMessageBlocks(update, main.nextLineNumber, main.nextDisplayRow);
  }

  private addAgentMessageBlocks(
    update: AgentUpdate,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const recentMessages = update.messages.slice(-3);
    if (recentMessages.length === 0) {
      return {
        nextLineNumber,
        nextDisplayRow,
        blockStartLine: nextLineNumber,
      };
    }

    let lineCursor = nextLineNumber;
    let rowCursor = nextDisplayRow;
    let blockStartLine = nextLineNumber;
    for (const message of recentMessages) {
      const result = this.addAgentMessageBlock(update, message, lineCursor, rowCursor);
      lineCursor = result.nextLineNumber;
      rowCursor = result.nextDisplayRow;
      blockStartLine = result.blockStartLine;
    }

    return {
      nextLineNumber: lineCursor,
      nextDisplayRow: rowCursor,
      blockStartLine,
    };
  }

  private addAgentMessageBlock(
    update: AgentUpdate,
    message: string,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const content = ` ${message}`;
    const decoration = createAgentRow(this.renderer, {
      content,
      baseBg: theme.getAgentMessageBackgroundColor(),
      baseFg: theme.getAgentMessageForegroundColor(),
      selectedBg: theme.getAgentRowSelectedBackgroundColor(),
      selectedFg: theme.getAgentRowSelectedForegroundColor(),
      cursorBg: theme.getAgentRowCursorBackgroundColor(),
      cursorFg: theme.getAgentRowCursorForegroundColor(),
      paddingLeft: 2,
      paddingRight: 1,
    });

    this.scrollbox.add(decoration.row);
    this.lineModel.addBlock({
      lineView: null,
      codeView: null,
      defaultLineNumberFg: theme.getAgentMessageForegroundColor(),
      defaultLineSigns: new Map(),
      blockKind: "agent",
      fileLineStart: update.selectionEndFileLine,
      renderedLines: [content],
      lineStart: nextLineNumber,
      lineCount: 1,
      displayRowStart: nextDisplayRow,
      filePath: update.filePath,
    });
    this.updateIdByAgentLine.set(nextLineNumber, update.id);
    this.agentRowDecorations.set(nextLineNumber, decoration);

    return {
      nextLineNumber: nextLineNumber + 1,
      nextDisplayRow: nextDisplayRow + 1,
      blockStartLine: nextLineNumber,
    };
  }

  private formatAgentUpdateLine(update: AgentUpdate): string {
    const prefix =
      update.status === "running"
        ? "AGENT RUNNING"
        : update.status === "completed"
          ? "AGENT DONE"
        : update.status === "failed"
          ? "AGENT FAILED"
          : "AGENT DRAFT";
    const prompt = update.prompt.trim().length > 0 ? update.prompt : "<type prompt>";
    const truncatedPrompt = prompt.length > 88 ? `${prompt.slice(0, 88)}…` : prompt;
    const variantSuffix = update.variant ? ` · think:${update.variant}` : "";
    const runSuffix = update.runId ? ` · ${update.runId}` : "";
    const errorSuffix = update.error ? ` | error: ${update.error}` : "";
    return `● ${prefix} · ${update.model}${variantSuffix} · ${truncatedPrompt}${runSuffix}${errorSuffix}`;
  }

  private getAgentStatusBg(status: AgentUpdateStatus): string {
    return theme.getAgentStatusBackgroundColor(status);
  }

  private getUpdatesForFile(filePath: string): AgentUpdate[] {
    return ContentLayoutBuilder.getUpdatesForFile(this.agentController.getMutableUpdates(), filePath);
  }

  private buildDiffSegments(entry: CodeFileEntry): DiffSegment[] {
    return ContentLayoutBuilder.buildDiffSegments(entry);
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

  private getViewportHeight(): number {
    return Math.max(1, this.scrollbox.viewport.height || this.scrollbox.height || this.renderer.height - 3);
  }

  private getMaxScrollTop(): number {
    const measuredRows = this.scrollbox.scrollHeight;
    const mappedRows = this.lineModel.mappedDisplayRowCount;
    const totalRows = Math.max(measuredRows, mappedRows);
    return Math.max(0, totalRows - this.getViewportHeight());
  }

  /** Computes absolute prompt-overlay layout anchored below selected content line. */
  private resolvePromptComposerLayout(
    target: PromptControllerTarget | null,
    fallbackAnchorLine: number | null,
  ): PromptComposerLayout {
    const viewportTop = Math.max(0, this.scrollbox.y);
    const viewportHeight = this.getViewportHeight();
    const viewportBottom = viewportTop + viewportHeight - 1;
    const anchorLine = this.resolvePromptAnchorLine(target, fallbackAnchorLine);
    const anchorDisplayRow = this.lineModel.getDisplayRowForLine(anchorLine);
    const rowInViewport = anchorDisplayRow - this.scrollbox.scrollTop;
    const desiredTop = viewportTop + rowInViewport + 1;
    const top = clamp(desiredTop, viewportTop, viewportBottom);
    return {
      top,
      maxHeight: Math.max(1, viewportBottom - top + 1),
    };
  }

  /** Resolves best anchor line for prompt overlay using target selection and fallback cursor. */
  private resolvePromptAnchorLine(
    target: PromptControllerTarget | null,
    fallbackAnchorLine: number | null,
  ): number {
    if (target) {
      const visibleLine = this.lineModel.findGlobalLineForFileLine(
        target.filePath,
        target.selectionEndFileLine,
      );
      if (typeof visibleLine === "number") {
        return visibleLine;
      }
    }

    if (this.lineModel.totalLines <= 0) return 1;
    const fallback = fallbackAnchorLine ?? this.cursor.cursorLine;
    return clamp(fallback, 1, this.lineModel.totalLines);
  }

  private applyLineHighlights(): void {
    const { start: selectionStart, end: selectionEnd } = this.cursor.selectionRange;
    const cursorLine = this.cursor.cursorLine;
    this.visualHighlights.apply(this.lineModel.blocks, selectionStart, selectionEnd, cursorLine);
    this.applyAgentRowHighlights(selectionStart, selectionEnd, cursorLine);
  }

  private applyAgentRowHighlights(selectionStart: number, selectionEnd: number, cursorLine: number): void {
    for (const [line, decoration] of this.agentRowDecorations.entries()) {
      let bg = decoration.baseBg;
      let fg = decoration.baseFg;
      if (line === cursorLine) {
        bg = decoration.cursorBg;
        fg = decoration.cursorFg;
      } else if (line >= selectionStart && line <= selectionEnd) {
        bg = decoration.selectedBg;
        fg = decoration.selectedFg;
      }
      decoration.row.backgroundColor = bg;
      decoration.text.fg = fg;
      decoration.row.requestRender();
    }
  }

  private deleteCurrentAgentPrompt(): void {
    const update = this.getAgentUpdateAtCursorLine();
    if (!update) return;
    this.agentController.remove(update.id);
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

    const programmingLangs = ["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "c", "cpp", "h", "hpp", "cs", "rb", "php", "swift", "kt", "scala", "vue", "svelte"];
    const configFiles = ["json", "yaml", "yml", "toml", "xml", "ini", "conf", "config", "env", "properties"];
    const textFiles = ["md", "txt", "rst", "log"];

    const getPriority = (type: string): number => {
      const lower = type.toLowerCase();
      if (programmingLangs.includes(lower)) return 0;
      if (configFiles.includes(lower)) return 1;
      if (textFiles.includes(lower)) return 3;
      return 2;
    };

    this.sortedTypes = [...this.typeCounts.keys()].sort((a, b) => {
      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });

    const nextEnabled = new Map<string, boolean>();
    for (const type of this.sortedTypes) {
      nextEnabled.set(type, previousEnabled.get(type) ?? true);
    }
    this.enabledTypes = nextEnabled;

    if (this.sortedTypes.length === 0) {
      this.state.selectedChipIndex = 0;
      return;
    }

    this.state.selectedChipIndex = clamp(
      this.state.selectedChipIndex,
      0,
      this.sortedTypes.length - 1,
    );
  }

  private pruneAgentUpdates(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    this.agentController.pruneForEntries(existing);
  }

  private pruneCollapsedFiles(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    for (const filePath of this.collapsedFiles) {
      if (existing.has(filePath)) continue;
      this.collapsedFiles.delete(filePath);
    }
  }
}
