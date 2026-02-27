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
import { ShortcutsModal } from "./shortcuts_modal";
import { SIGNALS, deregister, register, type SignalGroup } from "../signals";
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
import { VirtualCodeBlocks } from "./virtual_code_blocks";
import {
  PERSISTED_UI_STATE_VERSION,
  type PersistedCursorState,
  type PersistedUiState,
} from "../persistence";

type CodeBrowserAppOptions = {
  workspaceRootDir?: string;
  initialPersistedUiState?: PersistedUiState | null;
  initialAgentUpdates?: AgentUpdate[];
  onAgentUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

type LastCodeCursorSnapshot = {
  filePath: string;
  fileLine: number;
  lineText: string | null;
};

const ACTION_CHIPS: readonly string[] = [];
const LAZY_CONTENT_MODE_FILE_THRESHOLD = 250;

export class CodeBrowserApp {
  private readonly renderer: CliRenderer;
  private readonly workspaceRootDir: string;
  private entries: CodeFileEntry[];
  private readonly state = new AppStateStore();

  private readonly root: BoxRenderable;
  private readonly chipsRow: BoxRenderable;
  private readonly scrollbox: ScrollBoxRenderable;
  private readonly promptComposer: PromptComposerBar;
  private readonly shortcutsModal: ShortcutsModal;
  private readonly camera: Camera;
  private readonly navigation: Navigation;
  private readonly agent: OpenCode;
  private readonly prompt: Prompt;
  private readonly appRenderer: AppRenderer;
  private readonly documentBlocks: DocumentBlocks;

  private typeCounts: Map<string, number>;
  private hiddenTypeCounts: Map<string, number>;
  private sortedTypes: string[];
  private enabledTypes: Map<string, boolean>;

  private readonly cursor: Cursor;

  private readonly lineModel = new LineModel();
  private readonly visualHighlights = new Highlight();
  private readonly fileExplorer = new FileExplorer();
  private readonly virtualCodeBlocks = new VirtualCodeBlocks(this.fileExplorer);
  private readonly agentTimeline: AgentTimeline;
  private readonly pendingEntryLoads = new Set<string>();
  private lazyContentModeEnabled = false;
  private pendingPersistedCursorState: PersistedCursorState | null = null;
  private lastCodeCursorSnapshot: LastCodeCursorSnapshot | null = null;
  private readonly sourceCleanupFns: Array<() => void> = [];
  private readonly signalRegistrationIds: string[] = [];

  constructor(renderer: CliRenderer, entries: CodeFileEntry[], options: CodeBrowserAppOptions = {}) {
    this.renderer = renderer;
    this.workspaceRootDir = options.workspaceRootDir ?? process.cwd();
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
    this.shortcutsModal = new ShortcutsModal(renderer);

    this.root.add(this.promptComposer.renderable);
    this.root.add(this.shortcutsModal.renderable);
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
      rootDir: this.workspaceRootDir,
      initialUpdates: options.initialAgentUpdates ?? [],
      onUpdatesChanged: options.onAgentUpdatesChanged,
    });

    this.prompt = new Prompt({
      rootDir: this.workspaceRootDir,
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
      virtualCodeBlocks: this.virtualCodeBlocks,
      agentTimeline: this.agentTimeline,
      documentBlocks: this.documentBlocks,
      getEntries: () => this.getVisibleEntries(),
      getSortedTypes: () => this.sortedTypes,
      getTypeCounts: (type) => this.getTypeCounts(type),
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
    this.hiddenTypeCounts = new Map();
    this.sortedTypes = [];
    this.enabledTypes = new Map();
    this.enableLazyContentModeIfNeeded();
    if (options.initialPersistedUiState) {
      this.applyPersistedUiState(options.initialPersistedUiState);
    } else {
      this.recomputeTypesState();
    }
    this.applyTheme();
  }

  public start(): void {
    this.pruneAgentUpdates();
    this.registerBindings();
    this.state.focusMode = "code";
    this.renderAll({ preferFirstAnchor: this.lazyContentModeEnabled });
    this.restorePersistedCursorState();
    this.prompt.start();
  }

  public refreshEntries(entries: CodeFileEntry[]): void {
    this.entries = entries;
    this.enableLazyContentModeIfNeeded();
    this.pruneCollapsedFiles();
    this.pruneIgnoredFiles();
    this.pruneAgentUpdates();
    this.recomputeTypesState();
    this.renderAll({ preferFirstAnchor: this.lazyContentModeEnabled });
  }

  public getAgentUpdates(): AgentUpdate[] {
    return this.agent.getUpdates();
  }

  public getPersistenceSnapshot(): PersistedUiState {
    const persistedCursor = this.resolveCursorForPersistence();
    const enabledTypeLabels: Record<string, boolean> = {};
    const sortedEntries = [...this.enabledTypes.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [typeLabel, enabled] of sortedEntries) {
      enabledTypeLabels[typeLabel] = enabled;
    }

    return {
      version: PERSISTED_UI_STATE_VERSION,
      chips: {
        selectedChipIndex: this.state.selectedChipIndex,
        chipWindowStartIndex: this.state.chipWindowStartIndex,
        enabledTypeLabels,
      },
      files: {
        ignoredPaths: this.fileExplorer.getIgnoredFiles(),
        collapsedPaths: this.fileExplorer.getCollapsedFiles(),
        fileBlockCollapsed: this.fileExplorer.isFilePageCollapsed(),
        directoryPath: this.fileExplorer.getDirectoryPath(),
      },
      cursor: persistedCursor,
    };
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
      toggleShortcutsModal: () => this.toggleShortcutsModal(),
      scrollShortcutsModalByLines: (delta) => this.scrollShortcutsModalByLines(delta),
      scrollShortcutsModalByPages: (delta) => this.scrollShortcutsModalByPages(delta),
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
      ignoreCurrentFile: () => this.ignoreCurrentFile(),
      resetVisibilityState: () => this.resetVisibilityState(),
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

    this.onSignal(SIGNALS.cursorChanged, () => this.updateLastCodeCursorSnapshot());

    this.sourceCleanupFns.push(
      registerKeyboardSignalBindings(this.renderer.keyInput, () => this.getKeyboardStateSnapshot()),
    );
    this.sourceCleanupFns.push(registerScrollSignalBindings(this.scrollbox.verticalScrollBar));
    this.sourceCleanupFns.push(registerSystemSignalBindings(process.stdout, this.renderer));
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
      promptField: this.prompt.isVisible ? this.prompt.currentField : null,
      shortcutsVisible: this.shortcutsModal.isVisible,
    };
  }

  private openFromCurrentSelection(): void {
    if (!this.cursor.isVisualModeEnabled) {
      const opened = this.openSelectedVirtualRow();
      if (opened) return;
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
      openFileInEditor(target.filePath, target.fileLine, this.workspaceRootDir);
    } finally {
      if (suspended) {
        this.renderer.resume();
      }
    }

    this.renderAll({
      cursorTargetFilePath:
        target.source === "virtual" ? this.virtualCodeBlocks.getDefaultAnchorPath() : target.filePath,
    });
  }

  private resolveEditorTarget(): { filePath: string; fileLine: number; source: "virtual" | "content" } | null {
    const virtualTarget = this.virtualCodeBlocks.resolveEditorTargetAtLine(this.cursor.cursorLine);
    if (virtualTarget) {
      return {
        ...virtualTarget,
        source: "virtual",
      };
    }

    const update = this.getAgentUpdateAtCursorLine();
    if (update) {
      return {
        filePath: update.filePath,
        fileLine: update.selectionEndFileLine,
        source: "content",
      };
    }

    const lineInfo = this.lineModel.getVisibleLineInfo(this.cursor.cursorLine);
    if (!lineInfo) return null;
    if (lineInfo.filePath.startsWith("virtual://")) return null;
    return {
      filePath: lineInfo.filePath,
      fileLine: typeof lineInfo.fileLine === "number" ? lineInfo.fileLine : 1,
      source: "content",
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
        viewMode: update.contextMode,
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
      this.cursor,
      this.lineModel,
      this.virtualCodeBlocks.getRowsByLine(),
      this.virtualCodeBlocks.getDefaultPromptFilePath(),
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
      selection,
      this.virtualCodeBlocks.getRowsByLine(),
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

  private updateLastCodeCursorSnapshot(): void {
    const lineInfo = this.lineModel.getVisibleLineInfo(this.cursor.cursorLine);
    if (!lineInfo || lineInfo.blockKind !== "code") return;
    if (!isPersistableFilePath(lineInfo.filePath)) return;
    if (typeof lineInfo.fileLine !== "number") return;

    this.lastCodeCursorSnapshot = {
      filePath: lineInfo.filePath,
      fileLine: lineInfo.fileLine,
      lineText: lineInfo.text,
    };
  }

  private resolveCursorForPersistence(): PersistedCursorState {
    this.updateLastCodeCursorSnapshot();

    const currentLineInfo = this.lineModel.getVisibleLineInfo(this.cursor.cursorLine);
    if (
      currentLineInfo?.blockKind === "collapsed" &&
      this.lastCodeCursorSnapshot &&
      this.entries.some((entry) => entry.relativePath === this.lastCodeCursorSnapshot?.filePath)
    ) {
      const mappedGlobalLine = this.lineModel.findGlobalLineForFileLine(
        this.lastCodeCursorSnapshot.filePath,
        this.lastCodeCursorSnapshot.fileLine,
      );
      return {
        globalLine: mappedGlobalLine ?? this.cursor.cursorLine,
        filePath: this.lastCodeCursorSnapshot.filePath,
        fileLine: this.lastCodeCursorSnapshot.fileLine,
        lineText: this.lastCodeCursorSnapshot.lineText,
      };
    }

    return {
      globalLine: this.cursor.cursorLine,
      filePath: currentLineInfo?.filePath ?? null,
      fileLine: currentLineInfo?.fileLine ?? null,
      lineText: currentLineInfo?.text ?? null,
    };
  }

  private applyPersistedUiState(persistedState: PersistedUiState): void {
    this.state.selectedChipIndex = toNonNegativeInteger(persistedState.chips.selectedChipIndex);
    this.state.chipWindowStartIndex = toNonNegativeInteger(persistedState.chips.chipWindowStartIndex);
    this.enabledTypes = new Map(Object.entries(persistedState.chips.enabledTypeLabels));

    this.fileExplorer.setIgnoredFiles(persistedState.files.ignoredPaths);
    this.fileExplorer.setCollapsedFiles(persistedState.files.collapsedPaths);
    this.fileExplorer.setFilePageCollapsed(persistedState.files.fileBlockCollapsed);
    this.fileExplorer.setDirectoryPath(persistedState.files.directoryPath);
    this.ensurePersistedCursorVisibility(persistedState.cursor);

    if (isPersistableFilePath(persistedState.cursor.filePath ?? "") && typeof persistedState.cursor.fileLine === "number") {
      this.lastCodeCursorSnapshot = {
        filePath: persistedState.cursor.filePath ?? "",
        fileLine: persistedState.cursor.fileLine,
        lineText: persistedState.cursor.lineText,
      };
    }

    this.pruneCollapsedFiles();
    this.pruneIgnoredFiles();
    this.recomputeTypesState();
    this.pendingPersistedCursorState = persistedState.cursor;
  }

  private ensurePersistedCursorVisibility(cursor: PersistedCursorState): void {
    const filePath = cursor.filePath;
    if (!filePath) return;

    if (filePath === "." || filePath.startsWith(FileExplorer.FILE_PAGE_ANCHOR_PATH)) {
      this.fileExplorer.setFilePageCollapsed(false);
      return;
    }

    if (filePath.startsWith("virtual://")) {
      return;
    }

    this.fileExplorer.expandFile(filePath);
  }

  private restorePersistedCursorState(): void {
    const persistedCursorState = this.pendingPersistedCursorState;
    if (!persistedCursorState) return;
    if (this.lineModel.totalLines <= 0) return;
    const restoreTarget = this.resolvePersistedCursorLine(persistedCursorState);
    this.cursor.goToLine(restoreTarget.line, "auto");
    if (!restoreTarget.shouldRetry) {
      this.pendingPersistedCursorState = null;
    }
  }

  private resolvePersistedCursorLine(cursor: PersistedCursorState): {
    line: number;
    shouldRetry: boolean;
  } {
    const filePath = cursor.filePath;
    if (!filePath) {
      return { line: 1, shouldRetry: false };
    }

    if (filePath === "." || filePath.startsWith("virtual://")) {
      const mappedVirtualLine = this.lineModel.findFirstGlobalLineForFilePath(filePath);
      return {
        line: mappedVirtualLine ?? 1,
        shouldRetry: false,
      };
    }

    const targetEntry = this.entries.find((entry) => entry.relativePath === filePath);
    if (!targetEntry) {
      return { line: 1, shouldRetry: false };
    }

    const persistedText = normalizePersistedLineText(cursor.lineText);
    if (typeof cursor.fileLine === "number") {
      const mappedByLine = this.lineModel.findGlobalLineForFileLine(filePath, cursor.fileLine);
      if (typeof mappedByLine === "number") {
        if (persistedText === null) {
          return {
            line: mappedByLine,
            shouldRetry: !targetEntry.isContentLoaded && cursor.fileLine > 1,
          };
        }

        const mappedText = normalizePersistedLineText(
          this.lineModel.getVisibleLineInfo(mappedByLine)?.text ?? null,
        );
        if (mappedText === persistedText) {
          return {
            line: mappedByLine,
            shouldRetry: false,
          };
        }
      }
    }

    if (persistedText !== null) {
      const matchedByText = this.findClosestLineByPersistedText(filePath, persistedText, cursor.fileLine);
      if (typeof matchedByText === "number") {
        return {
          line: matchedByText,
          shouldRetry: false,
        };
      }
    }

    if (typeof cursor.fileLine === "number") {
      const closestByLine = this.findClosestLineByPersistedFileLine(filePath, cursor.fileLine);
      if (typeof closestByLine === "number") {
        return {
          line: closestByLine,
          shouldRetry: false,
        };
      }
    }

    const firstLineInFile = this.lineModel.findFirstGlobalLineForFilePath(filePath);
    if (typeof firstLineInFile === "number") {
      return {
        line: firstLineInFile,
        shouldRetry: !targetEntry.isContentLoaded,
      };
    }

    return {
      line: 1,
      shouldRetry: false,
    };
  }

  private findClosestLineByPersistedText(
    filePath: string,
    persistedText: string,
    preferredFileLine: number | null,
  ): number | undefined {
    let bestLine: number | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const block of this.lineModel.blocks) {
      if (block.filePath !== filePath || block.blockKind !== "code") continue;
      if (block.fileLineStart === null) continue;

      for (let offset = 0; offset < block.renderedLines.length; offset += 1) {
        const candidateText = normalizePersistedLineText(block.renderedLines[offset] ?? null);
        if (candidateText !== persistedText) continue;

        const candidateGlobalLine = block.lineStart + offset;
        const candidateFileLine = block.fileLineStart + offset;
        const distance = typeof preferredFileLine === "number"
          ? Math.abs(candidateFileLine - preferredFileLine)
          : 0;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestLine = candidateGlobalLine;
          continue;
        }

        if (distance === bestDistance && (bestLine === undefined || candidateGlobalLine < bestLine)) {
          bestLine = candidateGlobalLine;
        }
      }
    }

    return bestLine;
  }

  private findClosestLineByPersistedFileLine(filePath: string, preferredFileLine: number): number | undefined {
    let bestLine: number | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const block of this.lineModel.blocks) {
      if (block.filePath !== filePath || block.blockKind !== "code") continue;
      if (block.fileLineStart === null) continue;

      const blockLength = Math.max(1, block.lineEnd - block.lineStart + 1);
      for (let offset = 0; offset < blockLength; offset += 1) {
        const candidateGlobalLine = block.lineStart + offset;
        const candidateFileLine = block.fileLineStart + offset;
        const distance = Math.abs(candidateFileLine - preferredFileLine);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestLine = candidateGlobalLine;
          continue;
        }

        if (distance === bestDistance && (bestLine === undefined || candidateGlobalLine < bestLine)) {
          bestLine = candidateGlobalLine;
        }
      }
    }

    return bestLine;
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
    this.enabledTypes.set(FileExplorer.FILE_PAGE_TYPE_LABEL, true);
    this.virtualCodeBlocks.setFileBlockCollapsed(false);
    this.renderChips();
    this.renderContent({ cursorTargetFilePath: this.virtualCodeBlocks.getDefaultAnchorPath() });
    this.cursor.goToLineAtMinVisibleHeight(this.cursor.cursorLine);
  }

  /** Cycles to next theme and re-renders themed UI surfaces. */
  private toggleTheme(): void {
    theme.toggleTheme();
    this.renderAll();
  }

  /** Applies active theme colors to always-mounted UI containers and overlays. */
  private applyTheme(): void {
    this.appRenderer.applyTheme();
    this.shortcutsModal.applyTheme();
  }

  private toggleShortcutsModal(): void {
    this.shortcutsModal.toggle();
  }

  private scrollShortcutsModalByLines(delta: number): void {
    this.shortcutsModal.scrollByLines(delta);
  }

  private scrollShortcutsModalByPages(delta: number): void {
    this.shortcutsModal.scrollByPage(delta);
  }

  private toggleCurrentStructureCollapse(): void {
    const currentFilePath = this.lineModel.getCurrentFilePath(this.cursor.cursorLine);
    if (this.virtualCodeBlocks.toggleFileBlockCollapseAtLine(this.cursor.cursorLine) || currentFilePath === ".") {
      this.renderContent({ cursorTargetFilePath: this.virtualCodeBlocks.getDefaultAnchorPath() });
      return;
    }
    this.toggleCurrentFileCollapse();
  }

  private openSelectedVirtualRow(): boolean {
    const result = this.virtualCodeBlocks.openAtLine(this.cursor.cursorLine);
    if (result.enteredDirectory) {
      this.renderContent({ cursorTargetFilePath: this.virtualCodeBlocks.getDefaultAnchorPath() });
      this.cursor.goToLineAtMinVisibleHeight(this.cursor.cursorLine);
      return true;
    }
    if (!result.openedFilePath) return false;
    this.openFileFromExplorer(result.openedFilePath);
    return true;
  }

  private openFileFromExplorer(filePath: string): void {
    this.fileExplorer.openFile(filePath);
    this.renderContent();
  }

  private enterCurrentDirectory(): void {
    const changed = this.virtualCodeBlocks.enterDirectoryAtLine(this.cursor.cursorLine);
    if (!changed) return;
    this.renderContent({ cursorTargetFilePath: this.virtualCodeBlocks.getDefaultAnchorPath() });
    this.cursor.goToLineAtMinVisibleHeight(this.cursor.cursorLine);
  }

  private goToParentDirectory(): void {
    const changed = this.virtualCodeBlocks.goToParentDirectoryForLine(this.cursor.cursorLine);
    if (!changed) return;
    this.renderContent({ cursorTargetFilePath: this.virtualCodeBlocks.getDefaultAnchorPath() });
    this.cursor.goToLineAtMinVisibleHeight(this.cursor.cursorLine);
  }

  private toggleCurrentFileCollapse(): void {
    const currentFilePath = this.lineModel.getCurrentFilePath(this.cursor.cursorLine);
    const changed = this.fileExplorer.toggleCollapse(currentFilePath);
    if (!changed) return;

    const cursorTargetFilePath =
      currentFilePath && this.fileExplorer.isCollapsed(currentFilePath) ? currentFilePath : undefined;
    this.renderContent({ cursorTargetFilePath });
    if (typeof cursorTargetFilePath === "string") {
      this.cursor.goToLineAtMinVisibleHeight(this.cursor.cursorLine);
    }
  }

  private ignoreCurrentFile(): void {
    const filePath = this.resolveIgnorableFilePathAtCursor();
    if (!filePath) return;
    const changed = this.fileExplorer.ignoreFile(filePath);
    if (!changed) return;

    this.recomputeTypesState();
    this.renderAll();
  }

  private resolveIgnorableFilePathAtCursor(): string | null {
    const row = this.virtualCodeBlocks.getRowAtLine(this.cursor.cursorLine);
    if (row?.kind === "file") {
      return this.entries.some((entry) => entry.relativePath === row.filePath) ? row.filePath : null;
    }

    const currentFilePath = this.lineModel.getCurrentFilePath(this.cursor.cursorLine);
    if (!currentFilePath || currentFilePath === "." || currentFilePath.startsWith("virtual://")) {
      return null;
    }
    return this.entries.some((entry) => entry.relativePath === currentFilePath) ? currentFilePath : null;
  }

  private resetVisibilityState(): void {
    this.fileExplorer.unignoreAll();
    this.fileExplorer.expandAll();
    this.recomputeTypesState();

    for (const type of this.sortedTypes) {
      this.enabledTypes.set(type, true);
    }

    this.renderAll();
  }

  private renderChips(): void {
    this.appRenderer.renderChips();
  }

  private renderContent(options: { cursorTargetFilePath?: string; preferFirstAnchor?: boolean } = {}): void {
    this.appRenderer.renderContent(options);
  }

  private getUpdatesForFile(filePath: string): AgentUpdate[] {
    return Layout.getUpdatesForFile(this.agent.getMutableUpdates(), filePath);
  }

  private renderAll(options: { cursorTargetFilePath?: string; preferFirstAnchor?: boolean } = {}): void {
    this.appRenderer.renderAll(options);
    if (this.shortcutsModal.isVisible) {
      this.shortcutsModal.refreshLayout();
    }
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

  private getVisibleEntries(): CodeFileEntry[] {
    return this.entries.filter((entry) => !this.fileExplorer.isIgnored(entry.relativePath));
  }

  private getTypeCounts(type: string): { shown: number; hidden: number } {
    const hidden = this.hiddenTypeCounts.get(type) ?? 0;
    const total = this.typeCounts.get(type) ?? 0;
    return {
      shown: Math.max(0, total - hidden),
      hidden,
    };
  }

  private recomputeTypesState(): void {
    const nextState = recomputeTypeState(
      this.entries,
      this.enabledTypes,
      this.state.selectedChipIndex,
      ACTION_CHIPS.length,
      this.virtualCodeBlocks.getSupplementalTypes(),
    );
    this.typeCounts = nextState.typeCounts;
    this.hiddenTypeCounts = this.computeHiddenTypeCounts();
    this.sortedTypes = nextState.sortedTypes;
    this.enabledTypes = nextState.enabledTypes;
    this.state.selectedChipIndex = nextState.selectedChipIndex;
  }

  private computeHiddenTypeCounts(): Map<string, number> {
    const hiddenTypeCounts = new Map<string, number>();
    for (const entry of this.entries) {
      if (!this.fileExplorer.isIgnored(entry.relativePath)) continue;
      hiddenTypeCounts.set(entry.typeLabel, (hiddenTypeCounts.get(entry.typeLabel) ?? 0) + 1);
    }
    return hiddenTypeCounts;
  }

  private pruneAgentUpdates(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    existing.add(".");
    this.agent.pruneForEntries(existing);
  }

  private pruneCollapsedFiles(): void {
    this.fileExplorer.pruneCollapsedFiles(this.entries);
  }

  private pruneIgnoredFiles(): void {
    this.fileExplorer.pruneIgnoredFiles(this.entries);
  }

  private enableLazyContentModeIfNeeded(): void {
    if (this.lazyContentModeEnabled) return;
    if (this.entries.length < LAZY_CONTENT_MODE_FILE_THRESHOLD) return;
    if (this.entries.every((entry) => entry.isContentLoaded)) return;

    this.lazyContentModeEnabled = true;
    this.fileExplorer.collapseAll(this.entries);
  }

  private scheduleFileContentLoad(entry: CodeFileEntry): void {
    if (entry.isContentLoaded) return;
    if (this.pendingEntryLoads.has(entry.relativePath)) return;

    this.pendingEntryLoads.add(entry.relativePath);
    void hydrateCodeFileEntry(entry, this.workspaceRootDir)
      .then(() => {
        this.pendingEntryLoads.delete(entry.relativePath);
        this.renderContent();
        this.restorePersistedCursorState();
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

function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizePersistedLineText(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const withoutTrailingCarriageReturn = value.endsWith("\r") ? value.slice(0, -1) : value;
  return withoutTrailingCarriageReturn;
}

function isPersistableFilePath(filePath: string): boolean {
  return filePath.length > 0 && filePath !== "." && !filePath.startsWith("virtual://");
}
