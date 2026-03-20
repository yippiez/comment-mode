/**
 * Theme manager: holds available themes and provides a cached OpenTUI
 * `SyntaxStyle` plus themed color accessors used throughout the app.
 */
import { SyntaxStyle } from "@opentui/core";
import { vagueTheme } from "./vague";
import { opencodeTheme } from "./opencode";
import { tokyoNightTheme } from "./tokyoNight";
import { sodaTheme } from "./soda";
import type { SyntaxPalette, ThemeColors, ThemeDefinition } from "./types";
import { buildSyntaxStyle } from "./types";

export type { SyntaxPalette, ThemeColors, ThemeDefinition };

export class ThemeManager {
    private static instance: ThemeManager | null = null;
    private readonly themes: ThemeDefinition[];
    private readonly syntaxStyleCache = new Map<string, SyntaxStyle>();
    private currentThemeIndex = 0;

    private constructor() {
        this.themes = [vagueTheme, opencodeTheme, tokyoNightTheme, sodaTheme];
    }

    // ------------------------------------------
    // Getters
    // ------------------------------------------

    public static getInstance(): ThemeManager {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }

    // ------------------------------------------
    // Actions
    // ------------------------------------------

    public toggleTheme(): string {
        this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
        return this.getThemeName();
    }

    // ------------------------------------------
    // Getters
    // ------------------------------------------

    public getThemeName(): string {
        return this.currentTheme.name;
    }

    public getSyntaxStyle(): SyntaxStyle {
        const themeName = this.currentTheme.name;
        const cached = this.syntaxStyleCache.get(themeName);
        if (cached) return cached;
        const style = buildSyntaxStyle(this.currentTheme.syntax);
        this.syntaxStyleCache.set(themeName, style);
        return style;
    }

    public getBackgroundColor(): string {
        return this.currentTheme.colors.background;
    }

    public getFunctionColor(): string {
        return this.currentTheme.syntax.function;
    }

    public getChipSelectedBackgroundColor(focused: boolean): string {
        return focused
            ? this.currentTheme.colors.chipSelectedFocusedBg
            : this.currentTheme.colors.chipSelectedBlurBg;
    }

    public getChipBackgroundColor(enabled: boolean): string {
        return enabled ? this.currentTheme.colors.chipEnabledBg : this.currentTheme.colors.chipDisabledBg;
    }

    public getChipTextColor(selected: boolean, enabled: boolean): string {
        if (selected) return this.currentTheme.colors.chipSelectedFg;
        return enabled ? this.currentTheme.colors.chipEnabledFg : this.currentTheme.colors.chipDisabledFg;
    }

    public getDividerForegroundColor(): string {
        return this.currentTheme.colors.dividerFg;
    }

    public getDividerBackgroundColor(): string {
        return this.currentTheme.colors.dividerBg;
    }

    public getCollapsedBackgroundColor(): string {
        return this.currentTheme.colors.collapsedBg;
    }

    public getCollapsedForegroundColor(): string {
        return this.currentTheme.colors.collapsedFg;
    }

    public getCodeLineNumberColor(): string {
        return this.currentTheme.colors.codeLineNumberFg;
    }

    public getUncommittedLineSignColor(): string {
        return this.currentTheme.colors.uncommittedSignColor;
    }

    public getAgentRowForegroundColor(): string {
        return this.currentTheme.colors.agentRowFg;
    }

    public getAgentRowSelectedBackgroundColor(): string {
        return this.currentTheme.colors.agentRowSelectedBg;
    }

    public getAgentRowSelectedForegroundColor(): string {
        return this.currentTheme.colors.agentRowSelectedFg;
    }

    public getAgentRowCursorBackgroundColor(): string {
        return this.currentTheme.colors.agentRowCursorBg;
    }

    public getAgentRowCursorForegroundColor(): string {
        return this.currentTheme.colors.agentRowCursorFg;
    }

    public getAgentMessageBackgroundColor(): string {
        return this.currentTheme.colors.agentMessageBg;
    }

    public getAgentMessageForegroundColor(): string {
        return this.currentTheme.colors.agentMessageFg;
    }

    public getAgentStatusBackgroundColor(status: "draft" | "running" | "completed" | "failed"): string {
        switch (status) {
            case "running":
                return this.currentTheme.colors.statusRunningBg;
            case "completed":
                return this.currentTheme.colors.statusCompletedBg;
            case "failed":
                return this.currentTheme.colors.statusFailedBg;
            default:
                return this.currentTheme.colors.statusDraftBg;
        }
    }

    public getEmptyStateColor(): string {
        return this.currentTheme.colors.emptyStateFg;
    }

    public getModalBorderColor(): string {
        return this.currentTheme.colors.modalBorderColor;
    }

    public getModalBackgroundColor(): string {
        return this.currentTheme.colors.modalBackgroundColor;
    }

    public getModalTitleColor(): string {
        return this.currentTheme.colors.modalTitleColor;
    }

    public getModalSectionTitleColor(): string {
        return this.currentTheme.colors.modalSectionTitleColor;
    }

    public getModalShortcutKeyColor(): string {
        return this.currentTheme.colors.modalShortcutKeyColor;
    }

    public getModalShortcutDescriptionColor(): string {
        return this.currentTheme.colors.modalShortcutDescriptionColor;
    }

    public getSearchStatusColor(): string {
        return this.currentTheme.colors.searchStatusColor;
    }

    public getSearchInputBackgroundColor(): string {
        return this.currentTheme.colors.searchInputBg;
    }

    public getSearchInputFocusedBackgroundColor(): string {
        return this.currentTheme.colors.searchInputFocusedBg;
    }

    public getSearchInputTextColor(): string {
        return this.currentTheme.colors.searchInputText;
    }

    public getSearchInputFocusedTextColor(): string {
        return this.currentTheme.colors.searchInputFocusedText;
    }

    public getSearchInputSelectionBackgroundColor(): string {
        return this.currentTheme.colors.searchInputSelectionBg;
    }

    public getSearchInputSelectionForegroundColor(): string {
        return this.currentTheme.colors.searchInputSelectionFg;
    }

    public getSearchSelectedRowBackgroundColor(): string {
        return this.currentTheme.colors.searchSelectedRowBg;
    }

    public getSearchSelectedRowForegroundColor(): string {
        return this.currentTheme.colors.searchSelectedRowFg;
    }

    public getSearchRowForegroundColor(): string {
        return this.currentTheme.colors.searchRowFg;
    }

    public getSearchKindColor(kind: string): string {
        switch (kind) {
            case "file":
                return this.currentTheme.colors.searchFileKindColor;
            case "function":
                return this.currentTheme.colors.searchFunctionKindColor;
            case "variable":
                return this.currentTheme.colors.searchVariableKindColor;
            case "class":
                return this.currentTheme.colors.searchClassKindColor;
            case "type":
                return this.currentTheme.colors.searchTypeKindColor;
            case "heading":
                return this.currentTheme.colors.searchHeadingKindColor;
            case "reference":
                return this.currentTheme.colors.searchFunctionKindColor;
            default:
                return this.currentTheme.colors.searchFallbackKindColor;
        }
    }

    public getPromptOverlayBackgroundColor(): string {
        return this.currentTheme.colors.promptOverlayBg;
    }

    public getPromptInputBackgroundColor(): string {
        return this.currentTheme.colors.promptInputBg;
    }

    public getPromptInputFocusedBackgroundColor(): string {
        return this.currentTheme.colors.promptInputFocusedBg;
    }

    public getPromptPrefixColor(): string {
        return this.currentTheme.colors.promptPrefixFg;
    }

    public getPromptTextColor(): string {
        return this.currentTheme.colors.promptTextFg;
    }

    public getPromptFocusedTextColor(): string {
        return this.currentTheme.colors.promptFocusedTextFg;
    }

    public getPromptSelectionBackgroundColor(): string {
        return this.currentTheme.colors.promptSelectionBg;
    }

    public getPromptSelectionForegroundColor(): string {
        return this.currentTheme.colors.promptSelectionFg;
    }

    public getPromptChipBackgroundColor(): string {
        return this.currentTheme.colors.promptChipBg;
    }

    public getPromptChipForegroundColor(): string {
        return this.currentTheme.colors.promptChipFg;
    }

    public getPromptChipActiveBackgroundColor(): string {
        return this.currentTheme.colors.promptChipActiveBg;
    }

    public getPromptChipActiveForegroundColor(): string {
        return this.currentTheme.colors.promptChipActiveFg;
    }

    public getCursorLineHighlightBackgroundColor(): string {
        return this.currentTheme.colors.cursorLineBg;
    }

    public getSelectionLineHighlightBackgroundColor(): string {
        return this.currentTheme.colors.selectionLineBg;
    }

    public getHighlightedTextColor(): string {
        return this.currentTheme.colors.highlightedTextColor;
    }

    public getDirectoryColor(): string {
        return this.currentTheme.colors.directoryFg;
    }

    public getTransparentColor(): string {
        return "transparent";
    }

    // ------------------------------------------
    // Private Helpers
    // ------------------------------------------

    private get currentTheme(): ThemeDefinition {
        const current = this.themes[this.currentThemeIndex];
        if (!current) {
            throw new Error(`Theme index out of range: ${this.currentThemeIndex}`);
        }
        return current;
    }
}

export const theme = ThemeManager.getInstance();
