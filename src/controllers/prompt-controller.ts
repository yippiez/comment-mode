import { KeyEvent } from "@opentui/core";
import { listOpencodeModelCatalog } from "../agent-session";
import type { ViewMode } from "../types";
import {
  PromptComposerBar,
  type PromptComposerField,
  type PromptComposerLayout,
} from "../components/prompt-composer-bar";

export type PromptControllerTarget = {
  updateId?: string;
  viewMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  anchorLine: number;
  selectedText: string;
  prompt: string;
  model: string;
  thinkingLevel?: string;
};

export type PromptSubmission = {
  updateId?: string;
  viewMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  selectedText: string;
  prompt: string;
  model: string;
  thinkingLevel?: string;
};

type PromptControllerOptions = {
  rootDir: string;
  promptComposer: PromptComposerBar;
  onSubmission: (submission: PromptSubmission) => Promise<void>;
  onFocusModeChange: (focusMode: "code" | "prompt") => void;
  resolveLayout: (
    target: PromptControllerTarget | null,
    fallbackAnchorLine: number | null,
  ) => PromptComposerLayout;
};

export class PromptController {
  private static readonly DEFAULT_THINKING_LEVEL = "auto";

  private readonly rootDir: string;
  private readonly promptComposer: PromptComposerBar;
  private readonly onSubmission: (submission: PromptSubmission) => Promise<void>;
  private readonly onFocusModeChange: (focusMode: "code" | "prompt") => void;
  private readonly resolveLayout: (
    target: PromptControllerTarget | null,
    fallbackAnchorLine: number | null,
  ) => PromptComposerLayout;

  private visible = false;
  private field: PromptComposerField = "prompt";
  private target: PromptControllerTarget | null = null;
  private anchorLine: number | null = null;
  private availableModels: string[] = ["opencode/big-pickle"];
  private modelVariantsById = new Map<string, string[]>();
  private modelQuery = "";
  private modelListLoading = false;

  /** Initializes prompt controller dependencies and callbacks. */
  constructor(options: PromptControllerOptions) {
    this.rootDir = options.rootDir;
    this.promptComposer = options.promptComposer;
    this.onSubmission = options.onSubmission;
    this.onFocusModeChange = options.onFocusModeChange;
    this.resolveLayout = options.resolveLayout;
  }

  /** Returns whether prompt composer is currently visible. */
  public get isVisible(): boolean {
    return this.visible;
  }

  /** Returns the active prompt target if one exists. */
  public get currentTarget(): PromptControllerTarget | null {
    return this.target;
  }

  /** Boots model metadata loading in the background. */
  public start(): void {
    void this.refreshAvailableModels();
  }

  /** Opens the inline prompt composer for a code selection target. */
  public open(target: PromptControllerTarget): void {
    this.target = {
      ...target,
      model: target.model || this.getDefaultModel(),
      thinkingLevel: target.thinkingLevel ?? PromptController.DEFAULT_THINKING_LEVEL,
    };
    this.anchorLine = target.anchorLine;
    this.modelQuery = "";
    this.field = "prompt";
    this.visible = true;
    this.syncThinkingLevelFromModel();
    this.onFocusModeChange("prompt");
    this.promptComposer.open(this.target.prompt);
    this.render();
  }

  /** Closes the prompt composer and restores code focus mode. */
  public close(): void {
    this.visible = false;
    this.target = null;
    this.anchorLine = null;
    this.modelQuery = "";
    this.promptComposer.close();
    this.onFocusModeChange("code");
  }

  /** Re-renders prompt UI using latest layout constraints. */
  public refreshView(): void {
    if (!this.visible) return;
    this.render();
  }

  /** Handles keyboard input while prompt composer is focused. */
  public handleKeypress(
    keyName: string,
    rawKeyName: string | undefined,
    key: KeyEvent,
    consumeKey: (event: KeyEvent) => void,
  ): void {
    if (keyName === "escape") {
      consumeKey(key);
      this.close();
      return;
    }

    if (keyName === "tab") {
      consumeKey(key);
      this.moveField(1);
      return;
    }

    if (this.field === "model") {
      if (keyName === "up") {
        consumeKey(key);
        this.cycleModel(-1);
        return;
      }
      if (keyName === "down") {
        consumeKey(key);
        this.cycleModel(1);
        return;
      }
      if (keyName === "left" || keyName === "right") {
        consumeKey(key);
        return;
      }
      if (keyName === "r") {
        consumeKey(key);
        void this.refreshAvailableModels();
        return;
      }
      if (this.handleModelQueryInput(keyName, rawKeyName, key, consumeKey)) {
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        consumeKey(key);
        this.moveField(1);
      }
      return;
    }

    if (this.field === "thinking") {
      if (keyName === "left" || keyName === "up") {
        consumeKey(key);
        this.cycleThinkingLevel(-1);
        return;
      }
      if (keyName === "right" || keyName === "down") {
        consumeKey(key);
        this.cycleThinkingLevel(1);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        consumeKey(key);
        this.moveField(-2);
        return;
      }
    }

    if (keyName === "return" || keyName === "enter") {
      consumeKey(key);
      void this.submit();
      return;
    }

    const handled = this.promptComposer.promptInput.handleKeyPress(key);
    if (!handled) return;
    consumeKey(key);
    this.render();
  }

  /** Commits prompt state and hands submission back to app orchestration. */
  private async submit(): Promise<void> {
    if (!this.target) return;
    const promptText = this.promptComposer.promptInput.plainText.trim();
    if (!promptText) return;

    this.target.prompt = promptText;
    const submission: PromptSubmission = {
      updateId: this.target.updateId,
      viewMode: this.target.viewMode,
      filePath: this.target.filePath,
      selectionStartFileLine: this.target.selectionStartFileLine,
      selectionEndFileLine: this.target.selectionEndFileLine,
      selectedText: this.target.selectedText,
      prompt: this.target.prompt,
      model: this.target.model,
      thinkingLevel:
        this.target.thinkingLevel && this.target.thinkingLevel !== PromptController.DEFAULT_THINKING_LEVEL
          ? this.target.thinkingLevel
          : undefined,
    };

    this.close();
    await this.onSubmission(submission);
  }

  /** Moves active prompt field focus by delta with wrapping. */
  private moveField(delta: number): void {
    const fields: PromptComposerField[] = ["prompt", "model", "thinking"];
    const currentIndex = fields.indexOf(this.field);
    const nextIndex = ((currentIndex + delta) % fields.length + fields.length) % fields.length;
    this.field = fields[nextIndex] ?? "prompt";
    this.render();
  }

  /** Cycles selected model in current filtered model pool. */
  private cycleModel(delta: number): void {
    if (!this.target) return;
    const modelPool = this.getPromptModelCandidates();
    if (modelPool.length === 0) return;
    const currentIndex = modelPool.indexOf(this.target.model);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = ((baseIndex + delta) % modelPool.length + modelPool.length) % modelPool.length;
    this.target.model = modelPool[nextIndex] ?? this.target.model;
    this.syncThinkingLevelFromModel();
    this.render();
  }

  /** Cycles thinking level using variants supported by selected model. */
  private cycleThinkingLevel(delta: number): void {
    if (!this.target) return;
    const levels = this.getThinkingLevelsForModel(this.target.model);
    const currentLevel = this.target.thinkingLevel ?? PromptController.DEFAULT_THINKING_LEVEL;
    const currentIndex = levels.indexOf(currentLevel);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = ((baseIndex + delta) % levels.length + levels.length) % levels.length;
    this.target.thinkingLevel = levels[nextIndex] ?? PromptController.DEFAULT_THINKING_LEVEL;
    this.render();
  }

  /** Handles fuzzy query typing for model selection. */
  private handleModelQueryInput(
    keyName: string,
    rawKeyName: string | undefined,
    key: KeyEvent,
    consumeKey: (event: KeyEvent) => void,
  ): boolean {
    if (!this.target) return false;

    if (keyName === "backspace") {
      if (this.modelQuery.length === 0) return false;
      consumeKey(key);
      this.modelQuery = this.modelQuery.slice(0, -1);
      this.syncModelAndThinkingFromFilter();
      this.render();
      return true;
    }

    if (keyName === "space") {
      consumeKey(key);
      this.modelQuery += " ";
      this.syncModelAndThinkingFromFilter();
      this.render();
      return true;
    }

    const typed = this.getTypedCharacter(rawKeyName);
    if (!typed) return false;

    consumeKey(key);
    this.modelQuery += typed;
    this.syncModelAndThinkingFromFilter();
    this.render();
    return true;
  }

  /** Normalizes typed key to accepted model-query character. */
  private getTypedCharacter(rawKeyName: string | undefined): string | null {
    if (!rawKeyName || rawKeyName.length !== 1) return null;
    return /[A-Za-z0-9./:_-]/.test(rawKeyName) ? rawKeyName : null;
  }

  /** Ensures current model and thinking level follow active model query filter. */
  private syncModelAndThinkingFromFilter(): void {
    if (!this.target) return;
    const filtered = this.getPromptModelCandidates();
    if (filtered.length === 0) return;
    if (this.modelQuery.trim().length > 0) {
      this.target.model = filtered[0] ?? this.target.model;
      this.syncThinkingLevelFromModel();
      return;
    }
    if (!filtered.includes(this.target.model)) {
      this.target.model = filtered[0] ?? this.target.model;
    }
    this.syncThinkingLevelFromModel();
  }

  /** Returns sorted fuzzy-matched model ids for current query. */
  private getPromptModelCandidates(): string[] {
    if (this.modelQuery.trim().length === 0) {
      return this.availableModels;
    }

    const normalizedQuery = this.modelQuery.trim().toLowerCase();
    return this.availableModels
      .map((model) => ({
        model,
        score: this.fuzzyScore(model.toLowerCase(), normalizedQuery),
      }))
      .filter((entry) => Number.isFinite(entry.score))
      .sort((a, b) => a.score - b.score || a.model.localeCompare(b.model))
      .map((entry) => entry.model);
  }

  /** Picks default model with preference for opencode/big-pickle. */
  private getDefaultModel(): string {
    const preferred = "opencode/big-pickle";
    if (this.availableModels.includes(preferred)) return preferred;
    return this.availableModels[0] ?? preferred;
  }

  /** Computes simple subsequence fuzzy score where lower is better. */
  private fuzzyScore(candidate: string, query: string): number {
    if (query.length === 0) return 0;
    let queryIndex = 0;
    let score = 0;
    let lastMatch = -1;

    for (let index = 0; index < candidate.length; index += 1) {
      if (candidate[index] !== query[queryIndex]) continue;
      score += index;
      if (index === 0 || "/._-:".includes(candidate[index - 1] ?? "")) {
        score -= 8;
      }
      if (lastMatch === index - 1) {
        score -= 6;
      }
      lastMatch = index;
      queryIndex += 1;
      if (queryIndex === query.length) {
        score += candidate.length - query.length;
        return score;
      }
    }

    return Number.POSITIVE_INFINITY;
  }

  /** Refreshes model list and variant map from opencode metadata. */
  private async refreshAvailableModels(): Promise<void> {
    if (this.modelListLoading) return;
    this.modelListLoading = true;
    this.render();

    try {
      const catalog = await listOpencodeModelCatalog(this.rootDir);
      if (catalog.length > 0) {
        this.availableModels = catalog.map((item) => item.model).sort((a, b) => a.localeCompare(b));
        this.modelVariantsById = new Map(
          catalog.map((item) => [item.model, item.variants.slice().sort((a, b) => a.localeCompare(b))]),
        );
      }
      if (this.target && !this.availableModels.includes(this.target.model)) {
        this.target.model = this.getDefaultModel();
      }
      this.syncModelAndThinkingFromFilter();
    } finally {
      this.modelListLoading = false;
      this.render();
    }
  }

  /** Returns supported thinking levels for the current model. */
  private getThinkingLevelsForModel(model: string): string[] {
    const configuredVariants = this.modelVariantsById.get(model);
    if (configuredVariants) {
      return configuredVariants.slice();
    }
    return [];
  }

  /** Keeps active thinking level valid for selected model variants. */
  private syncThinkingLevelFromModel(): void {
    if (!this.target) return;
    const levels = this.getThinkingLevelsForModel(this.target.model);
    const current = this.target.thinkingLevel ?? PromptController.DEFAULT_THINKING_LEVEL;
    this.target.thinkingLevel = levels.includes(current)
      ? current
      : levels[0] ?? PromptController.DEFAULT_THINKING_LEVEL;
  }

  /** Renders prompt composer with current prompt, model, and thinking state. */
  private render(): void {
    const layout = this.resolveLayout(this.target, this.anchorLine);
    this.promptComposer.render(
      {
        visible: this.visible && Boolean(this.target),
        field: this.field,
        model: this.target?.model ?? "",
        thinkingLevel: this.target?.thinkingLevel ?? PromptController.DEFAULT_THINKING_LEVEL,
        modelQuery: this.modelQuery,
        loading: this.modelListLoading,
        promptText: this.promptComposer.promptInput.plainText,
      },
      layout,
    );
  }
}
