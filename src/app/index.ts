import {
  BoxRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
} from "@opentui/core";
import { Camera } from "../controllers/camera";
import { OpenCode, type OpenCodeSubmission } from "../integrations/opencode";
import { Layout } from "../controllers/layout";
import { hydrateCodeFileEntry, isMissingCodeFileError } from "../files";
import { Navigation } from "../controllers/navigation";
import {
  Prompt,
  type PromptTarget,
  type PromptSubmission,
} from "../controllers/prompt";
import { PromptComposerBar, type PromptComposerLayout } from "./prompt-composer-bar";
import { deregister, register, type SignalGroup } from "../signals";
import { copyToClipboard } from "../utils/clipboard";
import { openFileInEditor } from "../utils/editor";
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
import { wrapIndex } from "../utils/math";
import {
  modes,
} from "./view_modes";
import { Highlight } from "../controllers/highlight";
import {
  type KeyboardStateSnapshot,
  registerAppSignalHandlers,
  registerKeyboardSignalBindings,
  registerScrollSignalBindings,
  registerSystemSignalBindings,
} from "./signal_bindings";
import {
  buildClipboardSelectionText,
  collectSelectionLineInfos,
  createPromptTargetFromSelection,
  type SelectionLineInfo,
} from "./selection";
import { FileExplorer } from "./file_explorer";
import { AgentTimeline } from "./agent_timeline";
import { DocumentBlocks } from "./document_blocks";
import { AppRenderer } from "./renderer";
type CodeBrowserAppOptions = {
  initialAgentUpdates?: AgentUpdate[];
  onAgentUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

const ACTION_CHIPS: readonly string[] = [];
const LAZY_CONTENT_MODE_FILE_THRESHOLD = 250;

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
  private readonly agent: OpenCode;
  private readonly prompt: Prompt;
  private readonly appRenderer: AppRenderer;
  private readonly documentBlocks: DocumentBlocks;

  private typeCounts: Map<string, number>;
  private sortedTypes: string[];
  private enabledTypes: Map<string, boolean>;

  private readonly cursor: Cursor;

  private readonly lineModel = new LineModel();
  private readonly visualHighlights = new Highlight();
  private readonly fileExplorer = new FileExplorer();
  private readonly agentTimeline: AgentTimeline;
  private readonly pendingEntryLoads = new Set<string>();
  private lazyContentModeEnabled = false;
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
      flexWrap: "no-wrap",
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

    this.agent = new OpenCode({
      initialUpdates: options.initialAgentUpdates ?? [],
      onUpdatesChanged: options.onAgentUpdatesChanged,
    });

    this.prompt = new Prompt({
      promptComposer: this.promptComposer,
      resolveLayout: (target, fallbackAnchorLine) =>
        this.resolvePromptComposerLayout(target, fallbackAnchorLine),
    });

    this.appRenderer = new AppRenderer({
      renderer: this.renderer,
      root: this.root,
      chipsRow: this.chipsRow,
      scrollbox: this.scrollbox,
      promptComposer: this.promptComposer,
      state: this.state,
      cursor: this.cursor,
      lineModel: this.lineModel,
      visualHighlights: this.visualHighlights,
      fileExplorer: this.fileExplorer,
      agentTimeline: this.agentTimeline,
      documentBlocks: this.documentBlocks,
      getEntries: () => this.entries,
      getSortedTypes: () => this.sortedTypes,
      getTypeCount: (type) => this.typeCounts.get(type) ?? 0,
      isTypeEnabled: (type) => this.isTypeEnabled(type),
      getFocusMode: () => this.state.focusMode,
      onChipSelected: (index) => {
        this.state.selectedChipIndex = index;
        this.setFocusMode("chips");
      },
      onToggleSelectedChip: () => this.toggleSelectedChip(),
      getUpdatesForFile: (filePath) => this.getUpdatesForFile(filePath),
      scheduleFileContentLoad: (entry) => this.scheduleFileContentLoad(entry),
      isPromptVisible: () => this.prompt.isVisible,
      refreshPromptView: () => this.prompt.refreshView(),
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
    this.enableLazyContentModeIfNeeded();
    this.recomputeTypesState();
    this.applyTheme();
  }

  public start(): void {
    this.pruneAgentUpdates();
    this.registerBindings();
    this.state.focusMode = "code";
    this.renderAll();
    this.prompt.start();
  }

  public refreshEntries(entries: CodeFileEntry[]): void {
    this.entries = entries;
    this.enableLazyContentModeIfNeeded();
    this.pruneCollapsedFiles();
    this.pruneAgentUpdates();
    this.recomputeTypesState();
    this.renderAll();
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
      openCurrentSelectionInEditor: () => this.openCurrentSelectionInEditor(),
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
      renderAll: () => this.renderAll(),
      renderChips: () => this.renderChips(),
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

  private openCurrentSelectionInEditor(): void {
    const target = this.resolveEditorTarget();
    if (!target) return;
    if (!process.env.EDITOR?.trim()) return;

    let suspended = false;
    try {
      this.renderer.suspend();
      suspended = true;
      openFileInEditor(target.filePath, target.fileLine);
    } finally {
      if (suspended) {
        this.renderer.resume();
      }
    }

    this.renderAll({ cursorTargetFilePath: target.filePath });
  }

  private resolveEditorTarget(): { filePath: string; fileLine: number } | null {
    if (this.state.viewMode === "files") {
      const row = this.fileExplorer.getRowAtLine(this.cursor.cursorLine);
      if (!row || row.kind !== "file") return null;
      return { filePath: row.filePath, fileLine: 1 };
    }

    const update = this.getAgentUpdateAtCursorLine();
    if (update) {
      return {
        filePath: update.filePath,
        fileLine: update.selectionEndFileLine,
      };
    }

    const lineInfo = this.lineModel.getVisibleLineInfo(this.cursor.cursorLine);
    if (!lineInfo) return null;
    return {
      filePath: lineInfo.filePath,
      fileLine: typeof lineInfo.fileLine === "number" ? lineInfo.fileLine : 1,
    };
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
    const upsertPayload: OpenCodeSubmission = {
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
    this.state.selectedChipIndex = wrapIndex(nextIndex, chipCount);
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
    this.renderAll();
  }

  /** Applies active theme colors to always-mounted UI containers and overlays. */
  private applyTheme(): void {
    this.appRenderer.applyTheme();
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
    if (typeof cursorTargetFilePath === "string") {
      this.cursor.goToLineAtMinVisibleHeight(this.cursor.cursorLine);
    }
  }

  private renderChips(): void {
    this.appRenderer.renderChips();
  }

  private renderContent(options: { cursorTargetFilePath?: string } = {}): void {
    this.appRenderer.renderContent(options);
  }

  private getUpdatesForFile(filePath: string): AgentUpdate[] {
    return Layout.getUpdatesForFile(this.agent.getMutableUpdates(), filePath);
  }

  private renderAll(options: { cursorTargetFilePath?: string } = {}): void {
    this.appRenderer.renderAll(options);
  }

  private getViewportHeight(): number {
    return this.appRenderer.getViewportHeight();
  }

  private getMaxScrollTop(): number {
    return this.appRenderer.getMaxScrollTop();
  }

  /** Computes absolute prompt-overlay layout anchored below selected content line. */
  private resolvePromptComposerLayout(
    target: PromptTarget | null,
    fallbackAnchorLine: number | null,
  ): PromptComposerLayout {
    return this.appRenderer.resolvePromptComposerLayout(target, fallbackAnchorLine);
  }

  private applyLineHighlights(): void {
    this.appRenderer.applyLineHighlights();
  }

  private deleteCurrentAgentPrompt(): void {
    const update = this.getAgentUpdateAtCursorLine();
    if (!update) return;
    this.agent.remove(update.id);
  }

  private getAnchorDividerDisplayRow(anchor: { filePath: string; dividerRow: number }): number {
    return this.appRenderer.getAnchorDividerDisplayRow(anchor);
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

  private enableLazyContentModeIfNeeded(): void {
    if (this.lazyContentModeEnabled) return;
    if (this.entries.length < LAZY_CONTENT_MODE_FILE_THRESHOLD) return;
    if (this.entries.every((entry) => entry.isContentLoaded)) return;

    this.lazyContentModeEnabled = true;
    this.fileExplorer.collapseAll(this.entries);
    this.state.viewMode = modes.setMode("files");
  }

  private scheduleFileContentLoad(entry: CodeFileEntry): void {
    if (entry.isContentLoaded) return;
    if (this.pendingEntryLoads.has(entry.relativePath)) return;

    this.pendingEntryLoads.add(entry.relativePath);
    void hydrateCodeFileEntry(entry)
      .then(() => {
        this.pendingEntryLoads.delete(entry.relativePath);
        this.renderContent({ cursorTargetFilePath: entry.relativePath });
      })
      .catch((error: unknown) => {
        this.pendingEntryLoads.delete(entry.relativePath);
        if (!isMissingCodeFileError(error)) return;

        const nextEntries = this.entries.filter(
          (candidate) => candidate.relativePath !== entry.relativePath,
        );
        if (nextEntries.length === this.entries.length) return;
        this.refreshEntries(nextEntries);
      });
  }

}
