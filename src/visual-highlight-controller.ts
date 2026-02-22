import { CodeRenderable, LineNumberRenderable, RGBA, Selection } from "@opentui/core";
import type { RenderedLineBlock } from "./types";

type RuntimeCodeSelectionApi = {
  onSelectionChanged?: (selection: Selection | null) => boolean;
  selectionFg?: string | RGBA;
  selectionBg?: string | RGBA;
};

type RuntimeLineViewStyleApi = {
  fg?: string | RGBA;
};

export class VisualHighlightController {
  private static readonly CURSOR_LINE_BG = "#9c9678";
  private static readonly SELECTION_LINE_BG = "#8b866c";
  private static readonly HIGHLIGHTED_FG = RGBA.fromValues(0, 0, 0, 0.85);
  private static readonly TRANSPARENT_BG = RGBA.fromValues(0, 0, 0, 0);
  private static readonly MAX_SELECTION_COL = 8192;

  private activeCodeViews = new Set<CodeRenderable>();

  public reset(): void {
    this.activeCodeViews = new Set();
  }

  public apply(
    blocks: readonly RenderedLineBlock[],
    selectionStart: number,
    selectionEnd: number,
    cursorLine: number,
  ): void {
    const nextActiveCodeViews = new Set<CodeRenderable>();

    for (const block of blocks) {
      block.lineView.clearAllLineColors();
      this.setLineViewFg(block.lineView, block.defaultLineNumberFg);
      block.lineView.setLineSigns(new Map(block.defaultLineSigns));

      const overlapStart = Math.max(selectionStart, block.lineStart);
      const overlapEnd = Math.min(selectionEnd, block.lineEnd);
      if (overlapStart > overlapEnd) continue;

      nextActiveCodeViews.add(block.codeView);
      this.setLineViewFg(block.lineView, VisualHighlightController.HIGHLIGHTED_FG);
      this.applyCodeSelection(block.codeView, block.lineStart, overlapStart, overlapEnd);

      for (let globalLine = overlapStart; globalLine <= overlapEnd; globalLine += 1) {
        const localLine = globalLine - block.lineStart;
        const isCursorLine = globalLine === cursorLine;
        block.lineView.setLineColor(localLine, {
          gutter: isCursorLine
            ? VisualHighlightController.CURSOR_LINE_BG
            : VisualHighlightController.SELECTION_LINE_BG,
          content: isCursorLine
            ? VisualHighlightController.CURSOR_LINE_BG
            : VisualHighlightController.SELECTION_LINE_BG,
        });

        const defaultSign = block.defaultLineSigns.get(localLine);
        if (!defaultSign) continue;
        block.lineView.setLineSign(localLine, {
          ...defaultSign,
          beforeColor: VisualHighlightController.HIGHLIGHTED_FG,
          afterColor: VisualHighlightController.HIGHLIGHTED_FG,
        });
      }
    }

    for (const codeView of this.activeCodeViews) {
      if (nextActiveCodeViews.has(codeView)) continue;
      this.clearCodeSelection(codeView);
    }

    this.activeCodeViews = nextActiveCodeViews;
  }

  private applyCodeSelection(
    codeView: CodeRenderable,
    blockLineStart: number,
    overlapStart: number,
    overlapEnd: number,
  ): void {
    const runtimeCodeView = codeView as unknown as RuntimeCodeSelectionApi;
    if (typeof runtimeCodeView.onSelectionChanged !== "function") return;

    runtimeCodeView.selectionFg = VisualHighlightController.HIGHLIGHTED_FG;
    runtimeCodeView.selectionBg = VisualHighlightController.TRANSPARENT_BG;

    const selectionStartLine = overlapStart - blockLineStart;
    const selectionEndLine = overlapEnd - blockLineStart;
    const anchor = {
      x: codeView.x,
      y: codeView.y + selectionStartLine,
    };
    const focus = {
      x: codeView.x + VisualHighlightController.MAX_SELECTION_COL,
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
