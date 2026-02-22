import {
  BoxRenderable,
  TextareaRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { theme } from "../theme";

type RuntimeTextareaStyleApi = {
  backgroundColor?: string;
  focusedBackgroundColor?: string;
  textColor?: string;
  focusedTextColor?: string;
  selectionBg?: string;
  selectionFg?: string;
};

export type PromptComposerField = "prompt" | "model" | "thinking";

export type PromptComposerViewState = {
  visible: boolean;
  field: PromptComposerField;
  model: string;
  thinkingLevel: string;
  modelQuery: string;
  loading: boolean;
  promptText: string;
};

export type PromptComposerLayout = {
  top: number;
  maxHeight: number;
};

export class PromptComposerBar {
  private static readonly PROMPT_PREFIX = "> ";

  private readonly renderer: CliRenderer;
  private readonly overlay: BoxRenderable;
  private readonly row: BoxRenderable;
  private readonly promptShell: BoxRenderable;
  private readonly chipsRow: BoxRenderable;
  private readonly modelText: TextRenderable;
  private readonly thinkingText: TextRenderable;
  private readonly input: TextareaRenderable;
  private readonly promptPrefix: TextRenderable;

  constructor(renderer: CliRenderer) {
    this.renderer = renderer;
    this.overlay = new BoxRenderable(renderer, {
      id: "prompt-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: theme.getPromptOverlayBackgroundColor(),
      paddingLeft: 1,
      paddingRight: 1,
      gap: 1,
      zIndex: 900,
      visible: false,
    });

    this.row = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 1,
      backgroundColor: theme.getPromptOverlayBackgroundColor(),
    });

    this.promptShell = new BoxRenderable(renderer, {
      flexGrow: 1,
      height: 1,
      backgroundColor: theme.getPromptInputBackgroundColor(),
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      alignItems: "flex-start",
    });

    this.promptPrefix = new TextRenderable(renderer, {
      content: PromptComposerBar.PROMPT_PREFIX,
      fg: theme.getPromptPrefixColor(),
      attributes: TextAttributes.BOLD,
    });
    this.promptShell.add(this.promptPrefix);

    this.input = new TextareaRenderable(renderer, {
      flexGrow: 1,
      placeholder: "write prompt and press Enter",
      height: 1,
      minHeight: 1,
      maxHeight: 8,
      wrapMode: "word",
      backgroundColor: theme.getPromptInputBackgroundColor(),
      focusedBackgroundColor: theme.getPromptInputFocusedBackgroundColor(),
      textColor: theme.getPromptTextColor(),
      focusedTextColor: theme.getPromptFocusedTextColor(),
      selectionBg: theme.getPromptSelectionBackgroundColor(),
      selectionFg: theme.getPromptSelectionForegroundColor(),
    });
    this.input.focusable = false;
    this.promptShell.add(this.input);
    this.row.add(this.promptShell);

    this.chipsRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 1,
      height: 1,
      backgroundColor: theme.getPromptOverlayBackgroundColor(),
    });

    this.modelText = new TextRenderable(renderer, {
      content: "",
      fg: theme.getPromptChipForegroundColor(),
      bg: theme.getPromptChipBackgroundColor(),
      overflow: "hidden",
      truncate: true,
      wrapMode: "none",
      paddingLeft: 1,
      paddingRight: 1,
    });
    this.chipsRow.add(this.modelText);

    this.thinkingText = new TextRenderable(renderer, {
      content: "",
      fg: theme.getPromptChipForegroundColor(),
      bg: theme.getPromptChipBackgroundColor(),
      overflow: "hidden",
      truncate: true,
      wrapMode: "none",
      paddingLeft: 1,
      paddingRight: 1,
    });
    this.chipsRow.add(this.thinkingText);

    this.row.add(this.chipsRow);
    this.overlay.add(this.row);
    this.applyTheme();
  }

  public get renderable(): BoxRenderable {
    return this.overlay;
  }

  /** Returns prompt textarea used by controller keyboard handling. */
  public get promptInput(): TextareaRenderable {
    return this.input;
  }

  /** Shows the prompt overlay and focuses prompt input. */
  public open(promptText: string): void {
    this.overlay.visible = true;
    this.input.setText(promptText);
    this.input.focus();
    this.overlay.requestRender();
  }

  /** Hides prompt overlay and clears prompt input text. */
  public close(): void {
    this.overlay.visible = false;
    this.input.blur();
    this.input.setText("");
    this.overlay.requestRender();
  }

  /** Renders inline prompt row with model/thinking chips and dynamic height. */
  public render(state: PromptComposerViewState, layout: PromptComposerLayout): void {
    this.overlay.visible = state.visible;

    if (!state.visible) {
      this.modelText.content = "";
      this.thinkingText.content = "";
      this.overlay.requestRender();
      return;
    }

    const modelLabel = this.getModelLabel(state);
    const thinkingLabel = this.getThinkingLabel(state);
    const promptLineCount = this.computePromptLineCount(
      state.promptText,
      modelLabel,
      thinkingLabel,
      layout,
    );
    const maxHeight = Math.max(1, layout.maxHeight);
    const boundedHeight = Math.min(promptLineCount, maxHeight);

    this.overlay.top = Math.max(0, layout.top);
    this.overlay.height = boundedHeight;
    this.row.height = boundedHeight;
    this.promptShell.height = boundedHeight;
    this.input.height = boundedHeight;
    this.input.minHeight = boundedHeight;
    this.input.maxHeight = boundedHeight;

    const modelActive = state.field === "model";
    this.modelText.content = ` ${modelLabel} `;
    this.modelText.fg = modelActive
      ? theme.getPromptChipActiveForegroundColor()
      : theme.getPromptChipForegroundColor();
    this.modelText.bg = modelActive
      ? theme.getPromptChipActiveBackgroundColor()
      : theme.getPromptChipBackgroundColor();
    this.modelText.attributes = modelActive
      ? TextAttributes.BOLD | TextAttributes.UNDERLINE
      : TextAttributes.NONE;

    const thinkingActive = state.field === "thinking";
    this.thinkingText.content = ` ${thinkingLabel} `;
    this.thinkingText.fg = thinkingActive
      ? theme.getPromptChipActiveForegroundColor()
      : theme.getPromptChipForegroundColor();
    this.thinkingText.bg = thinkingActive
      ? theme.getPromptChipActiveBackgroundColor()
      : theme.getPromptChipBackgroundColor();
    this.thinkingText.attributes = thinkingActive
      ? TextAttributes.BOLD | TextAttributes.UNDERLINE
      : TextAttributes.NONE;

    this.overlay.requestRender();
  }

  /** Re-applies prompt bar colors from active theme. */
  public applyTheme(): void {
    this.overlay.backgroundColor = theme.getPromptOverlayBackgroundColor();
    this.row.backgroundColor = theme.getPromptOverlayBackgroundColor();
    this.chipsRow.backgroundColor = theme.getPromptOverlayBackgroundColor();
    this.promptShell.backgroundColor = theme.getPromptInputBackgroundColor();
    this.promptPrefix.fg = theme.getPromptPrefixColor();
    this.applyTextareaTheme();
    this.overlay.requestRender();
  }

  /** Formats the model chip label with optional fuzzy query suffix. */
  private getModelLabel(state: PromptComposerViewState): string {
    const modelSearch = state.modelQuery.trim().length > 0 ? ` [${state.modelQuery.trim()}]` : "";
    const loadingSuffix = state.loading ? " (loading)" : "";
    return `${state.model}${modelSearch}${loadingSuffix}`;
  }

  /** Formats the thinking-level chip label shown next to model. */
  private getThinkingLabel(state: PromptComposerViewState): string {
    return `think:${state.thinkingLevel}`;
  }

  /** Estimates prompt line usage using current width and chip labels. */
  private computePromptLineCount(
    promptText: string,
    modelLabel: string,
    thinkingLabel: string,
    layout: PromptComposerLayout,
  ): number {
    const maxHeight = Math.max(1, layout.maxHeight);
    const totalWidth = Math.max(24, this.renderer.width);
    const chipsWidth = modelLabel.length + thinkingLabel.length + 8;
    const prefixWidth = PromptComposerBar.PROMPT_PREFIX.length;
    const availablePromptWidth = Math.max(8, totalWidth - chipsWidth - prefixWidth - 8);
    const wrapped = this.estimateWrappedLines(promptText, availablePromptWidth);
    return Math.min(maxHeight, Math.max(1, wrapped));
  }

  /** Approximates soft-wrapped line count for prompt text. */
  private estimateWrappedLines(text: string, width: number): number {
    if (width <= 1) return 1;
    const normalized = text.replace(/\t/g, "  ");
    const lines = normalized.length === 0 ? [""] : normalized.split("\n");
    let total = 0;
    for (const line of lines) {
      const segmentLength = Math.max(1, line.length);
      total += Math.max(1, Math.ceil(segmentLength / width));
    }
    return Math.max(1, total);
  }

  /** Applies theme colors to prompt textarea runtime style fields. */
  private applyTextareaTheme(): void {
    const runtimeTextarea = this.input as unknown as RuntimeTextareaStyleApi;
    runtimeTextarea.backgroundColor = theme.getPromptInputBackgroundColor();
    runtimeTextarea.focusedBackgroundColor = theme.getPromptInputFocusedBackgroundColor();
    runtimeTextarea.textColor = theme.getPromptTextColor();
    runtimeTextarea.focusedTextColor = theme.getPromptFocusedTextColor();
    runtimeTextarea.selectionBg = theme.getPromptSelectionBackgroundColor();
    runtimeTextarea.selectionFg = theme.getPromptSelectionForegroundColor();
  }
}
