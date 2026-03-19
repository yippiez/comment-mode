import {
    BoxRenderable,
    TextareaRenderable,
    TextAttributes,
    TextRenderable,
    type CliRenderer,
} from "@opentui/core";
import { theme } from "../../theme";
import { clearChildren } from "../../utils/ui";
import { displayWidth, estimateWrappedLines, truncateLeftLabel } from "../../utils/text";

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
  modelOptions: string[];
  thinkingOptions: string[];
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
    private readonly dropdownBox: BoxRenderable;
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
            height: 2,
            flexDirection: "column",
            alignItems: "stretch",
            gap: 0,
            backgroundColor: theme.getPromptOverlayBackgroundColor(),
        });

        this.promptShell = new BoxRenderable(renderer, {
            width: "100%",
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
            wrapMode: "char",
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
            width: "100%",
            flexDirection: "row",
            alignItems: "center",
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

        this.dropdownBox = new BoxRenderable(renderer, {
            width: "100%",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 0,
            visible: false,
            backgroundColor: theme.getPromptOverlayBackgroundColor(),
        });
        this.row.add(this.dropdownBox);

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
            this.dropdownBox.visible = false;
            clearChildren(this.dropdownBox);
            this.overlay.requestRender();
            return;
        }

        const modelLabel = this.getModelLabel(state);
        const thinkingLabel = this.getThinkingLabel(state);
        const promptLineCount = this.computePromptLineCount(state.promptText, layout);
        const dropdownMode = state.field === "model" ? "model" : state.field === "thinking" ? "thinking" : null;
        const dropdownOptions =
      dropdownMode === "model"
          ? state.modelOptions
          : dropdownMode === "thinking"
              ? state.thinkingOptions
              : [];
        const selectedOption = dropdownMode === "model" ? state.model : state.thinkingLevel;
        const maxHeight = Math.max(1, layout.maxHeight);
        const chipsRows = maxHeight >= 2 ? 1 : 0;
        const maxDropdownRows = Math.max(0, maxHeight - chipsRows - 1);
        const dropdownRows = dropdownMode ? Math.min(8, dropdownOptions.length, maxDropdownRows) : 0;
        const promptRows = Math.max(1, Math.min(promptLineCount, maxHeight - chipsRows - dropdownRows));
        const boundedHeight = Math.max(1, promptRows + chipsRows + dropdownRows);

        this.overlay.top = Math.max(0, layout.top);
        this.overlay.height = boundedHeight;
        this.row.height = boundedHeight;
        this.promptShell.height = promptRows;
        this.input.wrapMode = "char";
        this.input.height = promptRows;
        this.input.minHeight = promptRows;
        this.input.maxHeight = promptRows;
        this.chipsRow.visible = chipsRows > 0;
        this.chipsRow.height = chipsRows > 0 ? 1 : 0;
        this.dropdownBox.visible = dropdownRows > 0;
        this.renderDropdown(dropdownMode, dropdownOptions, selectedOption, dropdownRows);

        const modelActive = state.field === "model";
        this.modelText.content = ` model: ${modelLabel} `;
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
        this.thinkingText.content = ` thinking: ${thinkingLabel} `;
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
        this.dropdownBox.backgroundColor = theme.getPromptOverlayBackgroundColor();
        this.promptShell.backgroundColor = theme.getPromptInputBackgroundColor();
        this.promptPrefix.fg = theme.getPromptPrefixColor();
        this.applyTextareaTheme();
        this.overlay.requestRender();
    }

    /** Formats the model chip label with loading state suffix. */
    private getModelLabel(state: PromptComposerViewState): string {
        const loadingSuffix = state.loading ? " (loading)" : "";
        return `${state.model}${loadingSuffix}`;
    }

    /** Formats the thinking-level chip label shown next to model. */
    private getThinkingLabel(state: PromptComposerViewState): string {
        return state.thinkingLevel;
    }

    /** Estimates prompt line usage using current prompt area width. */
    private computePromptLineCount(promptText: string, layout: PromptComposerLayout): number {
        const maxHeight = Math.max(1, layout.maxHeight);
        const availablePromptWidth = this.getPromptInputWidth();
        const wrapped = estimateWrappedLines(promptText, availablePromptWidth);
        return Math.min(maxHeight, Math.max(1, wrapped));
    }

    private getPromptInputWidth(): number {
        const totalWidth = Math.max(24, this.renderer.width);
        const prefixWidth = displayWidth(PromptComposerBar.PROMPT_PREFIX);
        return Math.max(8, totalWidth - 2 - 2 - prefixWidth - 2);
    }

    private renderDropdown(
        mode: "model" | "thinking" | null,
        options: readonly string[],
        selectedOption: string,
        visibleRowCount: number,
    ): void {
        clearChildren(this.dropdownBox);
        if (!mode || visibleRowCount <= 0 || options.length === 0) {
            this.dropdownBox.visible = false;
            return;
        }

        this.dropdownBox.visible = true;
        const selectedIndex = Math.max(0, options.indexOf(selectedOption));
        const window = this.computeVisibleWindow(selectedIndex, options.length, visibleRowCount);
        const contentWidth = Math.max(8, this.renderer.width - 4);

        for (let index = window.start; index < window.end; index += 1) {
            const option = options[index] ?? "";
            const isSelected = index === selectedIndex;
            const marker = isSelected ? "›" : " ";
            const content = `${marker} ${truncateLeftLabel(option, Math.max(1, contentWidth - 2))}`;
            this.dropdownBox.add(
                new TextRenderable(this.renderer, {
                    width: "100%",
                    content,
                    fg: isSelected
                        ? theme.getPromptChipActiveForegroundColor()
                        : theme.getPromptChipForegroundColor(),
                    bg: isSelected
                        ? theme.getPromptChipActiveBackgroundColor()
                        : theme.getPromptChipBackgroundColor(),
                    attributes: isSelected ? TextAttributes.BOLD : TextAttributes.NONE,
                    overflow: "hidden",
                    truncate: true,
                    wrapMode: "none",
                    paddingLeft: 1,
                    paddingRight: 1,
                }),
            );
        }
    }

    private computeVisibleWindow(
        selectedIndex: number,
        optionCount: number,
        visibleRowCount: number,
    ): { start: number; end: number } {
        if (optionCount <= visibleRowCount) {
            return { start: 0, end: optionCount };
        }

        const half = Math.floor(visibleRowCount / 2);
        let start = Math.max(0, selectedIndex - half);
        let end = Math.min(optionCount, start + visibleRowCount);
        if (end - start < visibleRowCount) {
            start = Math.max(0, end - visibleRowCount);
        }
        return { start, end };
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
