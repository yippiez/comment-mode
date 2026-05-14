/**
 * Diff renderer: displays file diffs in stacked or side-by-side format
 * with syntax highlighting and change indicators.
 */
import {
    BoxRenderable,
    CodeRenderable,
    LineNumberRenderable,
    TextAttributes,
    TextRenderable,
    type CliRenderer,
    type ScrollBoxRenderable,
} from "@opentui/core";
import { diffLines, type DiffHunk, getDiffStats, type DiffResult } from "../../utils/diff";
import { theme } from "../../theme";
import type { ChangedFile } from "../../integrations/version_control/interface";

/**
 * Block registration record for a single diff line or header.
 * Used by the renderer to register blocks in the line model for cursor navigation.
 */
export type DiffBlockRecord = {
  lineView: LineNumberRenderable | null;
  codeView: CodeRenderable | null;
  filePath: string;
  fileLineStart: number | null;
  renderedLines: string[];
  lineStart: number;
  lineCount: number;
  displayRowStart: number;
  /** True for visual separators (e.g. `─` lines) that cursor should skip. */
  isDivider?: boolean;
};

/** Layout mode for diff display. */
export type DiffLayoutMode = "stacked" | "side-by-side";

/** Configuration for diff rendering. */
export interface DiffRendererConfig {
    renderer: CliRenderer;
    scrollbox: ScrollBoxRenderable;
    getViewportWidth: () => number;
    getTotalWidth: () => number;
}

/** Internal cursor state for diff rendering. */
type DiffRenderCursor = {
    nextLineNumber: number;
    nextDisplayRow: number;
    blockStartLine: number;
    blocks: DiffBlockRecord[];
};

const SIDE_BY_SIDE_MIN_WIDTH = 120;
const LINE_NUMBER_WIDTH_BUFFER = 4;

/**
 * Renders a list of changed files as diffs.
 * Automatically chooses stacked or side-by-side based on available width.
 * @returns Updated cursor positions, hunk/anchors metadata, and block records
 */
export function renderDiffList(
    config: DiffRendererConfig,
    files: readonly ChangedFile[],
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderResult {
    const { renderer, scrollbox, getViewportWidth } = config;
    const viewportWidth = getViewportWidth();
    const layoutMode: DiffLayoutMode = viewportWidth >= SIDE_BY_SIDE_MIN_WIDTH ? "side-by-side" : "stacked";

    let lineCursor = nextLineNumber;
    let rowCursor = nextDisplayRow;
    const hunkLines: number[] = [];
    const fileAnchors: Array<{ line: number; dividerRow: number; filePath: string }> = [];
    const allBlocks: DiffBlockRecord[] = [];

    for (const file of files) {
        // Record file anchor before rendering
        const fileAnchorLine = lineCursor;
        const fileAnchorRow = rowCursor;
        fileAnchors.push({ line: fileAnchorLine, dividerRow: fileAnchorRow, filePath: file.relativePath });

        const result = renderFileDiff(config, file, layoutMode, lineCursor, rowCursor);
        // Collect hunk lines from this file
        if (result.hunkLines) {
            hunkLines.push(...result.hunkLines);
        }
        // Collect blocks from this file
        allBlocks.push(...result.blocks);
        lineCursor = result.nextLineNumber;
        rowCursor = result.nextDisplayRow;
    }

    return {
        nextLineNumber: lineCursor,
        nextDisplayRow: rowCursor,
        blockStartLine: nextLineNumber,
        hunkLines,
        fileAnchors,
        blocks: allBlocks,
    };
}

/** Full diff render result with navigation metadata and block records. */
export type DiffRenderResult = DiffRenderCursor & {
    /** Line numbers where each non-equal hunk starts. */
    hunkLines: number[];
    /** File anchors for cursor navigation. */
    fileAnchors: Array<{ line: number; dividerRow: number; filePath: string }>;
    /** Block records for line model registration. */
    blocks: DiffBlockRecord[];
};

/**
 * Renders a single file diff.
 */
export function renderFileDiff(
    config: DiffRendererConfig,
    file: ChangedFile,
    layoutMode: DiffLayoutMode,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor & { hunkLines: number[] } {
    const { renderer, scrollbox, getTotalWidth } = config;
    const filePath = file.relativePath;

    // Compute diff
    const diffResult = file.status === "untracked"
        ? createUntrackedDiff(file.newContent)
        : diffLines(file.oldContent, file.newContent);

    const stats = getDiffStats(diffResult);

    // Render file header
    const headerResult = renderDiffHeader(
        renderer,
        scrollbox,
        filePath,
        file.status,
        file.staged,
        stats,
        getTotalWidth(),
        nextLineNumber,
        nextDisplayRow,
    );
    let lineCursor = headerResult.nextLineNumber;
    let rowCursor = headerResult.nextDisplayRow;
    const blocks: DiffBlockRecord[] = [...headerResult.blocks];
    const hunkLines: number[] = [];

    // Render diff content based on layout mode
    if (layoutMode === "side-by-side") {
        const result = renderSideBySideDiff(config, diffResult, lineCursor, rowCursor);
        lineCursor = result.nextLineNumber;
        rowCursor = result.nextDisplayRow;
        if (result.hunkLines) { hunkLines.push(...result.hunkLines); }
        // Fill in the filePath for all content blocks
        for (const block of result.blocks) {
            block.filePath = filePath;
        }
        blocks.push(...result.blocks);
    } else {
        const result = renderStackedDiff(config, diffResult, lineCursor, rowCursor);
        lineCursor = result.nextLineNumber;
        rowCursor = result.nextDisplayRow;
        if (result.hunkLines) { hunkLines.push(...result.hunkLines); }
        // Fill in the filePath for all content blocks
        for (const block of result.blocks) {
            block.filePath = filePath;
        }
        blocks.push(...result.blocks);
    }

    // Add spacing after file
    const divider = new TextRenderable(renderer, {
        width: "100%",
        content: "─".repeat(Math.min(getTotalWidth(), 200)),
        fg: theme.getDividerForegroundColor(),
        bg: theme.getDividerBackgroundColor(),
    });
    scrollbox.add(divider);
    // Register divider as a block too
    blocks.push({
        lineView: null,
        codeView: null,
        filePath,
        fileLineStart: null,
        renderedLines: ["─"],
        lineStart: lineCursor,
        lineCount: 1,
        displayRowStart: rowCursor,
        isDivider: true,
    });
    lineCursor += 1;
    rowCursor += 1;

    return {
        nextLineNumber: lineCursor,
        nextDisplayRow: rowCursor,
        blockStartLine: nextLineNumber,
        hunkLines,
        blocks,
    };
}

/**
 * Renders a diff header with file info and optional staging label.
 */
function renderDiffHeader(
    renderer: CliRenderer,
    scrollbox: ScrollBoxRenderable,
    filePath: string,
    status: ChangedFile["status"],
    staged: ChangedFile["staged"],
    stats: { added: number; removed: number; unchanged: number },
    _width: number,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor {
    const statusSymbol = getStatusSymbol(status);
    const statusColor = getStatusColor(status);
    const stagingLabel = staged ? ` [${staged}]` : "";
    const headerText = ` ${statusSymbol} ${filePath}${stagingLabel} `;
    const statsText = `+${stats.added} -${stats.removed}`;

    const header = new TextRenderable(renderer, {
        width: "100%",
        content: headerText,
        fg: theme.getDividerForegroundColor(),
        bg: statusColor,
        attributes: TextAttributes.BOLD,
    });

    const statsLine = new TextRenderable(renderer, {
        width: "100%",
        content: statsText,
        fg: theme.getCodeLineNumberColor(),
        bg: theme.getDividerBackgroundColor(),
        attributes: TextAttributes.DIM,
    });

    scrollbox.add(header);
    scrollbox.add(statsLine);

    return {
        nextLineNumber: nextLineNumber + 2,
        nextDisplayRow: nextDisplayRow + 2,
        blockStartLine: nextLineNumber,
        blocks: [
            {
                lineView: null,
                codeView: null,
                filePath,
                fileLineStart: null,
                renderedLines: [headerText],
                lineStart: nextLineNumber,
                lineCount: 1,
                displayRowStart: nextDisplayRow,
            },
            {
                lineView: null,
                codeView: null,
                filePath,
                fileLineStart: null,
                renderedLines: [statsText],
                lineStart: nextLineNumber + 1,
                lineCount: 1,
                displayRowStart: nextDisplayRow + 1,
            },
        ],
    };
}

/**
 * Renders a stacked (unified) diff view.
 */
function renderStackedDiff(
    config: DiffRendererConfig,
    diffResult: DiffResult,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor & { hunkLines: number[] } {
    const { renderer, scrollbox, getViewportWidth } = config;
    const contentWidth = Math.floor(getViewportWidth());

    let lineCursor = nextLineNumber;
    let rowCursor = nextDisplayRow;
    let oldLineNum = 1;
    let newLineNum = 1;
    const hunkLines: number[] = [];
    const blocks: DiffBlockRecord[] = [];

    for (const hunk of diffResult.hunks) {
        if (hunk.kind !== "equal") {
            // Record start of non-equal hunk
            hunkLines.push(lineCursor);
        }

        if (hunk.kind === "equal") {
            for (let i = 0; i < hunk.oldLines.length; i += 1) {
                const line = hunk.newLines[i] ?? hunk.oldLines[i] ?? "";
                const result = renderDiffLine(
                    renderer,
                    scrollbox,
                    line,
                    oldLineNum,
                    newLineNum,
                    "equal",
                    contentWidth,
                    lineCursor,
                    rowCursor,
                );
                lineCursor = result.nextLineNumber;
                rowCursor = result.nextDisplayRow;
                blocks.push(...result.blocks);
                oldLineNum += 1;
                newLineNum += 1;
            }
        } else if (hunk.kind === "delete") {
            for (const line of hunk.lines) {
                const result = renderDiffLine(
                    renderer,
                    scrollbox,
                    line,
                    oldLineNum,
                    null,
                    "delete",
                    contentWidth,
                    lineCursor,
                    rowCursor,
                );
                lineCursor = result.nextLineNumber;
                rowCursor = result.nextDisplayRow;
                blocks.push(...result.blocks);
                oldLineNum += 1;
            }
        } else if (hunk.kind === "insert") {
            for (const line of hunk.lines) {
                const result = renderDiffLine(
                    renderer,
                    scrollbox,
                    line,
                    null,
                    newLineNum,
                    "insert",
                    contentWidth,
                    lineCursor,
                    rowCursor,
                );
                lineCursor = result.nextLineNumber;
                rowCursor = result.nextDisplayRow;
                blocks.push(...result.blocks);
                newLineNum += 1;
            }
        }
    }

    return {
        nextLineNumber: lineCursor,
        nextDisplayRow: rowCursor,
        blockStartLine: nextLineNumber,
        hunkLines,
        blocks,
    };
}

/**
 * Renders a side-by-side diff view.
 */
function renderSideBySideDiff(
    config: DiffRendererConfig,
    diffResult: DiffResult,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor & { hunkLines: number[] } {
    const { renderer, scrollbox, getViewportWidth } = config;
    // Reserve space for gutter and padding
    const halfWidth = Math.floor((getViewportWidth() - 10) / 2);

    let lineCursor = nextLineNumber;
    let rowCursor = nextDisplayRow;
    const hunkLines: number[] = [];
    const blocks: DiffBlockRecord[] = [];

    // Interleave hunks for side-by-side display
    const paired = pairDiffHunks(diffResult.hunks);

    for (const pair of paired) {
        // Record non-unchanged pair as a hunk start
        if (pair.type !== "unchanged") {
            hunkLines.push(lineCursor);
        }

        if (pair.type === "unchanged") {
            const result = renderSideBySideUnchanged(
                renderer, scrollbox, pair.old ?? "", pair.new ?? "",
                halfWidth, lineCursor, rowCursor,
            );
            lineCursor = result.nextLineNumber;
            rowCursor = result.nextDisplayRow;
            blocks.push(...result.blocks);
        } else if (pair.type === "modified") {
            const result = renderSideBySideModified(
                renderer, scrollbox, pair.old ?? "", pair.new ?? "",
                halfWidth, lineCursor, rowCursor,
            );
            lineCursor = result.nextLineNumber;
            rowCursor = result.nextDisplayRow;
            blocks.push(...result.blocks);
        } else if (pair.type === "removed") {
            const result = renderSideBySideRemoved(
                renderer, scrollbox, pair.old ?? "",
                halfWidth, lineCursor, rowCursor,
            );
            lineCursor = result.nextLineNumber;
            rowCursor = result.nextDisplayRow;
            blocks.push(...result.blocks);
        } else if (pair.type === "added") {
            const result = renderSideBySideAdded(
                renderer, scrollbox, pair.new ?? "",
                halfWidth, lineCursor, rowCursor,
            );
            lineCursor = result.nextLineNumber;
            rowCursor = result.nextDisplayRow;
            blocks.push(...result.blocks);
        }
    }

    return {
        nextLineNumber: lineCursor,
        nextDisplayRow: rowCursor,
        blockStartLine: nextLineNumber,
        hunkLines,
        blocks,
    };
}

type PairedHunk =
    | { type: "unchanged"; old: string; new: string }
    | { type: "modified"; old: string; new: string }
    | { type: "removed"; old: string; new: null }
    | { type: "added"; old: null; new: string };

/**
 * Pairs diff hunks for side-by-side display.
 */
function pairDiffHunks(hunks: readonly DiffHunk[]): PairedHunk[] {
    const paired: PairedHunk[] = [];
    let oldIdx = 0;
    let newIdx = 0;

    for (const hunk of hunks) {
        if (hunk.kind === "equal") {
            for (let i = 0; i < hunk.oldLines.length; i += 1) {
                paired.push({
                    type: "unchanged",
                    old: hunk.oldLines[i] ?? "",
                    new: hunk.newLines[i] ?? "",
                });
                oldIdx += 1;
                newIdx += 1;
            }
        } else if (hunk.kind === "delete") {
            for (const line of hunk.lines) {
                paired.push({ type: "removed", old: line, new: null });
                oldIdx += 1;
            }
        } else if (hunk.kind === "insert") {
            for (const line of hunk.lines) {
                paired.push({ type: "added", old: null, new: line });
                newIdx += 1;
            }
        }
    }

    return paired;
}

/**
 * Renders a single diff line as a LineNumberRenderable + CodeRenderable pair.
 */
function renderDiffLine(
    renderer: CliRenderer,
    scrollbox: ScrollBoxRenderable,
    content: string,
    oldLineNum: number | null,
    newLineNum: number | null,
    changeType: "equal" | "insert" | "delete",
    _contentWidth: number,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor {
    const prefix = getDiffLinePrefix(changeType);
    let fg: string;
    if (changeType === "insert") {
        fg = theme.getAgentStatusBackgroundColor("completed");
    } else if (changeType === "delete") {
        fg = theme.getAgentStatusBackgroundColor("failed");
    } else {
        fg = theme.getDividerForegroundColor();
    }

    const lineText = prefix + content;
    const code = new CodeRenderable(renderer, {
        width: "100%",
        content: lineText,
        syntaxStyle: theme.getSyntaxStyle(),
        wrapMode: "none",
        bg: theme.getTransparentColor(),
    });
    code.selectable = false;

    const displayLineNum = oldLineNum ?? newLineNum ?? 1;
    const lineView = new LineNumberRenderable(renderer, {
        width: "auto",
        target: code,
        showLineNumbers: true,
        minWidth: LINE_NUMBER_WIDTH_BUFFER,
        paddingRight: 1,
        fg: theme.getCodeLineNumberColor(),
        bg: theme.getTransparentColor(),
        lineNumberOffset: 0,
    });
    lineView.selectable = false;

    scrollbox.add(lineView);

    return {
        nextLineNumber: nextLineNumber + 1,
        nextDisplayRow: nextDisplayRow + 1,
        blockStartLine: nextLineNumber,
        blocks: [{
            lineView,
            codeView: code,
            filePath: "", // filled in by caller
            fileLineStart: displayLineNum,
            renderedLines: [lineText],
            lineStart: nextLineNumber,
            lineCount: 1,
            displayRowStart: nextDisplayRow,
        }],
    };
}

/**
 * Renders a side-by-side unchanged line.
 */
function renderSideBySideUnchanged(
    renderer: CliRenderer,
    scrollbox: ScrollBoxRenderable,
    oldContent: string,
    newContent: string,
    halfWidth: number,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor {
    // For now, render as a simple text line with separator
    const content = `${truncate(oldContent, halfWidth - 10)} | ${truncate(newContent, halfWidth - 10)}`;
    const text = new TextRenderable(renderer, {
        width: "100%",
        content,
        fg: theme.getDividerForegroundColor(),
        bg: theme.getTransparentColor(),
    });
    text.selectable = false;
    scrollbox.add(text);

    return {
        nextLineNumber: nextLineNumber + 1,
        nextDisplayRow: nextDisplayRow + 1,
        blockStartLine: nextLineNumber,
        blocks: [{
            lineView: null,
            codeView: null,
            filePath: "",
            fileLineStart: null,
            renderedLines: [content],
            lineStart: nextLineNumber,
            lineCount: 1,
            displayRowStart: nextDisplayRow,
        }],
    };
}

/**
 * Renders a side-by-side modified line.
 */
function renderSideBySideModified(
    renderer: CliRenderer,
    scrollbox: ScrollBoxRenderable,
    oldContent: string,
    newContent: string,
    halfWidth: number,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor {
    const oldText = truncate(oldContent, halfWidth - 5);
    const newText = truncate(newContent, halfWidth - 5);

    const container = new BoxRenderable(renderer, {
        width: "100%",
        flexDirection: "row",
        flexWrap: "no-wrap",
        gap: 0,
    });

    // Left side (old)
    const leftBox = new BoxRenderable(renderer, {
        width: "50%",
        flexGrow: 0,
    });
    const leftOld = new TextRenderable(renderer, {
        width: "100%",
        content: `~ ${oldText}`,
        fg: theme.getAgentStatusBackgroundColor("failed"),
        bg: theme.getTransparentColor(),
    });
    leftOld.selectable = false;
    leftBox.add(leftOld);
    container.add(leftBox);

    // Right side (new)
    const rightBox = new BoxRenderable(renderer, {
        width: "50%",
        flexGrow: 0,
    });
    const rightNew = new TextRenderable(renderer, {
        width: "100%",
        content: `+ ${newText}`,
        fg: theme.getAgentStatusBackgroundColor("completed"),
        bg: theme.getTransparentColor(),
    });
    rightNew.selectable = false;
    rightBox.add(rightNew);
    container.add(rightBox);

    scrollbox.add(container);

    return {
        nextLineNumber: nextLineNumber + 1,
        nextDisplayRow: nextDisplayRow + 1,
        blockStartLine: nextLineNumber,
        blocks: [{
            lineView: null,
            codeView: null,
            filePath: "",
            fileLineStart: null,
            renderedLines: [`~ ${oldText} | + ${newText}`],
            lineStart: nextLineNumber,
            lineCount: 1,
            displayRowStart: nextDisplayRow,
        }],
    };
}

/**
 * Renders a side-by-side removed line.
 */
function renderSideBySideRemoved(
    renderer: CliRenderer,
    scrollbox: ScrollBoxRenderable,
    content: string,
    halfWidth: number,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor {
    const text = truncate(content, halfWidth - 5);
    const line = new TextRenderable(renderer, {
        width: "100%",
        content: `- ${text}`,
        fg: theme.getAgentStatusBackgroundColor("failed"),
        bg: theme.getTransparentColor(),
    });
    line.selectable = false;
    scrollbox.add(line);

    // Add empty placeholder on right
    const placeholder = new TextRenderable(renderer, {
        width: "100%",
        content: "",
        fg: theme.getDividerForegroundColor(),
        bg: theme.getTransparentColor(),
    });
    scrollbox.add(placeholder);

    const combined = `- ${text}`;
    return {
        nextLineNumber: nextLineNumber + 1,
        nextDisplayRow: nextDisplayRow + 1,
        blockStartLine: nextLineNumber,
        blocks: [{
            lineView: null,
            codeView: null,
            filePath: "",
            fileLineStart: null,
            renderedLines: [combined],
            lineStart: nextLineNumber,
            lineCount: 1,
            displayRowStart: nextDisplayRow,
        }],
    };
}

/**
 * Renders a side-by-side added line.
 */
function renderSideBySideAdded(
    renderer: CliRenderer,
    scrollbox: ScrollBoxRenderable,
    content: string,
    halfWidth: number,
    nextLineNumber: number,
    nextDisplayRow: number,
): DiffRenderCursor {
    // Add empty placeholder on left
    const placeholder = new TextRenderable(renderer, {
        width: "100%",
        content: "",
        fg: theme.getDividerForegroundColor(),
        bg: theme.getTransparentColor(),
    });
    scrollbox.add(placeholder);

    const text = truncate(content, halfWidth - 5);
    const line = new TextRenderable(renderer, {
        width: "100%",
        content: `+ ${text}`,
        fg: theme.getAgentStatusBackgroundColor("completed"),
        bg: theme.getTransparentColor(),
    });
    line.selectable = false;
    scrollbox.add(line);

    const combined = `+ ${text}`;
    return {
        nextLineNumber: nextLineNumber + 1,
        nextDisplayRow: nextDisplayRow + 1,
        blockStartLine: nextLineNumber,
        blocks: [{
            lineView: null,
            codeView: null,
            filePath: "",
            fileLineStart: null,
            renderedLines: [combined],
            lineStart: nextLineNumber,
            lineCount: 1,
            displayRowStart: nextDisplayRow,
        }],
    };
}

/** Creates a diff result for untracked files (all added). */
function createUntrackedDiff(content: string): DiffResult {
    const lines = content.split("\n");
    return {
        hunks: [{ kind: "insert", lines }],
        oldLineCount: 0,
        newLineCount: lines.length,
    };
}

/** Gets the status symbol for a file status. */
function getStatusSymbol(status: ChangedFile["status"]): string {
    switch (status) {
        case "modified": return "M";
        case "added": return "A";
        case "deleted": return "D";
        case "renamed": return "R";
        case "untracked": return "?";
    }
}

/** Gets the status color for a file status. */
function getStatusColor(status: ChangedFile["status"]): string {
    switch (status) {
        case "modified": return theme.getAgentStatusBackgroundColor("running");
        case "added": return theme.getAgentStatusBackgroundColor("completed");
        case "deleted": return theme.getAgentStatusBackgroundColor("failed");
        case "renamed": return theme.getAgentStatusBackgroundColor("running");
        case "untracked": return theme.getAgentStatusBackgroundColor("draft");
    }
}

/** Gets the prefix character for a diff line. */
function getDiffLinePrefix(changeType: "equal" | "insert" | "delete"): string {
    if (changeType === "insert") { return "+"; }
    if (changeType === "delete") { return "-"; }
    return " ";
}

/** Truncates text to fit within width. */
function truncate(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) { return text; }
    return text.slice(0, Math.max(0, maxWidth - 3)) + "...";
}