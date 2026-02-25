import { KeyEvent } from "@opentui/core";
import { OpenCode } from "../integrations/opencode";
import { emit, SIGNALS } from "../signals";
import type { ViewMode } from "../types";
import { wrapIndex } from "../utils/math";
import {
  PromptComposerBar,
  type PromptComposerField,
  type PromptComposerLayout,
} from "../app/prompt-composer-bar";

export type PromptTarget = {
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

type PromptOptions = {
  promptComposer: PromptComposerBar;
  resolveLayout: (
    target: PromptTarget | null,
    fallbackAnchorLine: number | null,
  ) => PromptComposerLayout;
};

export class Prompt {
  private static readonly DEFAULT_THINKING_LEVEL = "auto";

  private readonly promptComposer: PromptComposerBar;
  private readonly resolveLayout: (
    target: PromptTarget | null,
    fallbackAnchorLine: number | null,
  ) => PromptComposerLayout;

  private visible = false;
  private field: PromptComposerField = "prompt";
  private target: PromptTarget | null = null;
  private anchorLine: number | null = null;
  private availableModels: string[] = ["opencode/big-pickle"];
  private modelVariantsById = new Map<string, string[]>();
  private modelListLoading = false;

  /** Initializes prompt controller dependencies and callbacks. */
  constructor(options: PromptOptions) {
    this.promptComposer = options.promptComposer;
    this.resolveLayout = options.resolveLayout;
  }

  /** Returns whether prompt composer is currently visible. */
  public get isVisible(): boolean {
    return this.visible;
  }

  /** Returns the active prompt target if one exists. */
  public get currentTarget(): PromptTarget | null {
    return this.target;
  }

  public get currentField(): PromptComposerField {
    return this.field;
  }

  /** Boots model metadata loading in the background. */
  public start(): void {
    void this.refreshAvailableModels();
  }

  /** Opens the inline prompt composer for a code selection target. */
  public open(target: PromptTarget): void {
    this.target = {
      ...target,
      model: target.model || this.getDefaultModel(),
      thinkingLevel: target.thinkingLevel ?? Prompt.DEFAULT_THINKING_LEVEL,
    };
    this.anchorLine = target.anchorLine;
    this.field = "prompt";
    this.visible = true;
    this.syncThinkingLevelFromModel();
    emit(SIGNALS.promptFocusModeChange, "prompt");
    if (!this.isComposerDestroyed()) {
      this.promptComposer.open(this.target.prompt);
    }
    this.render();
  }

  /** Closes the prompt composer and restores code focus mode. */
  public close(): void {
    this.visible = false;
    this.target = null;
    this.anchorLine = null;
    if (!this.isComposerDestroyed()) {
      this.promptComposer.close();
    }
    emit(SIGNALS.promptFocusModeChange, "code");
  }

  public cycleField(delta: number): void {
    this.moveField(delta);
  }

  public cycleModel(delta: number): void {
    this.cycleModelInternal(delta);
  }

  public cycleThinkingLevel(delta: number): void {
    this.cycleThinkingLevelInternal(delta);
  }

  public refreshModels(): void {
    void this.refreshAvailableModels();
  }

  public submitFromKeyboard(): void {
    this.submit();
  }

  public handlePromptInputKey(key: KeyEvent, consumeKey: (event: KeyEvent) => void): void {
    if (this.isComposerDestroyed()) return;
    const handled = this.promptComposer.promptInput.handleKeyPress(key);
    if (!handled) return;
    consumeKey(key);
    this.render();
  }

  /** Re-renders prompt UI using latest layout constraints. */
  public refreshView(): void {
    if (!this.visible) return;
    this.render();
  }

  /** Commits prompt state and hands submission back to app orchestration. */
  private submit(): void {
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
        this.target.thinkingLevel && this.target.thinkingLevel !== Prompt.DEFAULT_THINKING_LEVEL
          ? this.target.thinkingLevel
          : undefined,
    };

    this.close();
    emit(SIGNALS.promptSubmission, submission);
  }

  /** Moves active prompt field focus by delta with wrapping. */
  private moveField(delta: number): void {
    const fields: PromptComposerField[] = ["prompt", "model", "thinking"];
    const currentIndex = fields.indexOf(this.field);
    const nextIndex = wrapIndex(currentIndex + delta, fields.length);
    this.field = fields[nextIndex] ?? "prompt";
    this.render();
  }

  /** Cycles selected model in full model list. */
  private cycleModelInternal(delta: number): void {
    if (!this.target) return;
    const modelPool = this.getModelOptions();
    if (modelPool.length === 0) return;
    const currentIndex = modelPool.indexOf(this.target.model);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = wrapIndex(baseIndex + delta, modelPool.length);
    this.target.model = modelPool[nextIndex] ?? this.target.model;
    this.syncThinkingLevelFromModel();
    this.render();
  }

  /** Cycles thinking level using variants supported by selected model. */
  private cycleThinkingLevelInternal(delta: number): void {
    if (!this.target) return;
    const levels = this.getThinkingLevelsForModel(this.target.model);
    const currentLevel = this.target.thinkingLevel ?? Prompt.DEFAULT_THINKING_LEVEL;
    const currentIndex = levels.indexOf(currentLevel);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = wrapIndex(baseIndex + delta, levels.length);
    this.target.thinkingLevel = levels[nextIndex] ?? Prompt.DEFAULT_THINKING_LEVEL;
    this.render();
  }

  private getModelOptions(): string[] {
    return this.availableModels;
  }

  /** Picks default model with preference for opencode/big-pickle. */
  private getDefaultModel(): string {
    const preferred = "opencode/big-pickle";
    if (this.availableModels.includes(preferred)) return preferred;
    return this.availableModels[0] ?? preferred;
  }

  /** Refreshes model list and variant map from opencode metadata. */
  private async refreshAvailableModels(): Promise<void> {
    if (this.modelListLoading) return;
    this.modelListLoading = true;
    this.render();

    try {
      const catalog = await OpenCode.listModels();
      if (catalog.length > 0) {
        this.availableModels = catalog.map((item) => item.model).sort((a, b) => a.localeCompare(b));
        this.modelVariantsById = new Map(
          catalog.map((item) => [item.model, item.variants.slice().sort((a, b) => a.localeCompare(b))]),
        );
      }
      if (this.target && !this.availableModels.includes(this.target.model)) {
        this.target.model = this.getDefaultModel();
      }
      this.syncThinkingLevelFromModel();
    } finally {
      this.modelListLoading = false;
      this.render();
    }
  }

  /** Returns supported thinking levels for the current model. */
  private getThinkingLevelsForModel(model: string): string[] {
    const configuredVariants = this.modelVariantsById.get(model);
    const unique = new Set<string>([Prompt.DEFAULT_THINKING_LEVEL]);
    if (configuredVariants) {
      for (const variant of configuredVariants) {
        if (variant.trim().length === 0) continue;
        unique.add(variant);
      }
    }
    return [...unique];
  }

  /** Keeps active thinking level valid for selected model variants. */
  private syncThinkingLevelFromModel(): void {
    if (!this.target) return;
    const levels = this.getThinkingLevelsForModel(this.target.model);
    const current = this.target.thinkingLevel ?? Prompt.DEFAULT_THINKING_LEVEL;
    this.target.thinkingLevel = levels.includes(current)
      ? current
      : levels[0] ?? Prompt.DEFAULT_THINKING_LEVEL;
  }

  private isComposerDestroyed(): boolean {
    return this.promptComposer.renderable.isDestroyed || this.promptComposer.promptInput.isDestroyed;
  }

  private isDestroyedError(error: unknown): boolean {
    return error instanceof Error && error.message.toLowerCase().includes("destroyed");
  }

  /** Renders prompt composer with current prompt, model, and thinking state. */
  private render(): void {
    if (this.isComposerDestroyed()) return;

    const layout = this.resolveLayout(this.target, this.anchorLine);
    const visible = this.visible && Boolean(this.target);
    let promptText = "";
    if (visible) {
      try {
        promptText = this.promptComposer.promptInput.plainText;
      } catch (error) {
        if (this.isDestroyedError(error)) return;
        throw error;
      }
    }

    try {
      this.promptComposer.render(
        {
          visible,
          field: this.field,
          model: this.target?.model ?? "",
          thinkingLevel: this.target?.thinkingLevel ?? Prompt.DEFAULT_THINKING_LEVEL,
          modelOptions: this.getModelOptions(),
          thinkingOptions: this.getThinkingLevelsForModel(this.target?.model ?? ""),
          loading: this.modelListLoading,
          promptText,
        },
        layout,
      );
    } catch (error) {
      if (this.isDestroyedError(error)) return;
      throw error;
    }
  }
}
