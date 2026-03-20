/**
 * Highlight controller: applies cursor/selection/visual-mode styling onto
 * rendered line/code views in the TUI.
 */
import { CodeRenderable, LineNumberRenderable, RGBA, Selection } from "@opentui/core";
import { theme } from "../theme";
import type { RenderedLineBlock } from "../types";

type RuntimeCodeSelectionApi = {
  onSelectionChanged?: (selection: Selection | null) => boolean;
  selectionFg?: string | RGBA;
  selectionBg?: string | RGBA;
};

type RuntimeLineViewStyleApi = {
  fg?: string | RGBA;
};

export class Highlight {
    private static readonly MAX_SELECTION_COL = 8192;

    private activeCodeViews = new Set<CodeRenderable>();

    // ------------------------------------------
    // Actions
    // ------------------------------------------

    public reset(): void {
        for (const codeView of this.activeCodeViews) {
            this.clearCodeSelection(codeView);
        }
        this.activeCodeViews = new Set();
    }

    public apply(
        blocks: readonly RenderedLineBlock[],
        selectionStart: number,
        selectionEnd: number,
        cursorLine: number,
        visualModeEnabled: boolean,
    ): void {
        const highlightedLineNumberFg = theme.getHighlightedTextColor();
        const cursorLineBg = theme.getCursorLineHighlightBackgroundColor();
        const selectionLineBg = theme.getSelectionLineHighlightBackgroundColor();
        const nextActiveCodeViews = new Set<CodeRenderable>();

        for (const block of blocks) {
            if (block.lineView) {
                block.lineView.clearAllLineColors();
                this.setLineViewFg(block.lineView, block.defaultLineNumberFg);
                block.lineView.setLineSigns(new Map(block.defaultLineSigns));
            }

            const overlapStart = Math.max(selectionStart, block.lineStart);
            const overlapEnd = Math.min(selectionEnd, block.lineEnd);
            if (overlapStart > overlapEnd) continue;

            if (visualModeEnabled && block.codeView) {
                nextActiveCodeViews.add(block.codeView);
                this.applyCodeSelection(block.codeView, block.lineStart, overlapStart, overlapEnd);
            }
            if (block.lineView) {
                this.setLineViewFg(block.lineView, highlightedLineNumberFg);
            }

            for (let globalLine = overlapStart; globalLine <= overlapEnd; globalLine += 1) {
                if (!block.lineView) continue;
                const localLine = globalLine - block.lineStart;
                const isCursorLine = globalLine === cursorLine;
                block.lineView.setLineColor(localLine, {
                    gutter: isCursorLine ? cursorLineBg : selectionLineBg,
                    content: isCursorLine ? cursorLineBg : selectionLineBg,
                });

                const defaultSign = block.defaultLineSigns.get(localLine);
                if (!defaultSign) continue;
                block.lineView.setLineSign(localLine, {
                    ...defaultSign,
                    beforeColor: highlightedLineNumberFg,
                    afterColor: highlightedLineNumberFg,
                });
            }
        }

        for (const codeView of this.activeCodeViews) {
            if (nextActiveCodeViews.has(codeView)) continue;
            this.clearCodeSelection(codeView);
        }

        this.activeCodeViews = nextActiveCodeViews;
    }

    // ------------------------------------------
    // Private Helpers
    // ------------------------------------------

    private applyCodeSelection(
        codeView: CodeRenderable,
        blockLineStart: number,
        overlapStart: number,
        overlapEnd: number,
    ): void {
        const runtimeCodeView = codeView as unknown as RuntimeCodeSelectionApi;
        if (typeof runtimeCodeView.onSelectionChanged !== "function") return;

        runtimeCodeView.selectionFg = undefined;
        runtimeCodeView.selectionBg = theme.getTransparentColor();

        const selectionStartLine = overlapStart - blockLineStart;
        const selectionEndLine = overlapEnd - blockLineStart;
        const anchor = {
            x: codeView.x,
            y: codeView.y + selectionStartLine,
        };
        const focus = {
            x: codeView.x + Highlight.MAX_SELECTION_COL,
            y: codeView.y + selectionEndLine,
        };

        const selection = new Selection(codeView, anchor, focus);
        selection.isStart = true;
        selection.isDragging = false;
        runtimeCodeView.onSelectionChanged(selection);
    }

    private clearCodeSelection(codeView: CodeRenderable): void {
        const runtimeCodeView = codeView as unknown as RuntimeCodeSelectionApi;
        if (typeof runtimeCodeView.onSelectionChanged !== "function") return;
        runtimeCodeView.onSelectionChanged(null);
    }

    private setLineViewFg(lineView: LineNumberRenderable, fg: string | RGBA): void {
        const runtimeLineView = lineView as unknown as RuntimeLineViewStyleApi;
        runtimeLineView.fg = fg;
        lineView.requestRender();
    }
}
