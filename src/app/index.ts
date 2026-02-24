import {
  BoxRenderable,
  CodeRenderable,
  LineNumberRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  type KeyEvent,
  type CliRenderer,
} from "@opentui/core";
import { Camera } from "../controllers/camera";
import { Agent, type AgentSubmission } from "../integrations/opencode";
import { Layout } from "../controllers/layout";
import { Navigation } from "../controllers/navigation";
import {
  Prompt,
  type PromptTarget,
  type PromptSubmission,
} from "../controllers/prompt";
import { createAgentRow, type AgentRowDecoration } from "../components/agent-row";
import { createFileTreeRowView } from "../components/file-tree-row";
import { PromptComposerBar, type PromptComposerLayout } from "../components/prompt-composer-bar";
import { deregister, register, type SignalGroup } from "../signals";
import { copyToClipboard } from "../utils/clipboard";
import { Cursor } from "../controllers/cursor";
import { LineModel } from "../line-model";
import { AppStateStore } from "../state/app-state";
import { theme } from "../theme";
import type {
  AgentUpdate,
  AgentUpdateStatus,
  CodeFileEntry,
  FocusMode,
} from "../types";
import { clamp, clearChildren, makeSlashLine } from "../utils/ui";
import {
  buildFileTreeRows,
  type FileTreeRow,
  modes,
  type ModeSelectionLineInfo,
} from "../modes";
import { Highlight } from "../controllers/highlight";
import { registerKeyboardSignalBindings, type KeyboardStateSnapshot } from "../signals/keyboard";
import { registerScrollSignalBindings } from "../signals/scroll";
import { registerSystemSignalBindings } from "../signals/system";
import { registerAppSignalHandlers } from "./signal_bindings";
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
  private readonly visualHighlights = new Highlight();
  private dividerByFilePath = new Map<string, TextRenderable>();
  private collapsedFiles = new Set<string>();
  private filesModeDirectoryPath = "";
  private fileTreeRowsByLine = new Map<number, FileTreeRow>();
  private pendingCodeTargetFilePath: string | null = null;
  private agentLineByUpdateId = new Map<string, number>();
  private updateIdByAgentLine = new Map<number, string>();
  private agentRowDecorations = new Map<number, AgentRowDecoration>();
  private readonly sourceCleanupFns: Array<() => void> = [];
  private readonly signalRegistrationIds: string[] = [];

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
    });

    this.agent = new Agent({
      rootDir: this.rootDir,
      initialUpdates: options.initialAgentUpdates ?? [],
      onUpdatesChanged: options.onAgentUpdatesChanged,
    });

    this.prompt = new Prompt({
      rootDir: this.rootDir,
      promptComposer: this.promptComposer,
      resolveLayout: (target, fallbackAnchorLine) =>
        this.resolvePromptComposerLayout(target, fallbackAnchorLine),
    });

    this.navigation = new Navigation({
      cursor: this.cursor,
      camera: this.camera,
      lineModel: this.lineModel,
      getAgentPromptLines: () => [...this.agentLineByUpdateId.values()],
      getAnchorDividerDisplayRow: (anchor) => this.getAnchorDividerDisplayRow(anchor),
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
    this.registerBindings();
    this.renderChips();
    this.renderContent();
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
    this.unregisterBindings();
    this.agent.shutdown();
    if (this.prompt.isVisible) {
      this.prompt.close();
    }
  }

  private registerBindings(): void {
    if (this.sourceCleanupFns.length > 0 || this.signalRegistrationIds.length > 0) return;

    registerAppSignalHandlers({
      onSignal: (signalGroup, handler) => this.onSignal(signalGroup, handler),
      toggleTheme: () => this.toggleTheme(),
      getFocusMode: () => this.state.focusMode,
      setFocusMode: (mode) => this.setFocusMode(mode),
      destroyRenderer: () => this.renderer.destroy(),
      moveChipSelection: (delta) => this.moveChipSelection(delta),
      toggleSelectedChip: () => this.toggleSelectedChip(),
      shouldThrottleRepeatedMove: (repeated) => this.navigation.shouldThrottleRepeatedMove(repeated),
      moveCursorBy: (delta) => this.cursor.moveBy(delta),
      getCursorPageStep: () => this.cursor.pageStep(),
      goCursorToMinVisibleHeight: () => this.cursor.goToMinVisibleHeight(),
      goCursorToMaxVisibleHeight: () => this.cursor.goToMaxVisibleHeight(),
      toggleVisualMode: () => this.cursor.toggleVisualMode(),
      disableVisualMode: () => this.cursor.disableVisualMode(),
      copySelectionToClipboard: () => this.copySelectionToClipboard(),
      toggleFilesExplorerMode: () => this.toggleFilesExplorerMode(),
      openFromCurrentSelection: () => this.openFromCurrentSelection(),
      enterCurrentDirectory: () => this.enterCurrentDirectory(),
      goToParentDirectory: () => this.goToParentDirectory(),
      toggleCurrentStructureCollapse: () => this.toggleCurrentStructureCollapse(),
      jumpToTop: () => this.navigation.jumpToTop(),
      jumpToBottom: () => this.navigation.jumpToBottom(),
      jumpToNextFile: () => this.navigation.jumpToNextFile(),
      jumpToPreviousFile: () => this.navigation.jumpToPreviousFile(),
      jumpToNextAgent: () => this.navigation.jumpToNextAgent(),
      deleteCurrentAgentPrompt: () => this.deleteCurrentAgentPrompt(),
      closePrompt: () => this.prompt.close(),
      isPromptVisible: () => this.prompt.isVisible,
      submitPromptFromKeyboard: () => this.prompt.submitFromKeyboard(),
      cyclePromptField: (delta) => this.prompt.cycleField(delta),
      cyclePromptModel: (delta) => this.prompt.cycleModel(delta),
      cyclePromptThinkingLevel: (delta) => this.prompt.cycleThinkingLevel(delta),
      refreshPromptModels: () => this.prompt.refreshModels(),
      handlePromptInputKey: (key, consume) => this.prompt.handlePromptInputKey(key, consume),
      consumeKey: (event) => this.consumeKey(event),
      handleExternalScroll: (position) => this.cursor.handleExternalScroll(position),
      renderContent: () => this.renderContent(),
      applyLineHighlights: () => this.applyLineHighlights(),
      refreshPromptView: () => this.prompt.refreshView(),
      submitPromptToAgent: (submission) => this.submitPromptToAgent(submission),
    });

    this.sourceCleanupFns.push(
      registerKeyboardSignalBindings(this.renderer.keyInput, () => this.getKeyboardStateSnapshot()),
    );
    this.sourceCleanupFns.push(registerScrollSignalBindings(this.scrollbox.verticalScrollBar));
    this.sourceCleanupFns.push(registerSystemSignalBindings(process.stdout));
  }

  private unregisterBindings(): void {
    for (const cleanup of this.sourceCleanupFns.splice(0)) {
      cleanup();
    }
    for (const registrationId of this.signalRegistrationIds.splice(0)) {
      deregister(registrationId);
    }
  }

  private onSignal(signalGroup: SignalGroup, handler: (...args: unknown[]) => void): void {
    this.signalRegistrationIds.push(register(signalGroup, handler));
  }

  private getKeyboardStateSnapshot(): KeyboardStateSnapshot {
    return {
      promptVisible: this.prompt.isVisible,
      focusMode: this.state.focusMode,
      viewMode: this.state.viewMode,
      promptField: this.prompt.isVisible ? this.prompt.currentField : null,
    };
  }

  private openFromCurrentSelection(): void {
    if (this.state.viewMode === "files" && !this.cursor.isVisualModeEnabled) {
      this.openSelectedFilesRow();
      return;
    }
    void this.openPromptFromCodeSelection();
  }

  private async openPromptFromCodeSelection(): Promise<void> {
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

  /** Persists prompt submission and triggers agent run without moving cursor. */
  private async submitPromptToAgent(submission: PromptSubmission): Promise<void> {
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

  private toggleFilesExplorerMode(): void {
    const nextMode = this.state.viewMode === "files" ? "code" : "files";
    this.state.viewMode = modes.setMode(nextMode);
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
    this.promptComposer.applyTheme();
    this.root.requestRender();
  }

  private toggleCurrentStructureCollapse(): void {
    if (this.state.viewMode === "files") {
      return;
    }
    this.toggleCurrentFileCollapse();
  }

  private openSelectedFilesRow(): void {
    const row = this.fileTreeRowsByLine.get(this.cursor.cursorLine);
    if (!row) return;
    if (row.kind === "dir") {
      this.enterCurrentDirectory();
      return;
    }
    this.openFileFromExplorer(row.filePath);
  }

  private openFileFromExplorer(filePath: string): void {
    this.state.viewMode = modes.setMode("code");
    this.collapsedFiles.delete(filePath);
    this.pendingCodeTargetFilePath = filePath;
    this.renderContent();
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

    if (this.state.viewMode === "files") {
      this.ensureFilesModeDirectoryVisible(entriesToRender);
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
      } else {
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
      }

      while (nextUpdateIndex < updatesForFile.length) {
        const update = updatesForFile[nextUpdateIndex];
        if (!update) break;
        const agentResult = this.addAgentUpdateWithMessages(update, nextLineNumber, nextDisplayRow);
        nextLineNumber = agentResult.nextLineNumber;
        nextDisplayRow = agentResult.nextDisplayRow;
        nextUpdateIndex += 1;
      }

      if (nextLineNumber > fileAnchorLine) {
        this.lineModel.addFileAnchor({ line: fileAnchorLine, dividerRow, filePath: entry.relativePath });
      }
    }

    this.lineModel.setTotalLines(nextLineNumber - 1);
    const pendingPath = this.pendingCodeTargetFilePath;
    this.pendingCodeTargetFilePath = null;
    const targetAnchor = pendingPath ? this.lineModel.getFileAnchorByPath(pendingPath) : undefined;
    this.cursor.configureWithTarget(this.lineModel.totalLines, targetAnchor?.line, "top");
    if (this.prompt.isVisible) {
      this.prompt.refreshView();
    }
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

    this.scrollbox.add(rowView.codeView);
    this.lineModel.addBlock({
      lineView: null,
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
    const viewportWidth = Math.floor(this.scrollbox.viewport.width);
    if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
      return Math.max(1, viewportWidth - 1);
    }

    const scrollboxWidth = Math.floor(this.scrollbox.width);
    if (Number.isFinite(scrollboxWidth) && scrollboxWidth > 0) {
      return Math.max(1, scrollboxWidth - 1);
    }
    return Math.max(1, Math.floor(this.renderer.width - 1));
  }

  private addCollapsedPlaceholderBlock(
    entry: CodeFileEntry,
    collapsedLineCount: number,
    dividerWidth: number,
    fileLineStart: number,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const label = `↑ ${collapsedLineCount} lines collapsed (file) ↓`;
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
      minWidth: Math.max(2, String(Math.max(1, entry.lineCount)).length),
      paddingRight: 1,
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
    const paddingLeft = 1;
    const paddingRight = 1;
    const wrappedLines = this.wrapTextToWidth(
      this.formatAgentUpdateLine(update),
      this.getAgentContentWidth(paddingLeft, paddingRight),
    );

    let lineCursor = nextLineNumber;
    let rowCursor = nextDisplayRow;
    const blockStartLine = nextLineNumber;

    for (const line of wrappedLines) {
      const decoration = createAgentRow(this.renderer, {
        content: line,
        baseBg: this.getAgentStatusBg(update.status),
        baseFg: theme.getAgentRowForegroundColor(),
        selectedBg: theme.getAgentRowSelectedBackgroundColor(),
        selectedFg: theme.getAgentRowSelectedForegroundColor(),
        cursorBg: theme.getAgentRowCursorBackgroundColor(),
        cursorFg: theme.getAgentRowCursorForegroundColor(),
        paddingLeft,
        paddingRight,
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
        renderedLines: [line],
        lineStart: lineCursor,
        lineCount: 1,
        displayRowStart: rowCursor,
        filePath: update.filePath,
      });

      this.updateIdByAgentLine.set(lineCursor, update.id);
      this.agentRowDecorations.set(lineCursor, decoration);
      lineCursor += 1;
      rowCursor += 1;
    }

    this.agentLineByUpdateId.set(update.id, blockStartLine);
    return {
      nextLineNumber: lineCursor,
      nextDisplayRow: rowCursor,
      blockStartLine,
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
    let blockStartLine: number | null = null;
    for (const message of recentMessages) {
      const result = this.addAgentMessageBlock(update, message, lineCursor, rowCursor);
      lineCursor = result.nextLineNumber;
      rowCursor = result.nextDisplayRow;
      if (blockStartLine === null) {
        blockStartLine = result.blockStartLine;
      }
    }

    return {
      nextLineNumber: lineCursor,
      nextDisplayRow: rowCursor,
      blockStartLine: blockStartLine ?? nextLineNumber,
    };
  }

  private addAgentMessageBlock(
    update: AgentUpdate,
    message: string,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): { nextLineNumber: number; nextDisplayRow: number; blockStartLine: number } {
    const paddingLeft = 2;
    const paddingRight = 1;
    const wrappedLines = this.wrapTextToWidth(
      ` ${message}`,
      this.getAgentContentWidth(paddingLeft, paddingRight),
    );

    let lineCursor = nextLineNumber;
    let rowCursor = nextDisplayRow;
    const blockStartLine = nextLineNumber;

    for (const line of wrappedLines) {
      const decoration = createAgentRow(this.renderer, {
        content: line,
        baseBg: theme.getAgentMessageBackgroundColor(),
        baseFg: theme.getAgentMessageForegroundColor(),
        selectedBg: theme.getAgentRowSelectedBackgroundColor(),
        selectedFg: theme.getAgentRowSelectedForegroundColor(),
        cursorBg: theme.getAgentRowCursorBackgroundColor(),
        cursorFg: theme.getAgentRowCursorForegroundColor(),
        paddingLeft,
        paddingRight,
      });

      this.scrollbox.add(decoration.row);
      this.lineModel.addBlock({
        lineView: null,
        codeView: null,
        defaultLineNumberFg: theme.getAgentMessageForegroundColor(),
        defaultLineSigns: new Map(),
        blockKind: "agent",
        fileLineStart: update.selectionEndFileLine,
        renderedLines: [line],
        lineStart: lineCursor,
        lineCount: 1,
        displayRowStart: rowCursor,
        filePath: update.filePath,
      });

      this.updateIdByAgentLine.set(lineCursor, update.id);
      this.agentRowDecorations.set(lineCursor, decoration);
      lineCursor += 1;
      rowCursor += 1;
    }

    return {
      nextLineNumber: lineCursor,
      nextDisplayRow: rowCursor,
      blockStartLine,
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
    const variantSuffix = update.variant ? ` · think:${update.variant}` : "";
    const runSuffix = update.runId ? ` · ${update.runId}` : "";
    const errorSuffix = update.error ? ` | error: ${update.error}` : "";
    return `● ${prefix} · ${update.model}${variantSuffix} · ${prompt}${runSuffix}${errorSuffix}`;
  }

  private getAgentContentWidth(paddingLeft: number, paddingRight: number): number {
    const viewportWidth = Math.floor(this.scrollbox.viewport.width);
    if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
      return Math.max(8, viewportWidth - Math.max(0, paddingLeft) - Math.max(0, paddingRight));
    }

    const scrollboxWidth = Math.floor(this.scrollbox.width);
    if (Number.isFinite(scrollboxWidth) && scrollboxWidth > 0) {
      return Math.max(8, scrollboxWidth - Math.max(0, paddingLeft) - Math.max(0, paddingRight));
    }

    return Math.max(8, Math.floor(this.renderer.width - paddingLeft - paddingRight));
  }

  private wrapTextToWidth(text: string, width: number): string[] {
    const safeWidth = Math.max(1, Math.floor(width));
    const normalized = text.replace(/\t/g, "  ");
    const lines = normalized.split("\n");
    const wrapped: string[] = [];

    for (const line of lines) {
      if (line.length === 0) {
        wrapped.push("");
        continue;
      }

      let segment = "";
      for (const char of line) {
        const next = `${segment}${char}`;
        if (this.displayWidth(next) > safeWidth) {
          wrapped.push(segment.length > 0 ? segment : char);
          segment = segment.length > 0 ? char : "";
          continue;
        }
        segment = next;
      }
      if (segment.length > 0) {
        wrapped.push(segment);
      }
    }

    return wrapped.length > 0 ? wrapped : [""];
  }

  private displayWidth(text: string): number {
    try {
      return Bun.stringWidth(text);
    } catch {
      return text.length;
    }
  }

  private getAgentStatusBg(status: AgentUpdateStatus): string {
    return theme.getAgentStatusBackgroundColor(status);
  }

  private getUpdatesForFile(filePath: string): AgentUpdate[] {
    return Layout.getUpdatesForFile(this.agent.getMutableUpdates(), filePath);
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
    return Math.max(1, this.scrollbox.viewport.height || this.scrollbox.height || this.renderer.height - 2);
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
