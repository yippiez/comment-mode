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
import {
  listOpencodeModels,
  startHeadlessAgentRun,
  type HeadlessAgentRunResult,
} from "./agent-session";
import { CameraController } from "./camera-controller";
import { createAgentRow, type AgentRowDecoration } from "./components/agent-row";
import { HelpModal } from "./components/help-modal";
import {
  PromptComposerBar,
  type PromptComposerField,
  type PromptComposerLayout,
} from "./components/prompt-composer-bar";
import { CursorController } from "./cursor-controller";
import { LineModel } from "./line-model";
import { SearchModalController } from "./search-modal";
import type { SearchResult } from "./search-index";
import { syntaxStyle } from "./theme";
import type { AgentUpdate, AgentUpdateStatus, CodeFileEntry, FocusMode } from "./types";
import { clamp, clearChildren, makeSlashLine } from "./ui-utils";
import { VisualHighlightController } from "./visual-highlight-controller";

type DiffSegment =
  | { kind: "collapsed"; fileLineStart: number; lineCount: number }
  | { kind: "code"; fileLineStart: number; lineCount: number; content: string };
type PromptComposerTarget = {
  updateId?: string;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  anchorLine: number;
  selectedText: string;
  prompt: string;
  harness: "opencode";
  model: string;
};
type CodeBrowserAppOptions = {
  rootDir: string;
  initialAgentUpdates?: AgentUpdate[];
  onAgentUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

export class CodeBrowserApp {
  private static readonly GG_CHORD_TIMEOUT_MS = 500;
  private static readonly REPEATED_MOVE_THROTTLE_MS = 14;

  private readonly renderer: CliRenderer;
  private readonly rootDir: string;
  private readonly onAgentUpdatesChanged?: (updates: AgentUpdate[]) => void;
  private entries: CodeFileEntry[];

  private readonly root: BoxRenderable;
  private readonly chipsRow: BoxRenderable;
  private readonly scrollbox: ScrollBoxRenderable;
  private readonly helpModal: HelpModal;
  private readonly searchModal: SearchModalController;
  private readonly promptComposer: PromptComposerBar;
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
  private agentUpdates: AgentUpdate[] = [];
  private agentLineByUpdateId = new Map<string, number>();
  private updateIdByAgentLine = new Map<number, string>();
  private agentRowDecorations = new Map<number, AgentRowDecoration>();
  private runningAgentStops = new Map<string, () => void>();
  private agentRenderTimer: ReturnType<typeof setTimeout> | null = null;
  private promptVisible = false;
  private promptField: PromptComposerField = "prompt";
  private promptTarget: PromptComposerTarget | null = null;
  private promptAnchorLine: number | null = null;
  private availableHarnesses: Array<"opencode"> = ["opencode"];
  private availableModels: string[] = ["opencode/big-pickle"];
  private promptModelQuery = "";
  private promptModelListLoading = false;
  private lastRepeatedMoveAt = 0;

  constructor(renderer: CliRenderer, entries: CodeFileEntry[], options: CodeBrowserAppOptions) {
    this.renderer = renderer;
    this.rootDir = options.rootDir;
    this.onAgentUpdatesChanged = options.onAgentUpdatesChanged;
    this.entries = entries;
    this.agentUpdates = (options.initialAgentUpdates ?? []).map((update) => ({
      ...update,
      messages: [...(update.messages ?? [])],
    }));

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

    this.helpModal = new HelpModal(renderer, {
      onDismiss: () => {
        this.hideHelp();
      },
    });
    this.searchModal = new SearchModalController(renderer, {
      onSelectResult: (result) => {
        this.jumpToSearchResult(result);
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
        if (this.promptVisible) {
          this.refreshPromptComposerView();
        }
      },
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
    this.pruneAgentUpdates();
    this.searchModal.setEntries(this.entries);
    this.renderChips();
    this.renderContent();
    this.registerKeyboardHandlers();
    this.setFocusMode("code");
    void this.refreshAvailableModels();
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
    return this.agentUpdates.map((update) => ({ ...update, messages: [...update.messages] }));
  }

  public shutdown(): void {
    for (const stop of this.runningAgentStops.values()) {
      stop();
    }
    this.runningAgentStops.clear();
    if (this.agentRenderTimer) {
      clearTimeout(this.agentRenderTimer);
      this.agentRenderTimer = null;
    }
    this.promptVisible = false;
    this.promptComposer.close();
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

      if (this.helpVisible) {
        if (keyName === "escape" || keyName === "q") {
          this.consumeKey(key);
          this.hideHelp();
          return;
        }

        this.consumeKey(key);
        return;
      }

      if (this.promptVisible) {
        this.handlePromptKeypress(keyName, rawKeyName, key);
        return;
      }

      if (this.searchModal.isVisible) {
        this.searchModal.handleKeypress(keyName, key, (event) => this.consumeKey(event));
        if (!this.searchModal.isVisible) {
          this.setFocusMode("code");
        }
        return;
      }

      if (keyName === "s") {
        this.consumeKey(key);
        this.openSearchModal();
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

  private handleChipsKeypress(keyName: string, key: KeyEvent): void {
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
    key: KeyEvent,
  ): void {
    if (keyName === "escape") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.cursor.disableVisualMode();
      return;
    }

    if (this.handleAgentRowKeypress(keyName, key)) {
      this.pendingGChordAt = null;
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      void this.handleEnterOnCodeView();
      return;
    }

    if (this.handleVimNavigationKeypress(keyName, rawKeyName, key)) return;

    if (keyName === "up" || keyName === "k") {
      if (this.shouldThrottleRepeatedMove(key)) {
        this.consumeKey(key);
        return;
      }
      this.consumeKey(key);
      this.cursor.moveBy(-1);
      return;
    }

    if (keyName === "down" || keyName === "j") {
      if (this.shouldThrottleRepeatedMove(key)) {
        this.consumeKey(key);
        return;
      }
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

  private handleAgentRowKeypress(keyName: string, key: KeyEvent): boolean {
    const update = this.getAgentUpdateAtCursorLine();
    if (!update) return false;

    if (keyName === "delete") {
      this.consumeKey(key);
      this.removeAgentUpdate(update.id);
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
      this.openPromptComposer({
        updateId: update.id,
        filePath: update.filePath,
        selectionStartFileLine: update.selectionStartFileLine,
        selectionEndFileLine: update.selectionEndFileLine,
        anchorLine,
        selectedText: update.selectedText,
        prompt: update.prompt,
        harness: "opencode",
        model: update.model,
      });
      return;
    }

    const target = this.createPromptTargetFromSelection();
    if (!target) return;
    this.openPromptComposer(target);
  }

  private createPromptTargetFromSelection(): PromptComposerTarget | null {
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
      harness: "opencode",
      model: this.getDefaultModel(),
    };
  }

  private handlePromptKeypress(keyName: string, rawKeyName: string | undefined, key: KeyEvent): void {
    if (keyName === "escape") {
      this.consumeKey(key);
      this.closePromptComposer();
      return;
    }

    if (keyName === "tab") {
      this.consumeKey(key);
      this.movePromptField(1);
      return;
    }

    if (this.promptField === "harness") {
      if (keyName === "left" || keyName === "up") {
        this.consumeKey(key);
        this.cycleHarness(-1);
        return;
      }
      if (keyName === "right" || keyName === "down") {
        this.consumeKey(key);
        this.cycleHarness(1);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        this.consumeKey(key);
        this.movePromptField(1);
      }
      return;
    }

    if (this.promptField === "model") {
      if (keyName === "up") {
        this.consumeKey(key);
        this.cycleModel(-1);
        return;
      }
      if (keyName === "down") {
        this.consumeKey(key);
        this.cycleModel(1);
        return;
      }
      if (keyName === "left" || keyName === "right") {
        this.consumeKey(key);
        return;
      }
      if (keyName === "r") {
        this.consumeKey(key);
        void this.refreshAvailableModels();
        return;
      }
      if (this.handleModelQueryInput(keyName, rawKeyName, key)) {
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        this.consumeKey(key);
        this.movePromptField(-2);
      }
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      this.consumeKey(key);
      void this.submitPromptComposer();
      return;
    }

    const handled = this.promptComposer.promptInput.handleKeyPress(key);
    if (handled) {
      this.consumeKey(key);
      this.refreshPromptComposerView();
    }
  }

  private movePromptField(delta: number): void {
    const fields: PromptComposerField[] = ["prompt", "harness", "model"];
    const currentIndex = fields.indexOf(this.promptField);
    const nextIndex =
      ((currentIndex + delta) % fields.length + fields.length) % fields.length;
    this.promptField = fields[nextIndex] ?? "prompt";
    this.refreshPromptComposerView();
  }

  private cycleHarness(delta: number): void {
    if (!this.promptTarget || this.availableHarnesses.length === 0) return;
    const currentIndex = this.availableHarnesses.indexOf(this.promptTarget.harness);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      ((baseIndex + delta) % this.availableHarnesses.length + this.availableHarnesses.length) %
      this.availableHarnesses.length;
    this.promptTarget.harness = this.availableHarnesses[nextIndex] ?? "opencode";
    this.refreshPromptComposerView();
  }

  private cycleModel(delta: number): void {
    if (!this.promptTarget) return;
    const modelPool = this.getPromptModelCandidates();
    if (modelPool.length === 0) return;
    const currentIndex = modelPool.indexOf(this.promptTarget.model);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      ((baseIndex + delta) % modelPool.length + modelPool.length) % modelPool.length;
    this.promptTarget.model = modelPool[nextIndex] ?? this.promptTarget.model;
    this.refreshPromptComposerView();
  }

  private handleModelQueryInput(
    keyName: string,
    rawKeyName: string | undefined,
    key: KeyEvent,
  ): boolean {
    if (!this.promptTarget) return false;

    if (keyName === "backspace") {
      if (this.promptModelQuery.length === 0) return false;
      this.consumeKey(key);
      this.promptModelQuery = this.promptModelQuery.slice(0, -1);
      this.syncPromptModelFromFilter();
      this.refreshPromptComposerView();
      return true;
    }

    if (keyName === "space") {
      this.consumeKey(key);
      this.promptModelQuery += " ";
      this.syncPromptModelFromFilter();
      this.refreshPromptComposerView();
      return true;
    }

    const typed = this.getPromptTypedCharacter(rawKeyName);
    if (!typed) return false;

    this.consumeKey(key);
    this.promptModelQuery += typed;
    this.syncPromptModelFromFilter();
    this.refreshPromptComposerView();
    return true;
  }

  private getPromptTypedCharacter(rawKeyName: string | undefined): string | null {
    if (!rawKeyName || rawKeyName.length !== 1) return null;
    return /[A-Za-z0-9./:_-]/.test(rawKeyName) ? rawKeyName : null;
  }

  private syncPromptModelFromFilter(): void {
    if (!this.promptTarget) return;
    const filtered = this.getPromptModelCandidates();
    if (filtered.length === 0) return;
    if (this.promptModelQuery.trim().length > 0) {
      this.promptTarget.model = filtered[0] ?? this.promptTarget.model;
      return;
    }
    if (filtered.includes(this.promptTarget.model)) return;
    this.promptTarget.model = filtered[0] ?? this.promptTarget.model;
  }

  private getPromptModelCandidates(): string[] {
    if (this.promptModelQuery.trim().length === 0) {
      return this.availableModels;
    }
    const normalizedQuery = this.promptModelQuery.trim().toLowerCase();
    const matches = this.availableModels
      .map((model) => ({
        model,
        score: this.fuzzyScore(model.toLowerCase(), normalizedQuery),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => a.score - b.score || a.model.localeCompare(b.model))
      .map((entry) => entry.model);
    return matches;
  }

  private getDefaultModel(): string {
    const preferred = "opencode/big-pickle";
    if (this.availableModels.includes(preferred)) return preferred;
    return this.availableModels[0] ?? preferred;
  }

  private fuzzyScore(candidate: string, query: string): number {
    if (query.length === 0) return 0;
    let queryIndex = 0;
    let score = 0;
    let lastMatch = -1;
    for (let i = 0; i < candidate.length; i += 1) {
      if (candidate[i] !== query[queryIndex]) continue;
      score += i;
      if (i === 0 || "/._-:".includes(candidate[i - 1] ?? "")) {
        score -= 8;
      }
      if (lastMatch === i - 1) {
        score -= 6;
      }
      lastMatch = i;
      queryIndex += 1;
      if (queryIndex === query.length) {
        score += candidate.length - query.length;
        return score;
      }
    }
    return Number.POSITIVE_INFINITY;
  }

  private openPromptComposer(target: PromptComposerTarget): void {
    this.promptTarget = {
      ...target,
      model: target.model || this.getDefaultModel(),
    };
    this.promptAnchorLine = target.anchorLine;
    this.promptModelQuery = "";
    this.promptField = "prompt";
    this.promptVisible = true;
    this.focusMode = "prompt";
    this.promptComposer.open(this.promptTarget.prompt);
    this.refreshPromptComposerView();
  }

  private closePromptComposer(): void {
    this.promptVisible = false;
    this.promptTarget = null;
    this.promptAnchorLine = null;
    this.promptModelQuery = "";
    this.promptComposer.close();
    this.setFocusMode("code");
  }

  private async submitPromptComposer(): Promise<void> {
    if (!this.promptTarget) return;
    const promptText = this.promptComposer.promptInput.plainText.trim();
    if (!promptText) return;

    this.promptTarget.prompt = promptText;

    let update = this.promptTarget.updateId
      ? this.agentUpdates.find((entry) => entry.id === this.promptTarget?.updateId)
      : undefined;

    if (!update) {
      update = {
        id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        filePath: this.promptTarget.filePath,
        selectionStartFileLine: this.promptTarget.selectionStartFileLine,
        selectionEndFileLine: this.promptTarget.selectionEndFileLine,
        selectedText: this.promptTarget.selectedText,
        prompt: this.promptTarget.prompt,
        harness: this.promptTarget.harness,
        model: this.promptTarget.model,
        status: "draft",
        messages: [],
      };
      this.agentUpdates.push(update);
    } else {
      update.filePath = this.promptTarget.filePath;
      update.selectionStartFileLine = this.promptTarget.selectionStartFileLine;
      update.selectionEndFileLine = this.promptTarget.selectionEndFileLine;
      update.selectedText = this.promptTarget.selectedText;
      update.prompt = this.promptTarget.prompt;
      update.harness = this.promptTarget.harness;
      update.model = this.promptTarget.model;
    }

    this.closePromptComposer();
    this.cursor.disableVisualMode();
    this.notifyAgentUpdatesChanged();
    this.renderContent();
    await this.launchAgentUpdateSession(update);
    const targetLine = this.agentLineByUpdateId.get(update.id);
    if (typeof targetLine === "number") {
      this.cursor.goToLine(targetLine, "keep");
    }
  }

  private async launchAgentUpdateSession(update: AgentUpdate): Promise<void> {
    const existingStop = this.runningAgentStops.get(update.id);
    if (existingStop) {
      existingStop();
      this.runningAgentStops.delete(update.id);
    }

    update.status = "running";
    update.error = undefined;
    update.runId = undefined;
    update.messages = [];
    this.notifyAgentUpdatesChanged();
    this.renderContent();

    let result: HeadlessAgentRunResult;
    try {
      result = await startHeadlessAgentRun({
        rootDir: this.rootDir,
        harness: update.harness,
        model: update.model,
        filePath: update.filePath,
        selectionStartFileLine: update.selectionStartFileLine,
        selectionEndFileLine: update.selectionEndFileLine,
        prompt: update.prompt,
        selectedText: update.selectedText,
        onMessage: (message) => {
          this.pushAgentMessage(update, message);
          this.scheduleAgentRender();
        },
        onExit: ({ success, error }) => {
          this.runningAgentStops.delete(update.id);
          update.status = success ? "completed" : "failed";
          update.error = success ? undefined : error ?? "Headless opencode run failed.";
          if (update.error) {
            this.pushAgentMessage(update, update.error);
          }
          this.notifyAgentUpdatesChanged();
          this.renderContent();
        },
      });
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : "Failed to start run." };
    }

    if (!result.ok) {
      update.status = "failed";
      update.error = result.error;
      this.pushAgentMessage(update, result.error);
      this.notifyAgentUpdatesChanged();
      this.renderContent();
      return;
    }

    update.runId = result.runId;
    this.runningAgentStops.set(update.id, result.stop);
    this.notifyAgentUpdatesChanged();
    this.renderContent();
  }

  private getAgentUpdateAtCursorLine(): AgentUpdate | undefined {
    const updateId = this.updateIdByAgentLine.get(this.cursor.cursorLine);
    if (!updateId) return undefined;
    return this.agentUpdates.find((entry) => entry.id === updateId);
  }

  private pushAgentMessage(update: AgentUpdate, message: string): void {
    const trimmed = message.replace(/\s+/g, " ").trim();
    if (trimmed.length === 0) return;
    const previous = update.messages[update.messages.length - 1];
    if (previous === trimmed) return;
    update.messages.push(trimmed);
    if (update.messages.length > 64) {
      update.messages.splice(0, update.messages.length - 64);
    }
  }

  private scheduleAgentRender(): void {
    if (this.agentRenderTimer) return;
    this.agentRenderTimer = setTimeout(() => {
      this.agentRenderTimer = null;
      this.notifyAgentUpdatesChanged();
      this.renderContent();
    }, 60);
  }

  private async refreshAvailableModels(): Promise<void> {
    if (this.promptModelListLoading) return;
    this.promptModelListLoading = true;
    this.refreshPromptComposerView();
    try {
      const models = await listOpencodeModels(this.rootDir);
      if (models.length > 0) {
        this.availableModels = models;
      }
      if (this.promptTarget && !this.availableModels.includes(this.promptTarget.model)) {
        this.promptTarget.model = this.getDefaultModel();
      }
      this.syncPromptModelFromFilter();
    } finally {
      this.promptModelListLoading = false;
      this.refreshPromptComposerView();
    }
  }

  private refreshPromptComposerView(): void {
    const layout = this.getPromptComposerLayout();
    this.promptComposer.render({
      visible: this.promptVisible && Boolean(this.promptTarget),
      field: this.promptField,
      harness: this.promptTarget?.harness ?? "",
      model: this.promptTarget?.model ?? "",
      modelQuery: this.promptModelQuery,
      loading: this.promptModelListLoading,
      promptText: this.promptComposer.promptInput.plainText,
    }, layout);
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

    if (this.diffMode && result.kind !== "file") {
      this.diffMode = false;
      requiresRerender = true;
    }

    if (!requiresRerender) return;
    this.renderChips();
    this.renderContent();
  }

  private handleVimNavigationKeypress(
    keyName: string,
    rawKeyName: string | undefined,
    key: KeyEvent,
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

    if (keyName === "a") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.jumpToNextAgentPrompt();
      return true;
    }

    if (keyName === "x") {
      this.consumeKey(key);
      this.pendingGChordAt = null;
      this.deleteCurrentAgentPrompt();
      return true;
    }

    this.pendingGChordAt = null;
    return false;
  }

  private consumeKey(key: KeyEvent): void {
    key.preventDefault?.();
    key.stopPropagation?.();
  }

  private getKeyName(name: string | undefined): string {
    return (name ?? "").toLowerCase();
  }

  private shouldThrottleRepeatedMove(key: KeyEvent): boolean {
    if (!key.repeated) return false;
    const now = Date.now();
    if (now - this.lastRepeatedMoveAt < CodeBrowserApp.REPEATED_MOVE_THROTTLE_MS) {
      return true;
    }
    this.lastRepeatedMoveAt = now;
    return false;
  }

  private isHelpToggleKey(keyName: string, rawKeyName: string | undefined, shift?: boolean): boolean {
    return keyName === "?" || rawKeyName === "?" || (keyName === "/" && Boolean(shift));
  }

  private toggleHelp(): void {
    if (this.helpVisible) {
      this.hideHelp();
      return;
    }
    if (this.searchModal.isVisible) {
      this.closeSearchModal();
    }
    if (this.promptVisible) {
      this.closePromptComposer();
    }
    this.showHelp();
  }

  private showHelp(): void {
    this.helpVisible = true;
    this.helpModal.show();
  }

  private hideHelp(): void {
    this.helpVisible = false;
    this.helpModal.hide();
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
      } else if (!this.diffMode) {
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
    if (this.promptVisible) {
      this.refreshPromptComposerView();
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
      baseFg: "#f8fafc",
      selectedBg: "#334155",
      selectedFg: "#f8fafc",
      cursorBg: "#fef08a",
      cursorFg: "#111827",
      paddingLeft: 1,
      paddingRight: 1,
      bold: true,
    });

    this.scrollbox.add(decoration.row);
    this.lineModel.addBlock({
      lineView: null,
      codeView: null,
      defaultLineNumberFg: "#f8fafc",
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
      baseBg: "#1f2937",
      baseFg: "#e5e7eb",
      selectedBg: "#334155",
      selectedFg: "#f8fafc",
      cursorBg: "#fef08a",
      cursorFg: "#111827",
      paddingLeft: 2,
      paddingRight: 1,
    });

    this.scrollbox.add(decoration.row);
    this.lineModel.addBlock({
      lineView: null,
      codeView: null,
      defaultLineNumberFg: "#e5e7eb",
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
    const runSuffix = update.runId ? ` · ${update.runId}` : "";
    const errorSuffix = update.error ? ` | error: ${update.error}` : "";
    return `● ${prefix} · ${update.model} · ${truncatedPrompt}${runSuffix}${errorSuffix}`;
  }

  private getAgentStatusBg(status: AgentUpdateStatus): string {
    switch (status) {
      case "running":
        return "#1e3a8a";
      case "completed":
        return "#14532d";
      case "failed":
        return "#7f1d1d";
      default:
        return "#312e81";
    }
  }

  private getUpdatesForFile(filePath: string): AgentUpdate[] {
    return this.agentUpdates
      .filter((update) => update.filePath === filePath)
      .sort((a, b) => {
        if (a.selectionEndFileLine !== b.selectionEndFileLine) {
          return a.selectionEndFileLine - b.selectionEndFileLine;
        }
        return a.id.localeCompare(b.id);
      });
  }

  private buildDiffSegments(entry: CodeFileEntry): DiffSegment[] {
    if (entry.lineCount <= 0) return [];
    if (entry.uncommittedLines.size === 0) {
      return [{ kind: "collapsed", fileLineStart: 1, lineCount: entry.lineCount }];
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
        segments.push({ kind: "collapsed", fileLineStart: rangeStart, lineCount: rangeCount });
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

  private getPromptComposerLayout(): PromptComposerLayout {
    const viewportTop = Math.max(0, this.scrollbox.y);
    const viewportHeight = this.getViewportHeight();
    const viewportBottom = viewportTop + viewportHeight - 1;
    const anchorLine = this.getPromptAnchorLine();
    const anchorDisplayRow = this.lineModel.getDisplayRowForLine(anchorLine);
    const rowInViewport = anchorDisplayRow - this.scrollbox.scrollTop;
    const desiredTop = viewportTop + rowInViewport + 1;
    const top = clamp(desiredTop, viewportTop, viewportBottom);
    return {
      top,
      maxHeight: Math.max(1, viewportBottom - top + 1),
    };
  }

  private getPromptAnchorLine(): number {
    if (this.promptTarget) {
      const visibleLine = this.lineModel.findGlobalLineForFileLine(
        this.promptTarget.filePath,
        this.promptTarget.selectionEndFileLine,
      );
      if (typeof visibleLine === "number") {
        return visibleLine;
      }
    }

    if (this.lineModel.totalLines <= 0) return 1;
    const fallback = this.promptAnchorLine ?? this.cursor.cursorLine;
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

  private jumpToNextAgentPrompt(): void {
    if (this.lineModel.totalLines <= 0) return;
    const lines = [...this.agentLineByUpdateId.values()].sort((a, b) => a - b);
    if (lines.length === 0) return;
    const currentLine = this.cursor.cursorLine;
    const next = lines.find((line) => line > currentLine) ?? lines[0];
    if (typeof next !== "number") return;
    this.cursor.goToLine(next, "auto");
  }

  private deleteCurrentAgentPrompt(): void {
    const update = this.getAgentUpdateAtCursorLine();
    if (!update) return;
    this.removeAgentUpdate(update.id);
  }

  private removeAgentUpdate(updateId: string): void {
    const stop = this.runningAgentStops.get(updateId);
    if (stop) {
      stop();
      this.runningAgentStops.delete(updateId);
    }

    const previousLength = this.agentUpdates.length;
    this.agentUpdates = this.agentUpdates.filter((entry) => entry.id !== updateId);
    if (this.agentUpdates.length === previousLength) return;
    this.notifyAgentUpdatesChanged();
    this.renderContent();
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

  private notifyAgentUpdatesChanged(): void {
    this.onAgentUpdatesChanged?.(this.getAgentUpdates());
  }

  private pruneAgentUpdates(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    const removedIds = new Set<string>();
    for (const update of this.agentUpdates) {
      if (existing.has(update.filePath)) continue;
      removedIds.add(update.id);
    }
    for (const updateId of removedIds) {
      const stop = this.runningAgentStops.get(updateId);
      if (!stop) continue;
      stop();
      this.runningAgentStops.delete(updateId);
    }
    const previousLength = this.agentUpdates.length;
    this.agentUpdates = this.agentUpdates.filter((update) => existing.has(update.filePath));
    if (this.agentUpdates.length !== previousLength) {
      this.notifyAgentUpdatesChanged();
    }
  }

  private pruneCollapsedFiles(): void {
    const existing = new Set(this.entries.map((entry) => entry.relativePath));
    for (const filePath of this.collapsedFiles) {
      if (existing.has(filePath)) continue;
      this.collapsedFiles.delete(filePath);
    }
  }
}
