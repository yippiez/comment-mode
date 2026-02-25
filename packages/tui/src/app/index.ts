import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
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
import { PromptComposerBar, type PromptComposerLayout } from "../components/prompt-composer-bar";
import { deregister, register, type SignalGroup } from "../signals";
import { copyToClipboard } from "../utils/clipboard";
import { Cursor } from "../controllers/cursor";
import { LineModel } from "../line-model";
import {
  AppStateStore,
  recomputeTypeState,
} from "../controllers/state";
import { theme } from "../theme";
import type {
  AgentUpdate,
  CodeFileEntry,
  FocusMode,
} from "../types";
import { clamp, clearChildren, makeSlashLine } from "../utils/ui";
import {
  modes,
} from "../modes";
import { Highlight } from "../controllers/highlight";
import {
  type KeyboardStateSnapshot,
  registerAppSignalHandlers,
  registerKeyboardSignalBindings,
  registerScrollSignalBindings,
  registerSystemSignalBindings,
} from "./signal_bindings";
import {
  renderTypeChips,
} from "./render";
import {
  buildClipboardSelectionText,
  collectSelectionLineInfos,
  createPromptTargetFromSelection,
  resolvePromptComposerLayout,
  type SelectionLineInfo,
} from "./selection";
import { FileExplorer } from "./file_explorer";
import { AgentTimeline } from "./agent_timeline";
import { DocumentBlocks } from "./document_blocks";
type CodeBrowserAppOptions = {
  initialAgentUpdates?: AgentUpdate[];
  onAgentUpdatesChanged?: (updates: AgentUpdate[]) => void;
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

const ACTION_CHIPS: readonly string[] = [];

export class CodeBrowserApp {
  private readonly renderer: CliRenderer;
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
  private readonly documentBlocks: DocumentBlocks;

  private typeCounts: Map<string, number>;
  private sortedTypes: string[];
  private enabledTypes: Map<string, boolean>;

  private readonly cursor: Cursor;

  private readonly lineModel = new LineModel();
  private readonly visualHighlights = new Highlight();
  private readonly fileExplorer = new FileExplorer();
  private readonly agentTimeline: AgentTimeline;
  private dividerByFilePath = new Map<string, TextRenderable>();
  private readonly sourceCleanupFns: Array<() => void> = [];
  private readonly signalRegistrationIds: string[] = [];

  constructor(renderer: CliRenderer, entries: CodeFileEntry[], options: CodeBrowserAppOptions = {}) {
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
    this.agentTimeline = new AgentTimeline(this.renderer, this.scrollbox, this.lineModel);
    this.documentBlocks = new DocumentBlocks(
      this.renderer,
      this.scrollbox,
      this.lineModel,
      this.fileExplorer,
    );

    this.agent = new Agent({
      initialUpdates: options.initialAgentUpdates ?? [],
      onUpdatesChanged: options.onAgentUpdatesChanged,
    });

    this.prompt = new Prompt({
      promptComposer: this.promptComposer,
      resolveLayout: (target, fallbackAnchorLine) =>
        this.resolvePromptComposerLayout(target, fallbackAnchorLine),
    });

    this.navigation = new Navigation({
      cursor: this.cursor,
      camera: this.camera,
      lineModel: this.lineModel,
      getAgentPromptLines: () => this.agentTimeline.getPromptLines(),
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
    return createPromptTargetFromSelection(
      this.state.viewMode,
      this.cursor,
      this.lineModel,
      this.fileExplorer.getRowsByLine(),
    );
  }

  private getSelectionLineInfos(): SelectionLineInfo[] {
    return collectSelectionLineInfos(this.cursor, this.lineModel);
  }

  private async copySelectionToClipboard(): Promise<void> {
    const selection = this.getSelectionLineInfos();
    if (selection.length === 0) return;

    const clipboardText = this.buildClipboardSelectionText(selection);
    if (!clipboardText) return;
    await copyToClipboard(clipboardText);
  }

  private buildClipboardSelectionText(selection: readonly SelectionLineInfo[]): string {
    return buildClipboardSelectionText(
      this.state.viewMode,
      selection,
      this.fileExplorer.getRowsByLine(),
    );
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
    const updateId = this.agentTimeline.getUpdateIdAtLine(this.cursor.cursorLine);
    if (!updateId) return undefined;
    return this.agent.findById(updateId);
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
    const row = this.fileExplorer.getRowAtLine(this.cursor.cursorLine);
    if (!row) return;
    if (row.kind === "dir") {
      this.enterCurrentDirectory();
      return;
    }
    this.openFileFromExplorer(row.filePath);
  }

  private openFileFromExplorer(filePath: string): void {
    this.state.viewMode = modes.setMode("code");
    this.fileExplorer.openFile(filePath);
    this.renderContent();
  }

  private enterCurrentDirectory(): void {
    const changed = this.fileExplorer.enterCurrentDirectoryAtLine(this.cursor.cursorLine);
    if (!changed) return;
    this.renderContent();
    this.cursor.goToLine(1, "top");
  }

  private goToParentDirectory(): void {
    const changed = this.fileExplorer.goToParentDirectory();
    if (!changed) return;
    this.renderContent();
    this.cursor.goToLine(1, "top");
  }

  private toggleCurrentFileCollapse(): void {
    const currentFilePath = this.lineModel.getCurrentFilePath(this.cursor.cursorLine);
    const changed = this.fileExplorer.toggleCollapse(this.state.viewMode, currentFilePath);
    if (!changed) return;

    const cursorTargetFilePath =
      currentFilePath && this.fileExplorer.isCollapsed(currentFilePath) ? currentFilePath : undefined;
    this.renderContent({ cursorTargetFilePath });
  }

  private renderChips(): void {
    renderTypeChips({
      renderer: this.renderer,
      chipsRow: this.chipsRow,
      sortedTypes: this.sortedTypes,
      selectedChipIndex: this.state.selectedChipIndex,
      chipsFocused: this.state.focusMode === "chips",
      getTypeCount: (type) => this.typeCounts.get(type) ?? 0,
      isTypeEnabled: (type) => this.isTypeEnabled(type),
      onChipSelected: (index) => {
        this.state.selectedChipIndex = index;
        this.setFocusMode("chips");
      },
      onToggleSelectedChip: () => this.toggleSelectedChip(),
    });
  }

  private renderContent(options: { cursorTargetFilePath?: string } = {}): void {
    const restorePoint = this.captureCursorRestorePoint();
    clearChildren(this.scrollbox);
    this.lineModel.reset();
    this.visualHighlights.reset();
    this.dividerByFilePath = new Map();
    this.agentTimeline.resetForRender();
    this.fileExplorer.clearRows();

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
      this.fileExplorer.ensureDirectoryVisible(entriesToRender);
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

      if (this.fileExplorer.isCollapsed(entry.relativePath)) {
        const result = this.documentBlocks.addCollapsedPlaceholderBlock(
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
          const agentResult = this.agentTimeline.addUpdateWithMessages(
            update,
            nextLineNumber,
            nextDisplayRow,
          );
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
      this.cursor.configureWithTarget(this.lineModel.totalLines, targetAnchor.line, "top");
    } else {
      const restoreTarget = this.resolveCursorRestoreTarget(restorePoint);
      this.cursor.configureWithTarget(
        this.lineModel.totalLines,
        restoreTarget.cursorLine,
        "keep",
        restoreTarget.visualAnchorLine,
      );
    }
    if (this.prompt.isVisible) {
      this.prompt.refreshView();
    }
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
    return resolvePromptComposerLayout({
      target,
      fallbackAnchorLine,
      lineModel: this.lineModel,
      cursorLine: this.cursor.cursorLine,
      scrollboxY: this.scrollbox.y,
      scrollTop: this.scrollbox.scrollTop,
      viewportHeight: this.getViewportHeight(),
    });
  }

  private applyLineHighlights(): void {
    const { start: selectionStart, end: selectionEnd } = this.cursor.selectionRange;
    const cursorLine = this.cursor.cursorLine;
    this.visualHighlights.apply(this.lineModel.blocks, selectionStart, selectionEnd, cursorLine);
    this.agentTimeline.applyHighlights(selectionStart, selectionEnd, cursorLine);
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
    const nextState = recomputeTypeState(
      this.entries,
      this.enabledTypes,
      this.state.selectedChipIndex,
      ACTION_CHIPS.length,
    );
    this.typeCounts = nextState.typeCounts;
    this.sortedTypes = nextState.sortedTypes;
    this.enabledTypes = nextState.enabledTypes;
    this.state.selectedChipIndex = nextState.selectedChipIndex;
  }

  private pruneAgentUpdates(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    this.agent.pruneForEntries(existing);
  }

  private pruneCollapsedFiles(): void {
    this.fileExplorer.pruneCollapsedFiles(this.entries);
  }

}
