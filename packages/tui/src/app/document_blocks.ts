/**
 * Manages document file tree rows, collapsed blocks for rendering placeholders, and code content in the TUI.
 */
import {
  CodeRenderable,
  LineNumberRenderable,
  type CliRenderer,
  type ScrollBoxRenderable,
} from "@opentui/core";
import { createFileTreeRowView } from "../components/file-tree-row";
import { LineModel } from "../line-model";
import { theme } from "../theme";
import type { CodeFileEntry } from "../types";
import { computeFilesModeViewportWidth, formatCollapsedContentLine } from "./render";
import { FileExplorer } from "./file_explorer";
import type { FileTreeRow } from "../modes";

type RenderCursor = {
  nextLineNumber: number;
  nextDisplayRow: number;
  blockStartLine: number;
};

export class DocumentBlocks {
  private readonly renderer: CliRenderer;
  private readonly scrollbox: ScrollBoxRenderable;
  private readonly lineModel: LineModel;
  private readonly fileExplorer: FileExplorer;

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

  public addFileTreeRowBlock(
    row: FileTreeRow,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): RenderCursor {
    const rowView = createFileTreeRowView(this.renderer, row, this.getFilesModeViewportWidth());

    this.scrollbox.add(rowView.codeView);
    this.lineModel.addBlock({
      lineView: null,
      codeView: rowView.codeView,
      defaultLineNumberFg: theme.getCodeLineNumberColor(),
      defaultLineSigns: new Map(),
      blockKind: "file",
      fileLineStart: null,
      renderedLines: [rowView.renderedLine],
      lineStart: nextLineNumber,
      lineCount: 1,
      displayRowStart: nextDisplayRow,
      filePath: row.filePath,
    });

    this.fileExplorer.setRowAtLine(nextLineNumber, row);
    return {
      nextLineNumber: nextLineNumber + 1,
      nextDisplayRow: nextDisplayRow + 1,
      blockStartLine: nextLineNumber,
    };
  }

  public addCollapsedPlaceholderBlock(
    entry: CodeFileEntry,
    collapsedLineCount: number,
    dividerWidth: number,
    fileLineStart: number,
    nextLineNumber: number,
    nextDisplayRow: number,
  ): RenderCursor {
    const label = `↑ ${collapsedLineCount} lines collapsed (file) ↓`;
    const content = formatCollapsedContentLine(label, dividerWidth);

    const code = new CodeRenderable(this.renderer, {
      width: "100%",
      content,
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

    this.scrollbox.add(lineView);
    this.lineModel.addBlock({
      lineView,
      codeView: code,
      defaultLineNumberFg: theme.getCollapsedForegroundColor(),
      defaultLineSigns: new Map(),
      blockKind: "collapsed",
      fileLineStart,
      renderedLines: [content],
      lineStart: nextLineNumber,
      lineCount: 1,
      displayRowStart: nextDisplayRow,
      filePath: entry.relativePath,
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
    const renderedLines = content.split("\n");
    const code = new CodeRenderable(this.renderer, {
      width: "100%",
      content,
      filetype: entry.filetype,
      syntaxStyle: theme.getSyntaxStyle(),
      wrapMode: "none",
      bg: theme.getTransparentColor(),
      conceal: false,
    });
    code.selectable = false;

    const lineView = new LineNumberRenderable(this.renderer, {
      width: "100%",
      target: code,
      showLineNumbers: true,
      minWidth: Math.max(2, String(Math.max(1, entry.lineCount)).length),
      paddingRight: 1,
      lineNumberOffset: fileLineStart - 1,
      fg: theme.getCodeLineNumberColor(),
      bg: theme.getTransparentColor(),
    });
    lineView.selectable = false;

    for (let lineOffset = 0; lineOffset < renderedLineCount; lineOffset += 1) {
      const fileLine = fileLineStart + lineOffset;
      if (!entry.uncommittedLines.has(fileLine)) continue;
      lineView.setLineSign(lineOffset, {
        before: "▌",
        beforeColor: theme.getUncommittedLineSignColor(),
      });
    }
    const defaultLineSigns = new Map(lineView.getLineSigns());

    this.scrollbox.add(lineView);
    this.lineModel.addBlock({
      lineView,
      codeView: code,
      defaultLineNumberFg: theme.getCodeLineNumberColor(),
      defaultLineSigns,
      blockKind: "code",
      fileLineStart,
      renderedLines,
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
}
