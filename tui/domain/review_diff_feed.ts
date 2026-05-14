/**
 * Review Diff Feed domain model: turns current VCS diff data into a single
 * navigable feed of files, hunks, lines, and inline agent run anchors.
 */
import type { ChangedFile, DiffInfo } from "../integrations/version_control/interface";
import { diffLines } from "../utils/diff";

export type ReviewFeedRowKind =
  | "file"
  | "hunk"
  | "context"
  | "insert"
  | "delete"
  | "agent"
  | "empty";

export type ReviewLineRole = "new" | "old" | "meta";

export type ReviewFeedRow = {
  readonly id: string;
  readonly kind: ReviewFeedRowKind;
  readonly filePath: string | null;
  readonly hunkId: string | null;
  readonly oldLine: number | null;
  readonly newLine: number | null;
  readonly selectable: boolean;
  readonly text: string;
  readonly role: ReviewLineRole;
  readonly runId?: string;
};

export type ReviewHunk = {
  readonly id: string;
  readonly filePath: string;
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly oldStart: number;
  readonly newStart: number;
  readonly oldLineCount: number;
  readonly newLineCount: number;
  readonly summary: string;
};

export type ReviewSelection = {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly selectedText: string;
  readonly diffText: string;
  readonly hunkId: string | null;
};

export type AgentRunFeedItem = {
  readonly id: string;
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly agent: string;
  readonly model: string;
  readonly status: "running" | "completed" | "failed" | "stopped";
  readonly title: string;
  readonly lines: readonly string[];
};

export type ReviewDiffFeed = {
  readonly vcsType: DiffInfo["vcsType"];
  readonly root: string;
  readonly rows: readonly ReviewFeedRow[];
  readonly hunks: readonly ReviewHunk[];
};

type MutableHunk = {
  id: string;
  filePath: string;
  rowStart: number;
  rowEnd: number;
  oldStart: number;
  newStart: number;
  oldLineCount: number;
  newLineCount: number;
  summary: string;
};

type LineAccumulator = {
  oldLine: number;
  newLine: number;
  rowIndex: number;
};

type PendingContextLine = {
  readonly oldLine: number;
  readonly newLine: number;
  readonly text: string;
};

const CONTEXT_LINE_COUNT = 3;

/**
 * Builds the Review Diff Feed from current VCS diff info and active agent runs.
 * @param diffInfo - Current VCS diff snapshot
 * @param agentRuns - Inline run widgets to reanchor into the feed
 * @returns A complete Review Diff Feed
 */
export function buildReviewDiffFeed(
    diffInfo: DiffInfo,
    agentRuns: readonly AgentRunFeedItem[] = [],
): ReviewDiffFeed {
    const rows: ReviewFeedRow[] = [];
    const hunks: ReviewHunk[] = [];

    if (diffInfo.vcsType === "none") {
        return emptyFeed(diffInfo, "No Git/JJ repository detected.");
    }

    if (diffInfo.changedFiles.length === 0) {
        return emptyFeed(diffInfo, "No workspace changes.");
    }

    for (const file of diffInfo.changedFiles) {
        appendFileRows(rows, hunks, file, agentRuns);
    }

    return {
        vcsType: diffInfo.vcsType,
        root: diffInfo.root,
        rows,
        hunks,
    };
}

/**
 * Resolves a Review Selection from one or two feed row indexes.
 * @param feed - Review Diff Feed to inspect
 * @param anchorRow - First selected row index
 * @param cursorRow - Last selected row index
 * @returns A complete Review Selection or null when no code row is selected
 */
export function resolveReviewSelection(
    feed: ReviewDiffFeed,
    anchorRow: number,
    cursorRow: number,
): ReviewSelection | null {
    const first = Math.max(0, Math.min(anchorRow, cursorRow));
    const last = Math.min(feed.rows.length - 1, Math.max(anchorRow, cursorRow));
    const selectedRows = feed.rows.slice(first, last + 1).filter(isSelectableCodeRow);

    if (selectedRows.length === 0) {
        return resolveNearestHunkSelection(feed, cursorRow);
    }

    const filePath = selectedRows[0]?.filePath;
    if (!filePath) { return null; }

    const sameFileRows = selectedRows.filter((row) => row.filePath === filePath);
    const lineNumbers = sameFileRows.map(resolvePromptLineNumber).filter(isNumber);
    if (lineNumbers.length === 0) { return null; }

    const startLine = Math.min(...lineNumbers);
    const endLine = Math.max(...lineNumbers);
    const diffRows = feed.rows.filter((row) => row.filePath === filePath && row.hunkId === (sameFileRows[0]?.hunkId ?? null));

    return {
        filePath,
        startLine,
        endLine,
        rowStart: first,
        rowEnd: last,
        selectedText: sameFileRows.map((row) => stripDiffPrefix(row.text)).join("\n"),
        diffText: diffRows.map((row) => row.text).join("\n"),
        hunkId: sameFileRows[0]?.hunkId ?? null,
    };
}

/**
 * Finds the next hunk row from a starting row.
 * @param feed - Review Diff Feed to search
 * @param fromRow - Starting row index
 * @param delta - Search direction, positive or negative
 * @returns Row index for the next hunk, or the original row when none exists
 */
export function findNextHunkRow(feed: ReviewDiffFeed, fromRow: number, delta: number): number {
    if (feed.hunks.length === 0) { return fromRow; }
    const hunkRows = feed.hunks.map((hunk) => hunk.rowStart);
    if (delta > 0) {
        for (const row of hunkRows) {
            if (row > fromRow) { return row; }
        }
        return hunkRows[0] ?? fromRow;
    }

    for (const row of [...hunkRows].reverse()) {
        if (row < fromRow) { return row; }
    }
    return hunkRows[hunkRows.length - 1] ?? fromRow;
}

/**
 * Returns the nearest selectable row to keep the cursor on code-like content.
 * @param feed - Review Diff Feed to inspect
 * @param preferredRow - Desired row index
 * @returns A bounded selectable row index
 */
export function nearestSelectableRow(feed: ReviewDiffFeed, preferredRow: number): number {
    if (feed.rows.length === 0) { return 0; }
    const bounded = Math.max(0, Math.min(preferredRow, feed.rows.length - 1));
    if (feed.rows[bounded]?.selectable) { return bounded; }

    for (let distance = 1; distance < feed.rows.length; distance += 1) {
        const down = bounded + distance;
        if (down < feed.rows.length && feed.rows[down]?.selectable) { return down; }
        const up = bounded - distance;
        if (up >= 0 && feed.rows[up]?.selectable) { return up; }
    }

    return bounded;
}

/**
 * Returns whether a row participates in Review Selection creation.
 * @param row - Feed row to inspect
 * @returns True when the row maps to code/diff content
 */
export function isSelectableCodeRow(row: ReviewFeedRow): boolean {
    return row.selectable && row.filePath !== null && (row.newLine !== null || row.oldLine !== null);
}

/** Creates an empty Review Diff Feed with a single explanatory row. */
function emptyFeed(diffInfo: DiffInfo, message: string): ReviewDiffFeed {
    return {
        vcsType: diffInfo.vcsType,
        root: diffInfo.root,
        rows: [{
            id: "empty:0",
            kind: "empty",
            filePath: null,
            hunkId: null,
            oldLine: null,
            newLine: null,
            selectable: false,
            text: message,
            role: "meta",
        }],
        hunks: [],
    };
}

/** Appends all feed rows for one changed file. */
function appendFileRows(
    rows: ReviewFeedRow[],
    hunks: ReviewHunk[],
    file: ChangedFile,
    agentRuns: readonly AgentRunFeedItem[],
): void {
    const fileIndex = rows.length;
    rows.push({
        id: `file:${file.relativePath}:${fileIndex}`,
        kind: "file",
        filePath: file.relativePath,
        hunkId: null,
        oldLine: null,
        newLine: null,
        selectable: false,
        text: fileHeaderText(file),
        role: "meta",
    });

    const accumulator: LineAccumulator = {
        oldLine: 1,
        newLine: 1,
        rowIndex: rows.length,
    };
    let activeHunk: MutableHunk | null = null;
    let pendingContext: PendingContextLine[] = [];
    const diff = file.status === "untracked"
        ? diffLines("", file.newContent)
        : diffLines(file.oldContent, file.newContent);

    for (const diffHunk of diff.hunks) {
        if (diffHunk.kind === "equal") {
            const contextLines = captureContextLines(diffHunk.newLines, accumulator);
            if (!activeHunk) {
                pendingContext = contextLines.slice(-CONTEXT_LINE_COUNT);
                continue;
            }

            if (contextLines.length <= CONTEXT_LINE_COUNT * 2) {
                for (const line of contextLines) {
                    appendKnownLineRow(rows, file.relativePath, activeHunk.id, "context", line, " ");
                }
                continue;
            }

            for (const line of contextLines.slice(0, CONTEXT_LINE_COUNT)) {
                appendKnownLineRow(rows, file.relativePath, activeHunk.id, "context", line, " ");
            }
            activeHunk = closeActiveHunk(activeHunk, hunks, rows.length - 1);
            pendingContext = contextLines.slice(-CONTEXT_LINE_COUNT);
            continue;
        }

        if (!activeHunk) {
            activeHunk = openHunk(file.relativePath, accumulator, hunks.length, pendingContext[0]);
            rows.push(createHunkHeaderRow(activeHunk));
            for (const line of pendingContext) {
                appendKnownLineRow(rows, file.relativePath, activeHunk.id, "context", line, " ");
            }
            pendingContext = [];
        }

        if (diffHunk.kind === "delete") {
            for (const line of diffHunk.lines) {
                appendLineRow(rows, file.relativePath, activeHunk.id, accumulator, "delete", line, "-");
                activeHunk.oldLineCount += 1;
                accumulator.oldLine += 1;
            }
            continue;
        }

        for (const line of diffHunk.lines) {
            appendLineRow(rows, file.relativePath, activeHunk.id, accumulator, "insert", line, "+");
            activeHunk.newLineCount += 1;
            accumulator.newLine += 1;
        }
    }

    activeHunk = closeActiveHunk(activeHunk, hunks, rows.length - 1);
    appendAnchoredRuns(rows, file.relativePath, agentRuns);
    rows.push({
        id: `space:${file.relativePath}:${rows.length}`,
        kind: "empty",
        filePath: file.relativePath,
        hunkId: null,
        oldLine: null,
        newLine: null,
        selectable: false,
        text: "",
        role: "meta",
    });
    activeHunk = null;
}

/** Creates a readable file header for the Review Diff Feed. */
function fileHeaderText(file: ChangedFile): string {
    const staged = file.staged ? ` [${file.staged}]` : "";
    return `▸ ${file.status.toUpperCase()}${staged} ${file.relativePath}`;
}

/** Captures equal lines as context while advancing source line counters. */
function captureContextLines(lines: readonly string[], accumulator: LineAccumulator): PendingContextLine[] {
    const captured: PendingContextLine[] = [];
    for (const line of lines) {
        captured.push({
            oldLine: accumulator.oldLine,
            newLine: accumulator.newLine,
            text: line,
        });
        accumulator.oldLine += 1;
        accumulator.newLine += 1;
    }
    return captured;
}

/** Opens a mutable hunk while rendering changed rows. */
function openHunk(
    filePath: string,
    accumulator: LineAccumulator,
    hunkCount: number,
    firstContextLine?: PendingContextLine,
): MutableHunk {
    const id = `hunk:${filePath}:${hunkCount}`;
    return {
        id,
        filePath,
        rowStart: accumulator.rowIndex,
        rowEnd: accumulator.rowIndex,
        oldStart: firstContextLine?.oldLine ?? accumulator.oldLine,
        newStart: firstContextLine?.newLine ?? accumulator.newLine,
        oldLineCount: 0,
        newLineCount: 0,
        summary: "",
    };
}

/** Creates a hunk header row. */
function createHunkHeaderRow(hunk: MutableHunk): ReviewFeedRow {
    return {
        id: `${hunk.id}:header`,
        kind: "hunk",
        filePath: hunk.filePath,
        hunkId: hunk.id,
        oldLine: null,
        newLine: null,
        selectable: true,
        text: `@@ -${hunk.oldStart} +${hunk.newStart} @@`,
        role: "meta",
    };
}

/** Finalizes an open hunk and stores its immutable record. */
function closeActiveHunk(
    activeHunk: MutableHunk | null,
    hunks: ReviewHunk[],
    rowEnd: number,
): MutableHunk | null {
    if (!activeHunk) { return null; }
    activeHunk.rowEnd = rowEnd;
    activeHunk.summary = summarizeHunk(activeHunk);
    hunks.push({ ...activeHunk });
    return null;
}

/** Produces a compact hunk summary. */
function summarizeHunk(hunk: MutableHunk): string {
    return `-${hunk.oldLineCount} +${hunk.newLineCount}`;
}

/** Appends one code-like row to the feed. */
function appendLineRow(
    rows: ReviewFeedRow[],
    filePath: string,
    hunkId: string | null,
    accumulator: LineAccumulator,
    kind: "context" | "insert" | "delete",
    line: string,
    prefix: " " | "+" | "-",
): void {
    const oldLine = kind === "insert" ? null : accumulator.oldLine;
    const newLine = kind === "delete" ? null : accumulator.newLine;
    const oldLabel = oldLine === null ? "    " : oldLine.toString().padStart(4, " ");
    const newLabel = newLine === null ? "    " : newLine.toString().padStart(4, " ");
    rows.push({
        id: `line:${filePath}:${rows.length}`,
        kind,
        filePath,
        hunkId,
        oldLine,
        newLine,
        selectable: true,
        text: `${oldLabel} ${newLabel} ${prefix}${line}`,
        role: kind === "delete" ? "old" : "new",
    });
    accumulator.rowIndex = rows.length;
}

/** Appends a context row whose source line numbers were captured earlier. */
function appendKnownLineRow(
    rows: ReviewFeedRow[],
    filePath: string,
    hunkId: string,
    kind: "context",
    line: PendingContextLine,
    prefix: " ",
): void {
    const oldLabel = line.oldLine.toString().padStart(4, " ");
    const newLabel = line.newLine.toString().padStart(4, " ");
    rows.push({
        id: `line:${filePath}:${rows.length}`,
        kind,
        filePath,
        hunkId,
        oldLine: line.oldLine,
        newLine: line.newLine,
        selectable: true,
        text: `${oldLabel} ${newLabel} ${prefix}${line.text}`,
        role: "new",
    });
}

/** Appends inline agent run widgets after a file's diff rows. */
function appendAnchoredRuns(
    rows: ReviewFeedRow[],
    filePath: string,
    agentRuns: readonly AgentRunFeedItem[],
): void {
    const runsForFile = agentRuns.filter((run) => run.filePath === filePath);
    for (const run of runsForFile) {
        rows.push({
            id: `agent:${run.id}:title`,
            kind: "agent",
            filePath,
            hunkId: null,
            oldLine: null,
            newLine: run.startLine,
            selectable: false,
            text: `  ◌ ${run.agent} ${run.status} ${run.title} (${run.model})`,
            role: "meta",
            runId: run.id,
        });
        for (const line of run.lines.slice(-8)) {
            rows.push({
                id: `agent:${run.id}:${rows.length}`,
                kind: "agent",
                filePath,
                hunkId: null,
                oldLine: null,
                newLine: run.startLine,
                selectable: false,
                text: `    ${line}`,
                role: "meta",
                runId: run.id,
            });
        }
    }
}

/** Resolves the nearest hunk into a Review Selection. */
function resolveNearestHunkSelection(feed: ReviewDiffFeed, cursorRow: number): ReviewSelection | null {
    const row = feed.rows[Math.max(0, Math.min(cursorRow, feed.rows.length - 1))];
    if (!row?.hunkId) { return null; }
    const hunk = feed.hunks.find((entry) => entry.id === row.hunkId);
    if (!hunk) { return null; }
    const hunkRows = feed.rows.slice(hunk.rowStart, hunk.rowEnd + 1).filter(isSelectableCodeRow);
    const lineNumbers = hunkRows.map(resolvePromptLineNumber).filter(isNumber);
    if (lineNumbers.length === 0) { return null; }
    return {
        filePath: hunk.filePath,
        startLine: Math.min(...lineNumbers),
        endLine: Math.max(...lineNumbers),
        rowStart: hunk.rowStart,
        rowEnd: hunk.rowEnd,
        selectedText: hunkRows.map((entry) => stripDiffPrefix(entry.text)).join("\n"),
        diffText: feed.rows.slice(hunk.rowStart, hunk.rowEnd + 1).map((entry) => entry.text).join("\n"),
        hunkId: hunk.id,
    };
}

/** Resolves the prompt-facing line number for a row. */
function resolvePromptLineNumber(row: ReviewFeedRow): number | null {
    return row.newLine ?? row.oldLine;
}

/** Returns whether a value is a number. */
function isNumber(value: number | null): value is number {
    return typeof value === "number";
}

/** Removes line-number/diff prefix from rendered row text. */
function stripDiffPrefix(text: string): string {
    return text.replace(/^.{11}/, "");
}
