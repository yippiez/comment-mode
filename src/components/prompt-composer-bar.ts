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
};

export class PromptComposerBar {
  private readonly overlay: BoxRenderable;
  private readonly harnessText: TextRenderable;
  private readonly modelText: TextRenderable;
  private readonly input: TextareaRenderable;

  constructor(renderer: CliRenderer) {
    this.overlay = new BoxRenderable(renderer, {
      id: "prompt-overlay",
      position: "absolute",
      bottom: 0,
      left: 0,
      width: "100%",
      height: 4,
      flexDirection: "column",
      backgroundColor: "#111827",
      paddingLeft: 1,
      paddingRight: 1,
      zIndex: 900,
      visible: false,
    });

    const topRow = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 1,
      backgroundColor: "#111827",
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
    topRow.add(this.harnessText);

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
    topRow.add(this.modelText);
    this.overlay.add(topRow);

    const spacerRow = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: "#111827",
    });
    this.overlay.add(spacerRow);

    const bottomRow = new BoxRenderable(renderer, {
      width: "100%",
      height: 2,
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: "#111827",
    });
    bottomRow.add(
      new TextRenderable(renderer, {
        content: "> ",
        fg: "#f9fafb",
        attributes: TextAttributes.BOLD,
      }),
    );

    this.input = new TextareaRenderable(renderer, {
      width: "100%",
      placeholder: "write prompt and press Enter",
      height: 2,
      minHeight: 2,
      maxHeight: 2,
      wrapMode: "word",
      backgroundColor: "#1f2937",
      focusedBackgroundColor: "#374151",
      textColor: "#f3f4f6",
      focusedTextColor: "#ffffff",
      selectionBg: "#6b7280",
      selectionFg: "#ffffff",
    });
    this.input.focusable = false;
    bottomRow.add(this.input);
    this.overlay.add(bottomRow);
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

  public render(state: PromptComposerViewState): void {
    this.overlay.visible = state.visible;

    if (!state.visible) {
      this.harnessText.content = "";
      this.modelText.content = "";
      this.overlay.requestRender();
      return;
    }

    const harnessActive = state.field === "harness";
    this.harnessText.content = ` ${state.harness} `;
    this.harnessText.fg = harnessActive ? "#111827" : "#f3f4f6";
    this.harnessText.bg = harnessActive ? "#e5e7eb" : "#374151";
    this.harnessText.attributes = harnessActive
      ? TextAttributes.BOLD | TextAttributes.UNDERLINE
      : TextAttributes.NONE;

    const modelActive = state.field === "model";
    const modelSearch = state.modelQuery.trim().length > 0 ? ` [${state.modelQuery.trim()}]` : "";
    this.modelText.content = ` ${state.model}${modelSearch}${state.loading ? " (loading)" : ""} `;
    this.modelText.fg = modelActive ? "#111827" : "#f3f4f6";
    this.modelText.bg = modelActive ? "#e5e7eb" : "#374151";
    this.modelText.attributes = modelActive
      ? TextAttributes.BOLD | TextAttributes.UNDERLINE
      : TextAttributes.NONE;

    this.overlay.requestRender();
  }
}
