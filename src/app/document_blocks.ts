/**
 * Manages document file tree rows, collapsed blocks for rendering placeholders, and code content in the TUI.
 */
import {
    CodeRenderable,
    LineNumberRenderable,
    type CliRenderer,
    type ScrollBoxRenderable,
} from "@opentui/core";
import { createFileTreeRowView } from "./file-tree-row";
import { LineModel } from "../line-model";
import { theme } from "../theme";
import type { CodeFileEntry } from "../types";
import { computeFilesModeViewportWidth, formatCollapsedContentLine } from "./renderer";
import { FileExplorer } from "./file_explorer";
import type { FileTreeRow } from "./view_modes";

type RenderCursor = {
  nextLineNumber: number;
  nextDisplayRow: number;
  blockStartLine: number;
};

type LineSign = {
  before?: string;
  beforeColor?: string;
  after?: string;
  afterColor?: string;
};

type CachedCodeBlock = {
  lineView: LineNumberRenderable;
  codeView: CodeRenderable;
  renderedLines: string[];
  defaultLineSigns: Map<number, LineSign>;
  lastUsedRenderPass: number;
};

const CACHED_BLOCK_STALE_RENDER_PASSES = 600;
const MAX_CACHED_CODE_BLOCKS = 1200;

export class DocumentBlocks {
    private readonly renderer: CliRenderer;
    private readonly scrollbox: ScrollBoxRenderable;
    private readonly lineModel: LineModel;
    private readonly fileExplorer: FileExplorer;
    private readonly cachedCodeBlocks = new Map<string, CachedCodeBlock>();
    private activeCodeBlockKeys = new Set<string>();
    private renderPass = 0;

    constructor(
        renderer: CliRenderer,
        scrollbox: ScrollBoxRenderable,
        lineModel: LineModel,
        fileExplorer: FileExplorer,
    ) {
        this.renderer = renderer;
        this.scrollbox = scrollbox;
        this.lineModel = lineModel;
        this.fileExplorer = fileExplorer;
    }

    public beginRender(): void {
        this.renderPass += 1;
        this.activeCodeBlockKeys.clear();
    }

    public endRender(): void {
        const staleThreshold = this.renderPass - CACHED_BLOCK_STALE_RENDER_PASSES;
        for (const [key, block] of this.cachedCodeBlocks.entries()) {
            if (this.activeCodeBlockKeys.has(key)) continue;
            if (block.lastUsedRenderPass > staleThreshold) continue;
            block.lineView.destroyRecursively();
            this.cachedCodeBlocks.delete(key);
        }

        if (this.cachedCodeBlocks.size <= MAX_CACHED_CODE_BLOCKS) return;
        for (const [key, block] of this.cachedCodeBlocks.entries()) {
            if (this.activeCodeBlockKeys.has(key)) continue;
            block.lineView.destroyRecursively();
            this.cachedCodeBlocks.delete(key);
            if (this.cachedCodeBlocks.size <= MAX_CACHED_CODE_BLOCKS) break;
        }
    }

    public addFileTreeRowBlock(
        row: FileTreeRow,
        nextLineNumber: number,
        nextDisplayRow: number,
        lineModelFilePath = row.filePath,
    ): RenderCursor {
        const rowView = createFileTreeRowView(this.renderer, row, this.getFilesModeViewportWidth());
        const lineView = new LineNumberRenderable(this.renderer, {
            width: "100%",
            target: rowView.codeView,
            showLineNumbers: false,
            minWidth: 0,
            paddingRight: 0,
            fg: theme.getCodeLineNumberColor(),
            bg: theme.getTransparentColor(),
        });
        lineView.selectable = false;

        this.scrollbox.add(lineView);
        this.lineModel.addBlock({
            lineView,
            codeView: rowView.codeView,
            defaultLineNumberFg: theme.getCodeLineNumberColor(),
            defaultLineSigns: new Map(),
            blockKind: "file",
            fileLineStart: null,
            renderedLines: [rowView.renderedLine],
            lineStart: nextLineNumber,
            lineCount: 1,
            displayRowStart: nextDisplayRow,
            filePath: lineModelFilePath,
        });

        this.fileExplorer.setRowAtLine(nextLineNumber, row);
        return {
            nextLineNumber: nextLineNumber + 1,
            nextDisplayRow: nextDisplayRow + 1,
            blockStartLine: nextLineNumber,
        };
    }

    public addCollapsedPlaceholderBlock(
        filePath: string,
        filetype: string | undefined,
        collapsedLineCount: number | null,
        dividerWidth: number,
        fileLineStart: number,
        nextLineNumber: number,
        nextDisplayRow: number,
        labelOverride?: string,
    ): RenderCursor {
        const label = labelOverride ??
      (typeof collapsedLineCount === "number"
          ? `↑ ${collapsedLineCount} lines collapsed (file) ↓`
          : "↑ lazy loaded (open file to load) ↓");
        const content = formatCollapsedContentLine(label, dividerWidth);
        const key = this.buildCollapsedBlockKey(filePath, filetype, fileLineStart, content);

        let block = this.cachedCodeBlocks.get(key);
        if (!block) {
            const code = new CodeRenderable(this.renderer, {
                width: "100%",
                content,
                filetype,
                syntaxStyle: theme.getSyntaxStyle(),
                wrapMode: "none",
                bg: theme.getCollapsedBackgroundColor(),
            });
            code.selectable = false;

            const lineView = new LineNumberRenderable(this.renderer, {
                width: "100%",
                target: code,
                showLineNumbers: false,
                minWidth: 0,
                paddingRight: 0,
                fg: theme.getCollapsedForegroundColor(),
                bg: theme.getCollapsedBackgroundColor(),
            });
            lineView.selectable = false;

            block = {
                lineView,
                codeView: code,
                renderedLines: [content],
                defaultLineSigns: new Map(),
                lastUsedRenderPass: this.renderPass,
            };
            this.cachedCodeBlocks.set(key, block);
        }

        this.touchCachedBlock(key, block);
        if (block.codeView.content !== content) {
            block.codeView.content = content;
            block.renderedLines = [content];
        }

        this.scrollbox.add(block.lineView);
        this.lineModel.addBlock({
            lineView: block.lineView,
            codeView: block.codeView,
            defaultLineNumberFg: theme.getCollapsedForegroundColor(),
            defaultLineSigns: new Map(block.defaultLineSigns),
            blockKind: "collapsed",
            fileLineStart,
            renderedLines: block.renderedLines,
            lineStart: nextLineNumber,
            lineCount: 1,
            displayRowStart: nextDisplayRow,
            filePath,
        });

        return {
            nextLineNumber: nextLineNumber + 1,
            nextDisplayRow: nextDisplayRow + 1,
            blockStartLine: nextLineNumber,
        };
    }

    public addCodeBlock(
        entry: CodeFileEntry,
        content: string,
        fileLineStart: number,
        lineCount: number,
        nextLineNumber: number,
        nextDisplayRow: number,
    ): RenderCursor {
        const renderedLineCount = Math.max(1, lineCount);
        const lineNumberWidth = Math.max(2, String(Math.max(1, entry.lineCount)).length);
        const key = this.buildCodeBlockKey(
            entry.relativePath,
            entry.filetype,
            fileLineStart,
            renderedLineCount,
            lineNumberWidth,
        );

        let block = this.cachedCodeBlocks.get(key);
        if (!block) {
            const renderedLines = content.split("\n");
            const code = new CodeRenderable(this.renderer, {
                width: "100%",
                content,
                filetype: entry.filetype,
                syntaxStyle: theme.getSyntaxStyle(),
                wrapMode: "none",
                bg: theme.getTransparentColor(),
                conceal: false,
                drawUnstyledText: true,
            });
            code.selectable = false;

            const lineView = new LineNumberRenderable(this.renderer, {
                width: "100%",
                target: code,
                showLineNumbers: true,
                minWidth: lineNumberWidth,
                paddingRight: 1,
                lineNumberOffset: fileLineStart - 1,
                fg: theme.getCodeLineNumberColor(),
                bg: theme.getTransparentColor(),
            });
            lineView.selectable = false;

            block = {
                lineView,
                codeView: code,
                renderedLines,
                defaultLineSigns: new Map(),
                lastUsedRenderPass: this.renderPass,
            };
            this.cachedCodeBlocks.set(key, block);
        }

        this.touchCachedBlock(key, block);
        if (block.codeView.content !== content) {
            block.codeView.content = content;
            block.renderedLines = content.split("\n");
        }

        const defaultLineSigns = this.computeDefaultLineSigns(entry, fileLineStart, renderedLineCount);
        block.lineView.lineNumberOffset = fileLineStart - 1;
        block.lineView.clearAllLineSigns();
        block.lineView.setLineSigns(new Map(defaultLineSigns));
        block.defaultLineSigns = defaultLineSigns;

        this.scrollbox.add(block.lineView);
        this.lineModel.addBlock({
            lineView: block.lineView,
            codeView: block.codeView,
            defaultLineNumberFg: theme.getCodeLineNumberColor(),
            defaultLineSigns: new Map(defaultLineSigns),
            blockKind: "code",
            fileLineStart,
            renderedLines: block.renderedLines,
            lineStart: nextLineNumber,
            lineCount: renderedLineCount,
            displayRowStart: nextDisplayRow,
            filePath: entry.relativePath,
        });

        return {
            nextLineNumber: nextLineNumber + renderedLineCount,
            nextDisplayRow: nextDisplayRow + renderedLineCount,
            blockStartLine: nextLineNumber,
        };
    }

    private getFilesModeViewportWidth(): number {
        return computeFilesModeViewportWidth(
            Math.floor(this.scrollbox.viewport.width),
            Math.floor(this.scrollbox.width),
            this.renderer.width,
        );
    }

    private buildCollapsedBlockKey(
        filePath: string,
        filetype: string | undefined,
        fileLineStart: number,
        content: string,
    ): string {
        return [
            "collapsed",
            theme.getThemeName(),
            filePath,
            filetype ?? "",
            String(fileLineStart),
            content,
        ].join("|");
    }

    private buildCodeBlockKey(
        filePath: string,
        filetype: string | undefined,
        fileLineStart: number,
        lineCount: number,
        lineNumberWidth: number,
    ): string {
        return [
            "code",
            theme.getThemeName(),
            filePath,
            filetype ?? "",
            String(fileLineStart),
            String(lineCount),
            String(lineNumberWidth),
        ].join("|");
    }

    private touchCachedBlock(key: string, block: CachedCodeBlock): void {
        this.activeCodeBlockKeys.add(key);
        block.lastUsedRenderPass = this.renderPass;
    }

    private computeDefaultLineSigns(
        entry: CodeFileEntry,
        fileLineStart: number,
        renderedLineCount: number,
    ): Map<number, LineSign> {
        const signs = new Map<number, LineSign>();
        for (let lineOffset = 0; lineOffset < renderedLineCount; lineOffset += 1) {
            const fileLine = fileLineStart + lineOffset;
            if (!entry.markAllLinesUncommitted && !entry.uncommittedLines.has(fileLine)) continue;
            signs.set(lineOffset, {
                before: "▌",
                beforeColor: theme.getUncommittedLineSignColor(),
            });
        }
        return signs;
    }

}
