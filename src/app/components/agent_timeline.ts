/**
 * Manages the rendering and state of agent timeline updates in the TUI.
 *
 * Handles displaying agent updates (with status, messages) as scrollable rows,
 * tracks line mappings between update IDs and rendered lines, and applies
 * visual highlights for selection and cursor positions.
 */
import { type CliRenderer, type ScrollBoxRenderable } from "@opentui/core";
import { createAgentRow, type AgentRowDecoration } from "./agent_row";
import { LineModel } from "../../line_model";
import { theme } from "../../theme";
import type { AgentUpdate } from "../../types";
import { computeAgentContentWidth } from "../../utils/viewport";
import { formatAgentUpdateLine, wrapTextToWidth } from "../../utils/text";

type RenderCursor = {
  nextLineNumber: number;
  nextDisplayRow: number;
  blockStartLine: number;
};

type AgentLineRange = {
  start: number;
  end: number;
};

export class AgentTimeline {
    private readonly renderer: CliRenderer;
    private readonly scrollbox: ScrollBoxRenderable;
    private readonly lineModel: LineModel;

    private agentLineByUpdateId = new Map<string, number>();
    private agentLineRangeByUpdateId = new Map<string, AgentLineRange>();
    private updateIdByAgentLine = new Map<number, string>();
    private agentRowDecorations = new Map<number, AgentRowDecoration>();

    constructor(renderer: CliRenderer, scrollbox: ScrollBoxRenderable, lineModel: LineModel) {
        this.renderer = renderer;
        this.scrollbox = scrollbox;
        this.lineModel = lineModel;
    }

    public resetForRender(): void {
        this.agentLineByUpdateId = new Map();
        this.agentLineRangeByUpdateId = new Map();
        this.updateIdByAgentLine = new Map();
        this.agentRowDecorations = new Map();
    }

    public getPromptLines(): number[] {
        return [...this.agentLineByUpdateId.values()];
    }

    public getPromptLineForUpdateId(updateId: string): number | undefined {
        return this.agentLineByUpdateId.get(updateId);
    }

    public getLineRangeForUpdateId(updateId: string): AgentLineRange | undefined {
        return this.agentLineRangeByUpdateId.get(updateId);
    }

    public getUpdateIdAtLine(line: number): string | undefined {
        return this.updateIdByAgentLine.get(line);
    }

    public addUpdateWithMessages(
        update: AgentUpdate,
        nextLineNumber: number,
        nextDisplayRow: number,
    ): RenderCursor {
        const main = this.addUpdateBlock(update, nextLineNumber, nextDisplayRow);
        const withMessages = this.addMessageBlocks(update, main.nextLineNumber, main.nextDisplayRow);
        this.agentLineRangeByUpdateId.set(update.id, {
            start: main.blockStartLine,
            end: Math.max(main.blockStartLine, withMessages.nextLineNumber - 1),
        });
        return withMessages;
    }

    public applyHighlights(selectionStart: number, selectionEnd: number, cursorLine: number): void {
        for (const [line, decoration] of this.agentRowDecorations.entries()) {
            let bg = decoration.baseBg;
            let fg = decoration.baseFg;
            if (line === cursorLine) {
                bg = decoration.cursorBg;
                fg = decoration.cursorFg;
            } else if (line >= selectionStart && line <= selectionEnd) {
                bg = decoration.selectedBg;
                fg = decoration.selectedFg;
            }
            decoration.row.backgroundColor = bg;
            decoration.text.fg = fg;
            decoration.row.requestRender();
        }
    }

    private addUpdateBlock(
        update: AgentUpdate,
        nextLineNumber: number,
        nextDisplayRow: number,
    ): RenderCursor {
        const paddingLeft = 1;
        const paddingRight = 1;
        const wrappedLines = wrapTextToWidth(
            formatAgentUpdateLine(update),
            this.getContentWidth(paddingLeft, paddingRight),
        );

        let lineCursor = nextLineNumber;
        let rowCursor = nextDisplayRow;
        const blockStartLine = nextLineNumber;

        for (const line of wrappedLines) {
            const decoration = createAgentRow(this.renderer, {
                content: line,
                baseBg: theme.getAgentStatusBackgroundColor(update.status),
                baseFg: theme.getAgentRowForegroundColor(),
                selectedBg: theme.getAgentRowSelectedBackgroundColor(),
                selectedFg: theme.getAgentRowSelectedForegroundColor(),
                cursorBg: theme.getAgentRowCursorBackgroundColor(),
                cursorFg: theme.getAgentRowCursorForegroundColor(),
                paddingLeft,
                paddingRight,
                bold: true,
            });

            this.scrollbox.add(decoration.row);
            this.lineModel.addBlock({
                lineView: null,
                codeView: null,
                defaultLineNumberFg: theme.getAgentRowForegroundColor(),
                defaultLineSigns: new Map(),
                blockKind: "agent",
                fileLineStart: update.selectionEndFileLine,
                renderedLines: [line],
                lineStart: lineCursor,
                lineCount: 1,
                displayRowStart: rowCursor,
                filePath: update.filePath,
            });

            this.updateIdByAgentLine.set(lineCursor, update.id);
            this.agentRowDecorations.set(lineCursor, decoration);
            lineCursor += 1;
            rowCursor += 1;
        }

        this.agentLineByUpdateId.set(update.id, blockStartLine);
        return {
            nextLineNumber: lineCursor,
            nextDisplayRow: rowCursor,
            blockStartLine,
        };
    }

    private addMessageBlocks(
        update: AgentUpdate,
        nextLineNumber: number,
        nextDisplayRow: number,
    ): RenderCursor {
        const recentMessages = update.messages.slice(-3);
        if (recentMessages.length === 0) {
            return {
                nextLineNumber,
                nextDisplayRow,
                blockStartLine: nextLineNumber,
            };
        }

        let lineCursor = nextLineNumber;
        let rowCursor = nextDisplayRow;
        let blockStartLine: number | null = null;
        for (const message of recentMessages) {
            const result = this.addMessageBlock(update, message, lineCursor, rowCursor);
            lineCursor = result.nextLineNumber;
            rowCursor = result.nextDisplayRow;
            if (blockStartLine === null) {
                blockStartLine = result.blockStartLine;
            }
        }

        return {
            nextLineNumber: lineCursor,
            nextDisplayRow: rowCursor,
            blockStartLine: blockStartLine ?? nextLineNumber,
        };
    }

    private addMessageBlock(
        update: AgentUpdate,
        message: string,
        nextLineNumber: number,
        nextDisplayRow: number,
    ): RenderCursor {
        const paddingLeft = 2;
        const paddingRight = 1;
        const wrappedLines = wrapTextToWidth(
            ` ${message}`,
            this.getContentWidth(paddingLeft, paddingRight),
        );

        let lineCursor = nextLineNumber;
        let rowCursor = nextDisplayRow;
        const blockStartLine = nextLineNumber;

        for (const line of wrappedLines) {
            const decoration = createAgentRow(this.renderer, {
                content: line,
                baseBg: theme.getAgentMessageBackgroundColor(),
                baseFg: theme.getAgentMessageForegroundColor(),
                selectedBg: theme.getAgentRowSelectedBackgroundColor(),
                selectedFg: theme.getAgentRowSelectedForegroundColor(),
                cursorBg: theme.getAgentRowCursorBackgroundColor(),
                cursorFg: theme.getAgentRowCursorForegroundColor(),
                paddingLeft,
                paddingRight,
            });

            this.scrollbox.add(decoration.row);
            this.lineModel.addBlock({
                lineView: null,
                codeView: null,
                defaultLineNumberFg: theme.getAgentMessageForegroundColor(),
                defaultLineSigns: new Map(),
                blockKind: "agent",
                fileLineStart: update.selectionEndFileLine,
                renderedLines: [line],
                lineStart: lineCursor,
                lineCount: 1,
                displayRowStart: rowCursor,
                filePath: update.filePath,
            });

            this.updateIdByAgentLine.set(lineCursor, update.id);
            this.agentRowDecorations.set(lineCursor, decoration);
            lineCursor += 1;
            rowCursor += 1;
        }

        return {
            nextLineNumber: lineCursor,
            nextDisplayRow: rowCursor,
            blockStartLine,
        };
    }

    private getContentWidth(paddingLeft: number, paddingRight: number): number {
        return computeAgentContentWidth(
            Math.floor(this.scrollbox.viewport.width),
            Math.floor(this.scrollbox.width),
            this.renderer.width,
            paddingLeft,
            paddingRight,
        );
    }
}
