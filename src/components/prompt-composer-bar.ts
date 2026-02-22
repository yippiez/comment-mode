import {
  BoxRenderable,
  TextareaRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";

export type PromptComposerField = "prompt" | "harness" | "model";

export type PromptComposerViewState = {
  visible: boolean;
  field: PromptComposerField;
  harness: string;
  model: string;
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
  private readonly harnessText: TextRenderable;
  private readonly modelText: TextRenderable;
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
      backgroundColor: "#1f2937",
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
      backgroundColor: "#1f2937",
    });

    this.promptShell = new BoxRenderable(renderer, {
      flexGrow: 1,
      height: 1,
      backgroundColor: "#0b1220",
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      alignItems: "flex-start",
    });

    this.promptPrefix = new TextRenderable(renderer, {
      content: PromptComposerBar.PROMPT_PREFIX,
      fg: "#f9fafb",
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
      backgroundColor: "#0b1220",
      focusedBackgroundColor: "#0f172a",
      textColor: "#f3f4f6",
      focusedTextColor: "#ffffff",
      selectionBg: "#6b7280",
      selectionFg: "#ffffff",
    });
    this.input.focusable = false;
    this.promptShell.add(this.input);
    this.row.add(this.promptShell);

    const chipsRow = new BoxRenderable(renderer, {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 1,
      height: 1,
      backgroundColor: "#1f2937",
    });

    this.harnessText = new TextRenderable(renderer, {
      content: "",
      fg: "#f3f4f6",
      bg: "#374151",
      overflow: "hidden",
      truncate: true,
      wrapMode: "none",
      paddingLeft: 1,
      paddingRight: 1,
    });
    chipsRow.add(this.harnessText);

    this.modelText = new TextRenderable(renderer, {
      content: "",
      fg: "#f3f4f6",
      bg: "#374151",
      overflow: "hidden",
      truncate: true,
      wrapMode: "none",
      paddingLeft: 1,
      paddingRight: 1,
    });
    chipsRow.add(this.modelText);

    this.row.add(chipsRow);
    this.overlay.add(this.row);
  }

  public get renderable(): BoxRenderable {
    return this.overlay;
  }

  public get promptInput(): TextareaRenderable {
    return this.input;
  }

  public open(promptText: string): void {
    this.overlay.visible = true;
    this.input.setText(promptText);
    this.input.focus();
    this.overlay.requestRender();
  }

  public close(): void {
    this.overlay.visible = false;
    this.input.blur();
    this.input.setText("");
    this.overlay.requestRender();
  }

  public render(state: PromptComposerViewState, layout: PromptComposerLayout): void {
    this.overlay.visible = state.visible;

    if (!state.visible) {
      this.harnessText.content = "";
      this.modelText.content = "";
      this.overlay.requestRender();
      return;
    }

    const modelLabel = this.getModelLabel(state);
    const promptLineCount = this.computePromptLineCount(state.promptText, state.harness, modelLabel, layout);
    const maxHeight = Math.max(1, layout.maxHeight);
    const boundedHeight = Math.min(promptLineCount, maxHeight);

    this.overlay.top = Math.max(0, layout.top);
    this.overlay.height = boundedHeight;
    this.row.height = boundedHeight;
    this.promptShell.height = boundedHeight;
    this.input.height = boundedHeight;
    this.input.minHeight = boundedHeight;
    this.input.maxHeight = boundedHeight;

    const harnessActive = state.field === "harness";
    this.harnessText.content = ` ${state.harness} `;
    this.harnessText.fg = harnessActive ? "#111827" : "#f3f4f6";
    this.harnessText.bg = harnessActive ? "#e5e7eb" : "#374151";
    this.harnessText.attributes = harnessActive
      ? TextAttributes.BOLD | TextAttributes.UNDERLINE
      : TextAttributes.NONE;

    const modelActive = state.field === "model";
    this.modelText.content = ` ${modelLabel} `;
    this.modelText.fg = modelActive ? "#111827" : "#f3f4f6";
    this.modelText.bg = modelActive ? "#e5e7eb" : "#374151";
    this.modelText.attributes = modelActive
      ? TextAttributes.BOLD | TextAttributes.UNDERLINE
      : TextAttributes.NONE;

    this.overlay.requestRender();
  }

  private getModelLabel(state: PromptComposerViewState): string {
    const modelSearch = state.modelQuery.trim().length > 0 ? ` [${state.modelQuery.trim()}]` : "";
    const loadingSuffix = state.loading ? " (loading)" : "";
    return `${state.model}${modelSearch}${loadingSuffix}`;
  }

  private computePromptLineCount(
    promptText: string,
    harness: string,
    modelLabel: string,
    layout: PromptComposerLayout,
  ): number {
    const maxHeight = Math.max(1, layout.maxHeight);
    const totalWidth = Math.max(24, this.renderer.width);
    const chipsWidth = harness.length + modelLabel.length + 8;
    const prefixWidth = PromptComposerBar.PROMPT_PREFIX.length;
    const availablePromptWidth = Math.max(8, totalWidth - chipsWidth - prefixWidth - 8);
    const wrapped = this.estimateWrappedLines(promptText, availablePromptWidth);
    return Math.min(maxHeight, Math.max(1, wrapped));
  }

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
}
