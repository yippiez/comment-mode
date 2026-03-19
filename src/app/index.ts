import {
    BoxRenderable,
    ScrollBoxRenderable,
    type CliRenderer,
    type KeyEvent,
    type PasteEvent,
} from "@opentui/core";
import { Camera } from "../controllers/camera";
import { OpenCode, type OpenCodeSubmission } from "../integrations/opencode";
import { Layout } from "../controllers/layout";
import { hydrateCodeFileEntry, isMissingCodeFileError } from "../files";
import { NavigationController } from "../controllers/navigation";
import {
    Prompt,
    type PromptTarget,
    type PromptSubmission,
} from "../controllers/prompt";
import { PromptComposerBar, type PromptComposerLayout } from "./prompt-composer-bar";
import { ShortcutsModal } from "./shortcuts_modal";
import { SIGNALS, type Signal } from "../signals";
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
import { Highlight } from "../controllers/highlight";
import type { PromptComposerField } from "./prompt-composer-bar";
import type { AppKeyInput } from "../types";
import {
    createPromptTargetFromSelection,
} from "./selection";
import { FileExplorer } from "./file_explorer";
import { AgentTimeline } from "./agent_timeline";
import { DocumentBlocks } from "./document_blocks";
import { AppRenderer } from "./renderer";
import { VirtualCodeBlocks } from "./virtual_code_blocks";
import {
    PERSISTED_UI_STATE_VERSION,
    type PersistedUiState,
} from "../persistence";
import type { PersistedUiGroup } from "../groups";
import { GroupNameModal } from "./group_name_modal";
import { ChipSelectionController } from "./chip_selection_controller";
import { GroupManagementController } from "./group_management_controller";
import { PersistedCursorController } from "./persisted_cursor_controller";

type CodeBrowserAppOptions = {
  workspaceRootDir?: string;
  initialPersistedUiState?: PersistedUiState | null;
  initialPersistedGroups?: PersistedUiGroup[];
  onPersistedGroupsChanged?: (groups: PersistedUiGroup[]) => void;
  initialAgentUpdates?: AgentUpdate[];
  onAgentUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

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
    private readonly groupNameModal: GroupNameModal;
    private readonly shortcutsModal: ShortcutsModal;
    private readonly camera: Camera;
    private readonly navigation: NavigationController;
    private readonly chipSelection: ChipSelectionController;
    private readonly groupManagement: GroupManagementController;
    private readonly persistedCursor: PersistedCursorController;
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
    private readonly bindingCleanupFns: Array<() => void> = [];
    private pendingGChordAt: number | null = null;

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
        this.groupNameModal = new GroupNameModal(renderer);
        this.shortcutsModal = new ShortcutsModal(renderer);

        this.root.add(this.promptComposer.renderable);
        this.root.add(this.groupNameModal.renderable);
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
        this.persistedCursor = new PersistedCursorController({
            cursor: this.cursor,
            lineModel: this.lineModel,
            fileExplorer: this.fileExplorer,
            getEntries: () => this.entries,
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

        this.typeCounts = new Map();
        this.hiddenTypeCounts = new Map();
        this.sortedTypes = [];
        this.enabledTypes = new Map();
        this.groupManagement = new GroupManagementController({
            initialGroups: options.initialPersistedGroups ?? [],
            groupNameModal: this.groupNameModal,
            onPersistedGroupsChanged: options.onPersistedGroupsChanged,
            getTypeChipCount: () => this.sortedTypes.length,
            getSelectedChipIndex: () => this.state.selectedChipIndex,
            setSelectedChipIndex: (index) => {
                this.state.selectedChipIndex = index;
            },
            getPersistenceSnapshot: () => this.getPersistenceSnapshot(),
            applyPersistedUiState: (state) => this.applyPersistedUiState(state),
            recomputeTypesState: () => this.recomputeTypesState(),
            renderChips: () => this.renderChips(),
            renderAll: () => this.renderAll(),
            restorePersistedCursorState: () => this.persistedCursor.restore(),
        });
        this.chipSelection = new ChipSelectionController({
            getChipCount: () => this.sortedTypes.length + this.groupManagement.getGroups().length,
            getSelectedChipIndex: () => this.state.selectedChipIndex,
            setSelectedChipIndex: (index) => {
                this.state.selectedChipIndex = index;
            },
            resolveSelectedTarget: () => {
                const selectedChipIndex = this.state.selectedChipIndex;
                if (selectedChipIndex < this.sortedTypes.length) {
                    const selectedType = this.sortedTypes[selectedChipIndex];
                    return selectedType ? { kind: "type", type: selectedType } : null;
                }

                const selectedGroup = this.groupManagement.getSelectedGroup();
                return selectedGroup ? { kind: "group", groupId: selectedGroup.id } : null;
            },
            isTypeEnabled: (type) => this.isTypeEnabled(type),
            setTypeEnabled: (type, enabled) => {
                this.enabledTypes.set(type, enabled);
            },
            applyGroupSnapshot: (groupId) => this.groupManagement.applyGroupSnapshot(groupId),
            renderChips: () => this.renderChips(),
            renderContent: () => this.renderContent(),
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
            getGroupChips: () => this.groupManagement.getGroupChipDescriptors(),
            getTypeCounts: (type) => this.getTypeCounts(type),
            isTypeEnabled: (type) => this.isTypeEnabled(type),
            getFocusMode: () => this.state.focusMode,
            onChipSelected: (index) => {
                this.state.selectedChipIndex = index;
                this.setFocusMode("chips");
            },
            onToggleSelectedChip: () => this.chipSelection.toggleSelected(),
            getUpdatesForFile: (filePath) => this.getUpdatesForFile(filePath),
            scheduleFileContentLoad: (entry) => this.scheduleFileContentLoad(entry),
            isPromptVisible: () => this.prompt.isVisible,
            refreshPromptView: () => this.prompt.refreshView(),
        });

        this.navigation = new NavigationController({
            cursor: this.cursor,
            camera: this.camera,
            lineModel: this.lineModel,
            getAgentPromptLines: () => this.agentTimeline.getPromptLines(),
            getAnchorDividerDisplayRow: (anchor) => this.getAnchorDividerDisplayRow(anchor),
        });

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
        void this.persistedCursor.restoreAfterRender(this.renderer);
        this.prompt.start();
    }

    public refreshEntries(entries: CodeFileEntry[]): void {
        this.entries = entries;
        this.enableLazyContentModeIfNeeded();
        this.pruneCollapsedFiles();
        this.pruneAgentUpdates();
        this.recomputeTypesState();
        this.renderAll({ preferFirstAnchor: this.lazyContentModeEnabled });
    }

    public getAgentUpdates(): AgentUpdate[] {
        return this.agent.getUpdates();
    }

    public getPersistenceSnapshot(): PersistedUiState {
        const persistedCursor = this.persistedCursor.resolveCursorForPersistence();
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
                collapsedPaths: this.fileExplorer.getCollapsedFiles(),
                fileBlockCollapsed: this.fileExplorer.isFilePageCollapsed(),
                directoryPath: this.fileExplorer.getDirectoryPath(),
            },
            cursor: persistedCursor,
            prompt: this.prompt.getPersistedModelConfig(),
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
        if (this.bindingCleanupFns.length > 0) return;

        const resizeState: {
      pendingResizeRerender?: ReturnType<typeof setTimeout>;
      pendingResizeSettleRerender?: ReturnType<typeof setTimeout>;
    } = {};

        this.onSignal(SIGNALS.shortcutsToggle, () => {
            this.toggleShortcutsModal();
        });

        this.onSignal(SIGNALS.shortcutsScrollLines, (delta) => {
            this.scrollShortcutsModalByLines(delta);
        });

        this.onSignal(SIGNALS.shortcutsScrollPages, (delta) => {
            this.scrollShortcutsModalByPages(delta);
        });

        this.onSignal(SIGNALS.themeToggle, () => {
            this.toggleTheme();
        });

        this.onSignal(SIGNALS.focusToggleCodeChips, () => {
            this.setFocusMode(this.state.focusMode === "chips" ? "code" : "chips");
        });

        this.onSignal(SIGNALS.appQuit, () => {
            this.renderer.destroy();
        });

        this.onSignal(SIGNALS.chipsMove, (delta) => {
            this.chipSelection.moveSelection(delta);
        });

        this.onSignal(SIGNALS.chipsToggleSelected, () => {
            this.chipSelection.toggleSelected();
        });

        this.onSignal(SIGNALS.cursorMove, (delta, repeated) => {
            if (this.navigation.shouldThrottleRepeatedMove(repeated)) {
                return;
            }
            this.cursor.moveBy(delta);
        });

        this.onSignal(SIGNALS.cursorPage, (delta) => {
            this.cursor.moveBy(this.cursor.pageStep() * delta);
            if (delta < 0) {
                this.cursor.goToMinVisibleHeight();
                return;
            }
            this.cursor.goToMaxVisibleHeight();
        });

        this.onSignal(SIGNALS.visualToggle, () => {
            this.cursor.toggleVisualMode();
        });

        this.onSignal(SIGNALS.visualExit, () => {
            this.cursor.disableVisualMode();
        });

        this.onSignal(SIGNALS.filesToggleExplorer, () => {
            this.toggleFilesExplorerMode();
        });

        this.onSignal(SIGNALS.filesEnterOrOpen, () => {
            this.openFromCurrentSelection();
        });

        this.onSignal(SIGNALS.filesOpenInEditor, () => {
            this.openCurrentSelectionInEditor();
        });

        this.onSignal(SIGNALS.filesEnterDirectory, () => {
            this.enterCurrentDirectory();
        });

        this.onSignal(SIGNALS.filesParentDir, () => {
            this.goToParentDirectory();
        });

        this.onSignal(SIGNALS.filesCollapseCurrent, () => {
            this.toggleCurrentStructureCollapse();
        });

        this.onSignal(SIGNALS.filesResetVisibility, () => {
            this.resetVisibilityState();
        });

        this.onSignal(SIGNALS.groupsSaveOrUpdate, () => {
            this.groupManagement.saveOrUpdateSelectedGroup();
        });

        this.onSignal(SIGNALS.groupsDeleteSelected, () => {
            this.groupManagement.deleteSelectedGroup();
        });

        this.onSignal(SIGNALS.groupsNameSubmit, () => {
            this.groupManagement.submitName();
        });

        this.onSignal(SIGNALS.groupsNameCancel, () => {
            this.groupManagement.cancelName();
        });

        this.onSignal(SIGNALS.navJumpTop, () => {
            this.navigation.jumpToTop();
        });

        this.onSignal(SIGNALS.navJumpBottom, () => {
            this.navigation.jumpToBottom();
        });

        this.onSignal(SIGNALS.navJumpNextFile, () => {
            this.navigation.jumpToNextFile();
        });

        this.onSignal(SIGNALS.navJumpPrevFile, () => {
            this.navigation.jumpToPreviousFile();
        });

        this.onSignal(SIGNALS.navJumpNextAgent, () => {
            this.navigation.jumpToNextAgent();
        });

        this.onSignal(SIGNALS.agentDeleteAtCursor, () => {
            this.deleteCurrentAgentPrompt();
        });

        this.onSignal(SIGNALS.promptClose, () => {
            this.prompt.close();
        });

        this.onSignal(SIGNALS.promptSubmit, () => {
            if (this.prompt.isVisible) {
                this.prompt.submitFromKeyboard();
                return;
            }
            this.openFromCurrentSelection();
        });

        this.onSignal(SIGNALS.promptFieldCycle, (delta) => {
            this.prompt.cycleField(delta);
        });

        this.onSignal(SIGNALS.promptModelCycle, (delta) => {
            this.prompt.cycleModel(delta);
        });

        this.onSignal(SIGNALS.promptThinkingCycle, (delta) => {
            this.prompt.cycleThinkingLevel(delta);
        });

        this.onSignal(SIGNALS.promptModelsRefresh, () => {
            this.prompt.refreshModels();
        });

        this.onSignal(SIGNALS.promptFocusModeChange, (focusMode) => {
            this.setFocusMode(focusMode);
        });

        this.onSignal(SIGNALS.promptSubmission, (submission) => {
            void this.submitPromptToAgent(submission);
        });

        this.onSignal(SIGNALS.scrollVertical, (position) => {
            this.cursor.handleExternalScroll(position);
        });

        this.onSignal(SIGNALS.cursorChanged, () => {
            this.persistedCursor.updateLastCodeCursorSnapshot();
            this.applyLineHighlights();
            if (this.prompt.isVisible) {
                this.prompt.refreshView();
            }
        });

        this.onSignal(SIGNALS.agentRenderRequested, () => {
            this.renderContent();
        });

        this.onSignal(SIGNALS.systemStdoutResize, () => {
            if (resizeState.pendingResizeRerender) {
                clearTimeout(resizeState.pendingResizeRerender);
            }
            if (resizeState.pendingResizeSettleRerender) {
                clearTimeout(resizeState.pendingResizeSettleRerender);
                resizeState.pendingResizeSettleRerender = undefined;
            }

            resizeState.pendingResizeRerender = setTimeout(() => {
                resizeState.pendingResizeRerender = undefined;
                this.renderAll();

                resizeState.pendingResizeSettleRerender = setTimeout(() => {
                    resizeState.pendingResizeSettleRerender = undefined;
                    this.renderAll();
                }, 90);
            }, 40);
        });

        this.bindingCleanupFns.push(this.registerKeyboardBindings());
        this.bindingCleanupFns.push(this.registerScrollBindings());
        this.bindingCleanupFns.push(this.registerSystemBindings());
    }

    private unregisterBindings(): void {
        for (const cleanup of this.bindingCleanupFns.splice(0)) {
            cleanup();
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onSignal(signal: Signal<any>, handler: (...args: any[]) => void): void {
        const unsub = signal(handler);
        this.bindingCleanupFns.push(unsub);
    }

    private registerKeyboardBindings(): () => void {
        const onKeypress = (key: KeyEvent): void => {
            const keyName = (key.name ?? "").toLowerCase();
            const rawKeyName = key.name;
            const state = this.getKeyboardStateSnapshot();

            if (state.groupNamePromptVisible) {
                if (keyName === "escape") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.groupsNameCancel();
                    return;
                }
                if (keyName === "return" || keyName === "enter") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.groupsNameSubmit();
                    return;
                }
                const handled = this.groupManagement.handleGroupNameInputKey(this.toAppKeyInput(key));
                if (handled) {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                }
                return;
            }

            if (state.promptVisible) {
                if (keyName === "escape") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.promptClose();
                    return;
                }
                if (keyName === "tab") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.promptFieldCycle(1);
                    return;
                }
                if (state.promptField === "model") {
                    if (keyName === "left" || keyName === "up") {
                        key.preventDefault?.();
                        key.stopPropagation?.();
                        SIGNALS.promptModelCycle(-1);
                        return;
                    }
                    if (keyName === "right" || keyName === "down") {
                        key.preventDefault?.();
                        key.stopPropagation?.();
                        SIGNALS.promptModelCycle(1);
                        return;
                    }
                    if (keyName === "r") {
                        key.preventDefault?.();
                        key.stopPropagation?.();
                        SIGNALS.promptModelsRefresh();
                        return;
                    }
                    if (keyName === "return" || keyName === "enter") {
                        key.preventDefault?.();
                        key.stopPropagation?.();
                        SIGNALS.promptFieldCycle(1);
                    }
                    return;
                }
                if (state.promptField === "thinking") {
                    if (keyName === "left" || keyName === "up") {
                        key.preventDefault?.();
                        key.stopPropagation?.();
                        SIGNALS.promptThinkingCycle(-1);
                        return;
                    }
                    if (keyName === "right" || keyName === "down") {
                        key.preventDefault?.();
                        key.stopPropagation?.();
                        SIGNALS.promptThinkingCycle(1);
                        return;
                    }
                    if (keyName === "return" || keyName === "enter") {
                        key.preventDefault?.();
                        key.stopPropagation?.();
                        SIGNALS.promptFieldCycle(-2);
                        return;
                    }
                }
                if (keyName === "return" || keyName === "enter") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.promptSubmit();
                    return;
                }
                const handled = this.prompt.handlePromptInputKey(this.toAppKeyInput(key));
                if (handled) {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                }
                return;
            }

            const isShortcutsToggleKey = keyName === "?" || rawKeyName === "?" || (keyName === "/" && Boolean(key.shift));
            if (isShortcutsToggleKey) {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.shortcutsToggle();
                return;
            }

            if (state.shortcutsVisible) {
                if (keyName === "escape") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.shortcutsToggle();
                    return;
                }
                if (keyName === "up") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.shortcutsScrollLines(-1);
                    return;
                }
                if (keyName === "down") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.shortcutsScrollLines(1);
                    return;
                }
                if (keyName === "pageup") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.shortcutsScrollPages(-1);
                    return;
                }
                if (keyName === "pagedown") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.shortcutsScrollPages(1);
                    return;
                }
                key.preventDefault?.();
                key.stopPropagation?.();
                return;
            }

            if (keyName === "t") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.themeToggle();
                return;
            }

            if (keyName === "tab") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.focusToggleCodeChips();
                return;
            }

            if (keyName === "r" && key.shift) {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.workspaceChanged();
                return;
            }

            if (keyName === "r") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.filesResetVisibility();
                return;
            }

            if (keyName === "s") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.groupsSaveOrUpdate();
                return;
            }

            if (state.focusMode === "chips") {
                if (keyName === "x") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.groupsDeleteSelected();
                    return;
                }
                if (keyName === "left") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.chipsMove(-1);
                    return;
                }
                if (keyName === "right") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.chipsMove(1);
                    return;
                }
                if (keyName === "space" || keyName === "enter" || keyName === "return") {
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.chipsToggleSelected();
                }
                return;
            }

            const gChordTimeoutMs = 500;
            const now = Date.now();

            if (keyName === "up" || keyName === "k") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.cursorMove(-1, Boolean(key.repeated));
                return;
            }
            if (keyName === "down" || keyName === "j") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.cursorMove(1, Boolean(key.repeated));
                return;
            }
            if (keyName === "pageup") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.cursorPage(-1);
                return;
            }
            if (keyName === "pagedown") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.cursorPage(1);
                return;
            }
            if (keyName === "v") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.visualToggle();
                return;
            }
            if (keyName === "c") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.filesCollapseCurrent();
                return;
            }
            if (keyName === "escape") {
                this.pendingGChordAt = null;
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.visualExit();
                return;
            }
            const isShiftG = keyName === "g" && (Boolean(key.shift) || rawKeyName === "G");
            if (isShiftG) {
                this.pendingGChordAt = null;
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.navJumpBottom();
                return;
            }
            if (keyName === "g" && !key.shift) {
                if (this.pendingGChordAt !== null && now - this.pendingGChordAt <= gChordTimeoutMs) {
                    this.pendingGChordAt = null;
                    key.preventDefault?.();
                    key.stopPropagation?.();
                    SIGNALS.navJumpTop();
                } else {
                    this.pendingGChordAt = now;
                }
                return;
            }
            if (keyName === "n") {
                this.pendingGChordAt = null;
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.navJumpNextFile();
                return;
            }
            if (keyName === "p") {
                this.pendingGChordAt = null;
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.navJumpPrevFile();
                return;
            }
            if (keyName === "a") {
                this.pendingGChordAt = null;
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.navJumpNextAgent();
                return;
            }
            if (keyName === "x") {
                this.pendingGChordAt = null;
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.agentDeleteAtCursor();
                return;
            }
            if (keyName === "e") {
                this.pendingGChordAt = null;
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.filesOpenInEditor();
                return;
            }
            this.pendingGChordAt = null;
            if (keyName === "enter" || keyName === "return") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.filesEnterOrOpen();
                return;
            }
            if (keyName === "backspace") {
                key.preventDefault?.();
                key.stopPropagation?.();
                SIGNALS.filesParentDir();
                return;
            }
        };

        const onPaste = (event: PasteEvent): void => {
            const pastedText = event.text;
            if (!pastedText) return;

            const state = this.getKeyboardStateSnapshot();
            if (state.groupNamePromptVisible) {
                event.preventDefault?.();
                event.stopPropagation?.();
                this.groupNameModal.handlePasteText(pastedText);
                return;
            }

            if (!state.promptVisible) return;

            event.preventDefault?.();
            event.stopPropagation?.();
            this.prompt.handlePromptPasteText(pastedText);
        };

        this.renderer.keyInput.on("keypress", onKeypress);
        (this.renderer.keyInput as unknown as { on: (event: string, handler: (event: PasteEvent) => void) => void }).on("paste", onPaste);

        return () => {
            this.renderer.keyInput.off("keypress", onKeypress);
            (this.renderer.keyInput as unknown as { off: (event: string, handler: (event: PasteEvent) => void) => void }).off("paste", onPaste);
        };
    }

    private registerScrollBindings(): () => void {
        const onChange = (event: { position?: number } | undefined): void => {
            const position = event?.position;
            if (typeof position !== "number") return;
            SIGNALS.scrollVertical(position);
        };

        this.scrollbox.verticalScrollBar.on("change", onChange);

        return () => {
            this.scrollbox.verticalScrollBar.off("change", onChange);
        };
    }

    private registerSystemBindings(): () => void {
        const onResize = (): void => {
            SIGNALS.systemStdoutResize();
        };

        process.stdout.on("resize", onResize);

        const rendererWithFocus = this.renderer as { on?: (event: "focus", handler: () => void) => void; off?: (event: "focus", handler: () => void) => void };
        let focusCleanup: (() => void) | undefined;
        if (typeof rendererWithFocus.on === "function") {
            const onFocus = (): void => {
                SIGNALS.onFocus();
            };
            rendererWithFocus.on("focus", onFocus);
            focusCleanup = () => {
                if (typeof rendererWithFocus.off === "function") {
                    rendererWithFocus.off("focus", onFocus);
                }
            };
        }

        const runtimeProcess = globalThis.process as { on?: (event: string, handler: () => void) => void; off?: (event: string, handler: () => void) => void };
        let sigwinchCleanup: (() => void) | undefined;
        if (typeof runtimeProcess.on === "function") {
            runtimeProcess.on("SIGWINCH", onResize);
            sigwinchCleanup = () => {
                if (typeof runtimeProcess.off === "function") {
                    runtimeProcess.off("SIGWINCH", onResize);
                }
            };
        }

        return () => {
            process.stdout.off("resize", onResize);
            focusCleanup?.();
            sigwinchCleanup?.();
        };
    }

    private toAppKeyInput(key: KeyEvent): AppKeyInput {
        return {
            name: key.name,
            ctrl: key.ctrl,
            meta: key.meta,
            shift: key.shift,
            option: key.option,
            sequence: key.sequence,
            number: key.number,
            raw: key.raw,
            eventType: key.eventType,
            source: key.source,
            code: key.code,
            super: key.super,
            hyper: key.hyper,
            capsLock: key.capsLock,
            numLock: key.numLock,
            baseCode: key.baseCode,
            repeated: key.repeated,
        };
    }

    private getKeyboardStateSnapshot(): {
    groupNamePromptVisible: boolean;
    promptVisible: boolean;
    focusMode: FocusMode;
    promptField: PromptComposerField | null;
    shortcutsVisible: boolean;
    } {
        return {
            groupNamePromptVisible: this.groupNameModal.isVisible,
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

    private applyPersistedUiState(persistedState: PersistedUiState): void {
        this.prompt.applyPersistedModelConfig(persistedState.prompt);
        this.state.selectedChipIndex = toNonNegativeInteger(persistedState.chips.selectedChipIndex);
        this.state.chipWindowStartIndex = toNonNegativeInteger(persistedState.chips.chipWindowStartIndex);
        this.enabledTypes = new Map(Object.entries(persistedState.chips.enabledTypeLabels));

        this.fileExplorer.setCollapsedFiles(persistedState.files.collapsedPaths);
        this.fileExplorer.setFilePageCollapsed(persistedState.files.fileBlockCollapsed);
        this.fileExplorer.setDirectoryPath(persistedState.files.directoryPath);
        this.persistedCursor.applyPersistedState(persistedState.cursor);
        this.pruneCollapsedFiles();
        this.recomputeTypesState();
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
        this.groupNameModal.applyTheme();
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
        const collapsedGroup = this.fileExplorer.getCollapsedGroupAtLine(this.cursor.cursorLine);
        if (collapsedGroup && collapsedGroup.length > 1) {
            this.fileExplorer.toggleCollapsedGroupExpanded(collapsedGroup);
            this.renderContent({ cursorTargetFilePath: collapsedGroup[0] });
            this.cursor.goToLineAtMinVisibleHeight(this.cursor.cursorLine);
            return;
        }

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

    private resetVisibilityState(): void {
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
        if (this.groupNameModal.isVisible) {
            this.groupNameModal.refreshLayout();
        }
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
        return this.entries;
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
            this.groupManagement.getGroups().length,
            this.virtualCodeBlocks.getSupplementalTypes(),
        );
        this.typeCounts = nextState.typeCounts;
        this.hiddenTypeCounts = this.computeHiddenTypeCounts();
        this.sortedTypes = nextState.sortedTypes;
        this.enabledTypes = nextState.enabledTypes;
        this.state.selectedChipIndex = nextState.selectedChipIndex;
    }

    private computeHiddenTypeCounts(): Map<string, number> {
        return new Map();
    }

    private pruneAgentUpdates(): void {
        const existing = new Set(this.entries.map((entry) => entry.relativePath));
        existing.add(".");
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
    }

    private scheduleFileContentLoad(entry: CodeFileEntry): void {
        if (entry.isContentLoaded) return;
        if (this.pendingEntryLoads.has(entry.relativePath)) return;

        this.pendingEntryLoads.add(entry.relativePath);
        void hydrateCodeFileEntry(entry, this.workspaceRootDir)
            .then(() => {
                this.pendingEntryLoads.delete(entry.relativePath);
                this.renderContent();
                this.persistedCursor.restore();
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
