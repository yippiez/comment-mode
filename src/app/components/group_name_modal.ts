import {
    BoxRenderable,
    KeyEvent,
    TextareaRenderable,
    TextAttributes,
    TextRenderable,
    type CliRenderer,
} from "@opentui/core";
import { theme } from "../../theme";
import { readFromClipboard } from "../../utils/clipboard";
import type { AppKeyInput } from "../../types";

type RuntimeTextareaStyleApi = {
  backgroundColor?: string;
  focusedBackgroundColor?: string;
  textColor?: string;
  focusedTextColor?: string;
  selectionBg?: string;
  selectionFg?: string;
};

export class GroupNameModal {
    private readonly renderer: CliRenderer;
    private readonly overlay: BoxRenderable;
    private readonly panel: BoxRenderable;
    private readonly title: TextRenderable;
    private readonly hint: TextRenderable;
    private readonly inputShell: BoxRenderable;
    private readonly input: TextareaRenderable;

    constructor(renderer: CliRenderer) {
        this.renderer = renderer;

        this.overlay = new BoxRenderable(renderer, {
            id: "group-name-modal-overlay",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
            padding: 1,
            zIndex: 980,
            visible: false,
            backgroundColor: theme.getTransparentColor(),
        });

        this.panel = new BoxRenderable(renderer, {
            width: 56,
            height: 7,
            maxWidth: "100%",
            maxHeight: "100%",
            flexDirection: "column",
            gap: 1,
            paddingTop: 1,
            paddingBottom: 1,
            paddingLeft: 1,
            paddingRight: 1,
            border: true,
            borderColor: theme.getModalBorderColor(),
            backgroundColor: theme.getModalBackgroundColor(),
        });

        this.title = new TextRenderable(renderer, {
            content: "Name group",
            attributes: TextAttributes.BOLD,
            fg: theme.getModalTitleColor(),
        });

        this.inputShell = new BoxRenderable(renderer, {
            width: "100%",
            height: 1,
            backgroundColor: theme.getPromptInputBackgroundColor(),
            paddingLeft: 1,
            paddingRight: 1,
            flexDirection: "row",
            alignItems: "flex-start",
        });

        this.input = new TextareaRenderable(renderer, {
            flexGrow: 1,
            placeholder: "group name",
            height: 1,
            minHeight: 1,
            maxHeight: 1,
            wrapMode: "none",
            backgroundColor: theme.getPromptInputBackgroundColor(),
            focusedBackgroundColor: theme.getPromptInputFocusedBackgroundColor(),
            textColor: theme.getPromptTextColor(),
            focusedTextColor: theme.getPromptFocusedTextColor(),
            selectionBg: theme.getPromptSelectionBackgroundColor(),
            selectionFg: theme.getPromptSelectionForegroundColor(),
        });
        this.input.focusable = false;
        this.inputShell.add(this.input);

        this.hint = new TextRenderable(renderer, {
            content: "Enter to save name, Esc to keep default",
            fg: theme.getModalShortcutDescriptionColor(),
            attributes: TextAttributes.DIM,
        });

        this.panel.add(this.title);
        this.panel.add(this.inputShell);
        this.panel.add(this.hint);
        this.overlay.add(this.panel);

        this.refreshLayout();
        this.applyTheme();
    }

    public get renderable(): BoxRenderable {
        return this.overlay;
    }

    public get isVisible(): boolean {
        return this.overlay.visible;
    }

    public open(initialName: string): void {
        this.refreshLayout();
        this.overlay.visible = true;
        this.input.setText(initialName);
        this.input.cursorOffset = this.input.plainText.length;
        this.input.showCursor = true;
        this.input.focus();
        this.overlay.requestRender();
    }

    public close(): void {
        this.overlay.visible = false;
        this.input.showCursor = false;
        this.input.blur();
        this.input.setText("");
        this.overlay.requestRender();
    }

    public getName(): string {
        return this.input.plainText.trim();
    }

    public handleInputKey(key: AppKeyInput): boolean {
        if (!this.overlay.visible || this.isInputDestroyed()) return false;

        if (this.isClipboardPasteKey(key)) {
            void this.pasteClipboardIntoInput();
            return true;
        }

        const handled = this.input.handleKeyPress(new KeyEvent(key));
        if (!handled) return false;
        this.overlay.requestRender();
        return true;
    }

    public handlePasteText(text: string): void {
        if (!this.overlay.visible || this.isInputDestroyed()) return;
        if (!text) return;
        this.insertTextIntoInput(text);
    }

    public refreshLayout(): void {
        const panelWidth = Math.max(44, Math.min(80, this.renderer.width - 6));
        this.panel.width = panelWidth;
    }

    public applyTheme(): void {
        this.overlay.backgroundColor = theme.getTransparentColor();
        this.panel.backgroundColor = theme.getModalBackgroundColor();
        this.panel.borderColor = theme.getModalBorderColor();
        this.title.fg = theme.getModalTitleColor();
        this.hint.fg = theme.getModalShortcutDescriptionColor();
        this.inputShell.backgroundColor = theme.getPromptInputBackgroundColor();
        this.input.cursorColor = theme.getPromptFocusedTextColor();
        this.applyTextareaTheme();
        this.overlay.requestRender();
    }

    private applyTextareaTheme(): void {
        const runtimeTextarea = this.input as unknown as RuntimeTextareaStyleApi;
        runtimeTextarea.backgroundColor = theme.getPromptInputBackgroundColor();
        runtimeTextarea.focusedBackgroundColor = theme.getPromptInputFocusedBackgroundColor();
        runtimeTextarea.textColor = theme.getPromptTextColor();
        runtimeTextarea.focusedTextColor = theme.getPromptFocusedTextColor();
        runtimeTextarea.selectionBg = theme.getPromptSelectionBackgroundColor();
        runtimeTextarea.selectionFg = theme.getPromptSelectionForegroundColor();
    }

    private isInputDestroyed(): boolean {
        return this.overlay.isDestroyed || this.input.isDestroyed;
    }

    private isClipboardPasteKey(key: AppKeyInput): boolean {
        if (key.repeated) return false;
        return key.ctrl && (key.name ?? "").toLowerCase() === "v";
    }

    private async pasteClipboardIntoInput(): Promise<void> {
        const clipboardText = await readFromClipboard();
        if (clipboardText === null || clipboardText.length === 0) return;
        if (!this.overlay.visible || this.isInputDestroyed()) return;
        this.insertTextIntoInput(clipboardText);
    }

    private insertTextIntoInput(text: string): void {
        try {
            this.input.insertText(text);
        } catch (error) {
            if (this.isDestroyedError(error)) return;
            throw error;
        }

        this.overlay.requestRender();
    }

    private isDestroyedError(error: unknown): boolean {
        return error instanceof Error && error.message.toLowerCase().includes("destroyed");
    }
}
