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
import { Camera } from "./controllers/camera";
import { Agent, type AgentSubmission } from "./integrations/opencode";
import { ContentLayoutBuilder, type DiffSegment } from "./controllers/content-layout-builder";
import { Navigation } from "./controllers/navigation";
import {
  Prompt,
  type PromptTarget,
  type PromptSubmission,
} from "./controllers/prompt";
import { createAgentRow, type AgentRowDecoration } from "./components/agent-row";
import { createBottomChip } from "./components/bottom-chip";
import { createFileTreeRowView } from "./components/file-tree-row";
import { PromptComposerBar, type PromptComposerLayout } from "./components/prompt-composer-bar";
import { copyToClipboard } from "./utils/clipboard";
import { Cursor } from "./controllers/cursor";
import { LineModel } from "./line-model";
import { CHIPS_KEYMAP, CODE_KEYMAP } from "./shortcuts";
import { AppStateStore } from "./state/app-state";
import { theme } from "./theme";
import type {
  AgentUpdate,
  AgentUpdateStatus,
  BlockKind,
  CodeFileEntry,
  FocusMode,
} from "./types";
import { clamp, clearChildren, makeSlashLine } from "./utils/ui";
import {
  buildFileTreeRows,
  extractSignatureBlocks,
  type FileTreeRow,
  modes,
  type ModeSelectionLineInfo,
} from "./modes";
import { VisualHighlight } from "./controllers/visual-highlight";
import {
  registerKeyboardEvents,
  registerScrollEvents,
  registerSystemEvents,
  type KeyboardAction,
  type KeyboardStateSnapshot,
  type ScrollAction,
  type SystemAction,
} from "./events";
type CodeBrowserAppOptions = {
  rootDir: string;
  initialAgentUpdates?: AgentUpdate[];
  onAgentUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

type SelectionLineInfo = ModeSelectionLineInfo;

const ACTION_CHIPS: readonly string[] = [];

export class CodeBrowserApp {
  private readonly renderer: CliRenderer;
  private readonly rootDir: string;
  private entries: CodeFileEntry[];
  private readonly state = new AppStateStore();

  private readonly root: BoxRenderable;
  private readonly chipsRow: BoxRenderable;
  private readonly scrollbox: ScrollBoxRenderable;
  private readonly bottomBar: BoxRenderable;
  private readonly promptComposer: PromptComposerBar;
  private readonly camera: Camera;
  private readonly navigation: Navigation;
  private readonly agent: Agent;
  private readonly prompt: Prompt;

  private typeCounts: Map<string, number>;
  private sortedTypes: string[];
  private enabledTypes: Map<string, boolean>;

  private readonly cursor: Cursor;

  private readonly lineModel = new LineModel();
  private readonly visualHighlights = new VisualHighlight();
  private dividerByFilePath = new Map<string, TextRenderable>();
  private collapsedFiles = new Set<string>();
  private filesModeDirectoryPath = "";
  private fileTreeRowsByLine = new Map<number, FileTreeRow>();
  private signatureLineNumberMinWidth = 2;
  private agentLineByUpdateId = new Map<string, number>();
  private updateIdByAgentLine = new Map<number, string>();
  private agentRowDecorations = new Map<number, AgentRowDecoration>();
  private readonly eventCleanups: Array<() => void> = [];

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
      marginBottom: 1,
      verticalScrollbarOptions: { visible: false },
      horizontalScrollbarOptions: { visible: false },
      onMouseDown: () => {
        this.applyLineHighlights();
      },
    });

    this.bottomBar = new BoxRenderable(renderer, {
      id: "bottom-bar",
      position: "absolute",
      bottom: 0,
      left: 0,
      zIndex: 800,
      width: "100%",
      height: 1,
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 0,
    });

    this.root.add(this.chipsRow);
    this.root.add(this.scrollbox);
    this.root.add(this.bottomBar);

    this.promptComposer = new PromptComposerBar(renderer);

    this.root.add(this.promptComposer.renderable);
    this.renderer.root.add(this.root);
    this.chipsRow.focusable = false;
    this.scrollbox.focusable = false;

    this.camera = new Camera({
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
    this.cursor = new Cursor({
      camera: this.camera,
      onCursorChanged: () => {
        this.applyLineHighlights();
        if (this.prompt.isVisible) {
          this.prompt.refreshView();
        }
      },
    });

    this.agent = new Agent({
      rootDir: this.rootDir,
      initialUpdates: options.initialAgentUpdates ?? [],
      onUpdatesChanged: options.onAgentUpdatesChanged,
      onRenderRequested: () => this.renderContent(),
    });

    this.prompt = new Prompt({
      rootDir: this.rootDir,
      promptComposer: this.promptComposer,
      onSubmission: async (submission) => this.handlePromptSubmission(submission),
      onFocusModeChange: (focusMode) => this.setFocusMode(focusMode),
      resolveLayout: (target, fallbackAnchorLine) =>
        this.resolvePromptComposerLayout(target, fallbackAnchorLine),
    });

    this.navigation = new Navigation({
      cursor: this.cursor,
      camera: this.camera,
      lineModel: this.lineModel,
      getAgentPromptLines: () => [...this.agentLineByUpdateId.values()],
      getAnchorDividerDisplayRow: (anchor) => this.getAnchorDividerDisplayRow(anchor),
      onDeleteCurrentAgentPrompt: () => this.deleteCurrentAgentPrompt(),
    });

    this.typeCounts = new Map();
    this.sortedTypes = [];
    this.enabledTypes = new Map();
    this.state.viewMode = modes.getMode();
    this.recomputeTypesState();
    this.applyTheme();
  }

  public start(): void {
    this.pruneAgentUpdates();
    this.renderChips();
    this.renderContent();
    this.registerEventHandlers();
    this.setFocusMode("code");
    this.prompt.start();
  }

  public refreshEntries(entries: CodeFileEntry[]): void {
    this.entries = entries;
    this.pruneCollapsedFiles();
    this.pruneAgentUpdates();
    this.recomputeTypesState();
    this.renderChips();
    this.renderContent();
  }

  public getAgentUpdates(): AgentUpdate[] {
    return this.agent.getUpdates();
  }

  public shutdown(): void {
    this.unregisterEventHandlers();
    this.agent.shutdown();
    if (this.prompt.isVisible) {
      this.prompt.close();
    }
  }

  private registerEventHandlers(): void {
    if (this.eventCleanups.length > 0) return;

    this.eventCleanups.push(
      registerKeyboardEvents(
        this.renderer.keyInput,
        () => this.getKeyboardStateSnapshot(),
        (action) => this.handleKeyboardAction(action),
      ),
    );

    this.eventCleanups.push(
      registerScrollEvents(this.scrollbox.verticalScrollBar, (action) => this.handleScrollAction(action)),
    );

    this.eventCleanups.push(registerSystemEvents(process.stdout, (action) => this.handleSystemAction(action)));
  }

  private unregisterEventHandlers(): void {
    for (const cleanup of this.eventCleanups.splice(0)) {
      cleanup();
    }
  }

  private getKeyboardStateSnapshot(): KeyboardStateSnapshot {
    return {
      promptVisible: this.prompt.isVisible,
      focusMode: this.state.focusMode,
    };
  }

  private handleKeyboardAction(action: KeyboardAction): void {
    switch (action.type) {
      case "toggle_theme":
        this.consumeKey(action.key);
        this.toggleTheme();
        return;
      case "switch_view_mode":
        this.consumeKey(action.key);
        this.switchViewMode();
        return;
      case "prompt_keypress":
        this.prompt.handleKeypress(action.keyName, action.rawKeyName, action.key, (event) =>
          this.consumeKey(event),
        );
        return;
      case "toggle_focus_mode":
        this.consumeKey(action.key);
        this.setFocusMode(this.state.focusMode === "chips" ? "code" : "chips");
        return;
      case "chips_keypress":
        this.navigation.resetChordState();
        this.handleChipsKeypress(action.keyName, action.key);
        return;
      case "code_keypress":
        this.handleCodeKeypress(action.keyName, action.rawKeyName, action.key);
        return;
    }
  }

  private handleScrollAction(action: ScrollAction): void {
    if (action.type === "vertical_scroll") {
      this.cursor.handleExternalScroll(action.position);
    }
  }

  private handleSystemAction(action: SystemAction): void {
    if (action.type === "stdout_resize") {
      this.updateBottomBar();
      this.renderContent();
    }
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
      this.navigation.resetChordState();
      this.cursor.disableVisualMode();
      return;
    }

    if (this.handleAgentRowKeypress(keyName, key)) {
      this.navigation.resetChordState();
      return;
    }

    if (mappedAction === "open_prompt") {
      this.consumeKey(key);
      this.navigation.resetChordState();
      void this.handleEnterOnCodeView();
      return;
    }

    const navigationResult = this.navigation.handleVimNavigationKeypress(
      keyName,
      rawKeyName,
      key,
      (event) => this.consumeKey(event),
    );
    if (navigationResult.handled) return;

    if (mappedAction === "move_up") {
      if (this.navigation.shouldThrottleRepeatedMove(key)) {
        this.consumeKey(key);
        return;
      }
      this.consumeKey(key);
      this.cursor.moveBy(-1);
      return;
    }

    if (mappedAction === "move_down") {
      if (this.navigation.shouldThrottleRepeatedMove(key)) {
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

    if (mappedAction === "yank_selection") {
      this.consumeKey(key);
      this.navigation.resetChordState();
      void this.copySelectionToClipboard();
      return;
    }

    if (keyName === "space" && this.state.viewMode === "files") {
      this.consumeKey(key);
      this.navigation.resetChordState();
      this.enterCurrentDirectory();
      return;
    }

    if (keyName === "backspace" && this.state.viewMode === "files") {
      this.consumeKey(key);
      this.navigation.resetChordState();
      this.goToParentDirectory();
      return;
    }

    if (mappedAction === "collapse_file") {
      this.consumeKey(key);
      this.navigation.resetChordState();
      this.toggleCurrentStructureCollapse();
      return;
    }

    if (mappedAction === "toggle_diff") {
      this.consumeKey(key);
      this.navigation.resetChordState();
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
      this.agent.remove(update.id);
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
      this.prompt.open({
        updateId: update.id,
        viewMode: update.contextMode ?? this.state.viewMode,
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
    this.prompt.open(target);
  }

  /** Builds a prompt target payload from current visual selection in active file. */
  private createPromptTargetFromSelection(): PromptTarget | null {
    const selection = this.getSelectionLineInfos();
    if (selection.length === 0) return null;

    const modeSelection = modes.buildPromptSelection(this.state.viewMode, {
      selection,
      fileTreeRowsByLine: this.fileTreeRowsByLine,
    });
    if (!modeSelection) return null;

    return this.buildPromptTarget(modeSelection.selection, modeSelection.selectedText);
  }

  private getSelectionLineInfos(): SelectionLineInfo[] {
    const { start, end } = this.cursor.selectionRange;
    if (start <= 0 || end <= 0) return [];
    const selection: SelectionLineInfo[] = [];

    for (let globalLine = start; globalLine <= end; globalLine += 1) {
      const lineInfo = this.lineModel.getVisibleLineInfo(globalLine);
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

  private async copySelectionToClipboard(): Promise<void> {
    const selection = this.getSelectionLineInfos();
    if (selection.length === 0) return;

    const clipboardText = this.buildClipboardSelectionText(selection);
    if (!clipboardText) return;
    await copyToClipboard(clipboardText);
  }

  private buildClipboardSelectionText(selection: readonly SelectionLineInfo[]): string {
    const modeClipboard = modes.buildClipboardText(this.state.viewMode, {
      selection,
      fileTreeRowsByLine: this.fileTreeRowsByLine,
    });
    if (modeClipboard) return modeClipboard;

    return selection.map((line) => line.text).join("\n").trimEnd();
  }

  private buildPromptTarget(
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
      viewMode: this.state.viewMode,
      filePath: primaryFilePath,
      selectionStartFileLine,
      selectionEndFileLine,
      anchorLine: last.globalLine,
      selectedText,
      prompt: "",
      model: "opencode/big-pickle",
    };
  }

  /** Persists prompt submission, triggers run, and restores cursor on created agent row. */
  private async handlePromptSubmission(submission: PromptSubmission): Promise<void> {
    const upsertPayload: AgentSubmission = {
      updateId: submission.updateId,
      viewMode: submission.viewMode,
      filePath: submission.filePath,
      selectionStartFileLine: submission.selectionStartFileLine,
      selectionEndFileLine: submission.selectionEndFileLine,
      selectedText: submission.selectedText,
      prompt: submission.prompt,
      model: submission.model,
      thinkingLevel: submission.thinkingLevel,
    };
    const update = this.agent.upsertFromSubmission(upsertPayload);
    this.cursor.disableVisualMode();
    this.renderContent();
    await this.agent.launch(update);
    const targetLine = this.agentLineByUpdateId.get(update.id);
    if (typeof targetLine === "number") {
      this.cursor.goToLine(targetLine, "keep");
    }
  }

  private getAgentUpdateAtCursorLine(): AgentUpdate | undefined {
    return this.agent.findByRenderedLine(this.cursor.cursorLine, this.updateIdByAgentLine);
  }

  private consumeKey(key: KeyEvent): void {
    key.preventDefault?.();
    key.stopPropagation?.();
  }

  private isTypeEnabled(type: string): boolean {
    return this.enabledTypes.get(type) ?? false;
  }

  private setFocusMode(mode: FocusMode): void {
    this.state.focusMode = mode;
    this.renderChips();
  }

  private moveChipSelection(delta: number): void {
    const chipCount = this.sortedTypes.length + ACTION_CHIPS.length;
    if (chipCount === 0) return;
    const nextIndex = this.state.selectedChipIndex + delta;
    this.state.selectedChipIndex =
      ((nextIndex % chipCount) + chipCount) % chipCount;
    this.renderChips();
  }

  private toggleSelectedChip(): void {
    const selectedChipIndex = this.state.selectedChipIndex;

    if (selectedChipIndex < this.sortedTypes.length) {
      const selectedType = this.sortedTypes[selectedChipIndex];
      if (!selectedType) return;
      this.enabledTypes.set(selectedType, !this.isTypeEnabled(selectedType));
      this.renderChips();
      this.renderContent();
      return;
    }
  }

  private toggleDiffMode(): void {
    if (this.state.viewMode !== "code") return;
    this.state.diffMode = !this.state.diffMode;
    this.renderContent();
  }

  private switchViewMode(): void {
    const nextMode = modes.switchMode();
    this.state.viewMode = nextMode;
    if (!modes.supportsDiff(nextMode)) {
      this.state.diffMode = false;
    }
    this.updateBottomBar();
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
    this.bottomBar.backgroundColor = theme.getDividerBackgroundColor();
    this.updateBottomBar();
    this.promptComposer.applyTheme();
    this.root.requestRender();
  }

  private updateBottomBar(): void {
    clearChildren(this.bottomBar);
    const currentMode = modes.getPlugin(this.state.viewMode);

    this.bottomBar.add(
      createBottomChip(this.renderer, {
        label: currentMode.label,
        bg: currentMode.chipColors.bg,
        fg: currentMode.chipColors.fg,
        variant: "active",
      }),
    );
    this.bottomBar.add(
      new TextRenderable(this.renderer, {
        content: " · ",
        fg: theme.getDividerForegroundColor(),
        attributes: TextAttributes.BOLD,
      }),
    );

    this.bottomBar.add(
      createBottomChip(this.renderer, {
        label: theme.getThemeName().toUpperCase(),
        bg: theme.getDividerBackgroundColor(),
        fg: theme.getDividerForegroundColor(),
        variant: "plain",
      }),
    );
  }

  private toggleCurrentStructureCollapse(): void {
    if (this.state.viewMode === "files") {
      return;
    }
    this.toggleCurrentFileCollapse();
  }

  private enterCurrentDirectory(): void {
    const row = this.fileTreeRowsByLine.get(this.cursor.cursorLine);
    if (!row || row.kind !== "dir") return;
    this.filesModeDirectoryPath = row.path;
    this.renderContent();
    this.cursor.goToLine(1, "top");
  }

  private goToParentDirectory(): void {
    const parent = this.getParentDirectoryPath(this.filesModeDirectoryPath);
    if (parent === this.filesModeDirectoryPath) return;
    this.filesModeDirectoryPath = parent;
    this.renderContent();
    this.cursor.goToLine(1, "top");
  }

  private getParentDirectoryPath(filePath: string): string {
    const normalized = filePath
      .split("/")
      .filter(Boolean)
      .join("/");
    if (!normalized) return "";
    const parts = normalized.split("/");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/");
  }

  private ensureFilesModeDirectoryVisible(entries: readonly CodeFileEntry[]): void {
    let directory = this.filesModeDirectoryPath;
    while (directory.length > 0) {
      const hasVisibleChild = entries.some((entry) => {
        return entry.relativePath.startsWith(`${directory}/`);
      });
      if (hasVisibleChild) break;
      directory = this.getParentDirectoryPath(directory);
    }
    this.filesModeDirectoryPath = directory;
  }

  private toggleCurrentFileCollapse(): void {
    if (this.state.viewMode === "files") {
      return;
    }
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
    const chipsFocused = this.state.focusMode === "chips";

    for (const [index, type] of this.sortedTypes.entries()) {
      const enabled = this.isTypeEnabled(type);
      const selected = index === this.state.selectedChipIndex;

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
    this.fileTreeRowsByLine = new Map();

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

    const entriesToRender = modes.filterEntries(this.state.viewMode, filteredEntries);
    if (entriesToRender.length === 0) {
      this.renderEmptyState(modes.getEmptyStateMessage(this.state.viewMode));
      this.cursor.configure(0);
      return;
    }

    if (this.state.viewMode === "signatures") {
      const maxLineCount = entriesToRender.reduce((maxValue, entry) => {
        return Math.max(maxValue, entry.lineCount);
      }, 1);
      const maxDigits = String(Math.max(1, maxLineCount)).length;
      this.signatureLineNumberMinWidth = Math.max(3, maxDigits + 2);
    } else {
      this.signatureLineNumberMinWidth = 2;
    }

    if (this.state.viewMode === "files") {
      this.ensureFilesModeDirectoryVisible(entriesToRender);
    }

    if (this.state.viewMode === "files") {
      this.renderFilesModeContent(entriesToRender);
      if (this.prompt.isVisible) {
        this.prompt.refreshView();
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
      } else if (this.state.viewMode === "signatures") {
        const result = this.renderSignaturesForEntry(
          entry,
          updatesForFile,
          nextUpdateIndex,
          nextLineNumber,
          nextDisplayRow,
        );
        nextLineNumber = result.nextLineNumber;
        nextDisplayRow = result.nextDisplayRow;
        nextUpdateIndex = result.nextUpdateIndex;
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
    if (this.prompt.isVisible) {
      this.prompt.refreshView();
    }
  }

  private renderSignaturesForEntry(
    entry: CodeFileEntry,
    updatesForFile: readonly AgentUpdate[],
    startUpdateIndex: number,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; nextUpdateIndex: number } {
    const signatures = extractSignatureBlocks(entry.content);
    let updateIndex = startUpdateIndex;
    let lineCursor = nextLineNumber;
    let rowCursor = nextDisplayRow;

    for (const signature of signatures) {
      const signatureContent = signature.lines.join("\n");
      const signatureResult = this.addCodeBlock(
        entry,
        signatureContent,
        signature.fileLineStart,
        signature.lines.length,
        lineCursor,
        rowCursor,
        "signature",
      );
      lineCursor = signatureResult.nextLineNumber;
      rowCursor = signatureResult.nextDisplayRow;

      while (updateIndex < updatesForFile.length) {
        const update = updatesForFile[updateIndex];
        if (!update) break;
        if (update.selectionEndFileLine > signature.anchorFileLine) break;
        const agentResult = this.addAgentUpdateWithMessages(update, lineCursor, rowCursor);
        lineCursor = agentResult.nextLineNumber;
        rowCursor = agentResult.nextDisplayRow;
        updateIndex += 1;
      }
    }

    while (updateIndex < updatesForFile.length) {
      const update = updatesForFile[updateIndex];
      if (!update) break;
      const agentResult = this.addAgentUpdateWithMessages(update, lineCursor, rowCursor);
      lineCursor = agentResult.nextLineNumber;
      rowCursor = agentResult.nextDisplayRow;
      updateIndex += 1;
    }

    return {
      nextLineNumber: lineCursor,
      nextDisplayRow: rowCursor,
      nextUpdateIndex: updateIndex,
    };
  }

  private renderFilesModeContent(entries: readonly CodeFileEntry[]): void {
    const rows = buildFileTreeRows(entries, this.filesModeDirectoryPath);
    if (rows.length === 0) {
      this.renderEmptyState("No files in tree.");
      this.cursor.configure(0);
      return;
    }

    let nextDisplayRow = 0;
    let nextLineNumber = 1;

    for (const row of rows) {
      const rowDisplayStart = nextDisplayRow;
      const rowResult = this.addFileTreeRowBlock(row, nextLineNumber, nextDisplayRow);
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
          const agentResult = this.addAgentUpdateWithMessages(update, nextLineNumber, nextDisplayRow);
          nextLineNumber = agentResult.nextLineNumber;
          nextDisplayRow = agentResult.nextDisplayRow;
        }
      }
    }

    this.lineModel.setTotalLines(nextLineNumber - 1);
    this.cursor.configure(this.lineModel.totalLines);
  }

  private addFileTreeRowBlock(
    row: FileTreeRow,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const rowView = createFileTreeRowView(this.renderer, row, this.getFilesModeViewportWidth());

    this.scrollbox.add(rowView.lineView);
    this.lineModel.addBlock({
      lineView: rowView.lineView,
      codeView: rowView.codeView,
      defaultLineNumberFg: theme.getCodeLineNumberColor(),
      defaultLineSigns: new Map(),
      blockKind: "file",
      fileLineStart: null,
      renderedLines: [rowView.renderedLine],
      lineStart: nextLineNumber,
      lineCount: 1,
      displayRowStart: nextDisplayRow,
      filePath: row.filePath,
    });

    this.fileTreeRowsByLine.set(nextLineNumber, row);
    return {
      nextLineNumber: nextLineNumber + 1,
      nextDisplayRow: nextDisplayRow + 1,
      blockStartLine: nextLineNumber,
    };
  }

  private getFilesModeViewportWidth(): number {
    const scrollboxWidth = Math.floor(this.scrollbox.width);
    if (Number.isFinite(scrollboxWidth) && scrollboxWidth > 0) {
      return scrollboxWidth;
    }
    return Math.max(1, Math.floor(this.renderer.width));
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
      minWidth: 0,
      paddingRight: 0,
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
    blockKind: BlockKind = "code",
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
      minWidth:
        blockKind === "signature"
          ? this.signatureLineNumberMinWidth
          : Math.max(2, String(Math.max(1, entry.lineCount)).length),
      paddingRight: 1,
      lineNumberOffset: fileLineStart - 1,
      fg: theme.getCodeLineNumberColor(),
      bg: theme.getTransparentColor(),
    });
    lineView.selectable = false;

    if (blockKind === "code") {
      for (let lineOffset = 0; lineOffset < renderedLineCount; lineOffset += 1) {
        const fileLine = fileLineStart + lineOffset;
        if (!entry.uncommittedLines.has(fileLine)) continue;
        lineView.setLineSign(lineOffset, {
          before: "▌",
          beforeColor: theme.getUncommittedLineSignColor(),
        });
      }
    }
    const defaultLineSigns = new Map(lineView.getLineSigns());

    this.scrollbox.add(lineView);
    this.lineModel.addBlock({
      lineView,
      codeView: code,
      defaultLineNumberFg: theme.getCodeLineNumberColor(),
      defaultLineSigns,
      blockKind,
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
    return ContentLayoutBuilder.getUpdatesForFile(this.agent.getMutableUpdates(), filePath);
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
    target: PromptTarget | null,
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
    target: PromptTarget | null,
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
    this.agent.remove(update.id);
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

    this.state.selectedChipIndex = clamp(
      this.state.selectedChipIndex,
      0,
      Math.max(0, this.sortedTypes.length + ACTION_CHIPS.length - 1),
    );
  }

  private pruneAgentUpdates(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    this.agent.pruneForEntries(existing);
  }

  private pruneCollapsedFiles(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    for (const filePath of this.collapsedFiles) {
      if (existing.has(filePath)) continue;
      this.collapsedFiles.delete(filePath);
    }
  }

}
