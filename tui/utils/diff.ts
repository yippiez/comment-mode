/**
 * Text diffing utilities: computes line-level and word-level diffs between
 * two strings and returns structured hunks for rendering.
 */

/** A contiguous region of unchanged text. */
export interface DiffEqual {
    readonly kind: "equal";
    readonly oldLines: readonly string[];
    readonly newLines: readonly string[];
}

/** A region of added lines (only present in new text). */
export interface DiffInsert {
    readonly kind: "insert";
    readonly lines: readonly string[];
}

/** A region of removed lines (only present in old text). */
export interface DiffDelete {
    readonly kind: "delete";
    readonly lines: readonly string[];
}

/** Union of all possible diff hunk types. */
export type DiffHunk = DiffEqual | DiffInsert | DiffDelete;

/** A complete diff result with all hunks and metadata. */
export interface DiffResult {
    readonly hunks: readonly DiffHunk[];
    readonly oldLineCount: number;
    readonly newLineCount: number;
}

/** Single character-level diff operation for word splitting. */
interface CharDiffOp {
    readonly op: -1 | 0 | 1;
    readonly text: string;
}

/** Myers diff algorithm implementation for line-by-line comparison.
 * @param oldText - The original text
 * @param newText - The modified text
 * @returns Complete diff result with hunks
 * @example
 * const diff = diffLines("hello\nworld", "hello\nworld\n!");
 * diff.hunks // [{ kind: "equal", ... }, { kind: "insert", ... }]
 */
export function diffLines(oldText: string, newText: string): DiffResult {
    const oldLines = splitLines(oldText);
    const newLines = splitLines(newText);
    return computeLineDiff(oldLines, newLines);
}

/** Splits text into lines, preserving empty lines correctly.
 * @param text - Input text
 * @returns Array of lines
 */
function splitLines(text: string): string[] {
    if (text === "") { return []; }
    return text.split("\n");
}

/** Computes the line-level diff using Myers algorithm.
 * @param oldLines - Original lines
 * @param newLines - Modified lines
 * @returns Complete diff result
 */
function computeLineDiff(oldLines: readonly string[], newLines: readonly string[]): DiffResult {
    const n = oldLines.length;
    const m = newLines.length;
    const max = n + m;

    if (max === 0) {
        return {
            hunks: [],
            oldLineCount: 0,
            newLineCount: 0,
        };
    }

    // Build the shortest edit script (SES) using dynamic programming
    const v = new Map<number, number>();
    v.set(1, 0);

    const trace: Map<number, number>[] = [];
    let found = false;

    outer:
    for (let d = 0; d <= max; d += 1) {
        trace.push(new Map(v));
        for (let k = -d; k <= d; k += 2) {
            let x: number;
            if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
                x = v.get(k + 1) ?? 0;
            } else {
                x = (v.get(k - 1) ?? 0) + 1;
            }
            let y = x - k;

            while (x < n && y < m && oldLines[x] === newLines[y]) {
                x += 1;
                y += 1;
            }

            v.set(k, x);

            if (x >= n && y >= m) {
                found = true;
                break outer;
            }
        }
    }

    // Backtrack to find the edit script
    const d = trace.length - 1;
    if (d < 0) {
        return {
            hunks: [],
            oldLineCount: n,
            newLineCount: m,
        };
    }
    const edits = backtrack(trace, n, m, d);

    // Convert edits to hunks
    const hunks = buildHunks(edits, oldLines, newLines);

    return {
        hunks,
        oldLineCount: n,
        newLineCount: m,
    };
}

/** Backtracks through the trace to find the edit script.
 * @param trace - The trace of v states
 * @param n - Number of old lines
 * @param m - Number of new lines
 * @param d - Maximum edit distance
 * @returns Array of edit operations (-1=delete, 0=equal, 1=insert)
 */
function backtrack(trace: Map<number, number>[], n: number, m: number, d: number): readonly (-1 | 0 | 1)[] {
    const edits: (-1 | 0 | 1)[] = [];
    let x = n;
    let y = m;

    for (let i = d; i >= 0; i -= 1) {
        const v = trace[i]!;
        const k = x - y;

        let prevK: number;
        if (k === -i || (k !== i && ((v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0)))) {
            prevK = k + 1;
        } else {
            prevK = k - 1;
        }

        const prevX = v.get(prevK) ?? 0;
        const prevY = prevX - prevK;

        while (x > prevX && y > prevY) {
            edits.unshift(0);
            x -= 1;
            y -= 1;
        }

        if (i > 0) {
            if (x === prevX) {
                edits.unshift(1);
                y -= 1;
            } else {
                edits.unshift(-1);
                x -= 1;
            }
        }
    }

    return edits;
}

/** Builds diff hunks from edit operations.
 * Groups consecutive same-type edits into hunks.
 * @param edits - Array of edit operations
 * @param oldLines - Original lines
 * @param newLines - Modified lines
 * @returns Array of diff hunks
 */
function buildHunks(
    edits: readonly (-1 | 0 | 1)[],
    oldLines: readonly string[],
    newLines: readonly string[],
): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    let oldIdx = 0;
    let newIdx = 0;
    let i = 0;

    while (i < edits.length) {
        if (edits[i] === 0) {
            let runLen = 0;
            while (i + runLen < edits.length && edits[i + runLen] === 0) {
                runLen += 1;
            }
            hunks.push({
                kind: "equal",
                oldLines: oldLines.slice(oldIdx, oldIdx + runLen),
                newLines: newLines.slice(newIdx, newIdx + runLen),
            });
            oldIdx += runLen;
            newIdx += runLen;
            i += runLen;
        } else if (edits[i] === -1) {
            let runLen = 0;
            while (i + runLen < edits.length && edits[i + runLen] === -1) {
                runLen += 1;
            }
            hunks.push({
                kind: "delete",
                lines: oldLines.slice(oldIdx, oldIdx + runLen),
            });
            oldIdx += runLen;
            i += runLen;
        } else {
            let runLen = 0;
            while (i + runLen < edits.length && edits[i + runLen] === 1) {
                runLen += 1;
            }
            hunks.push({
                kind: "insert",
                lines: newLines.slice(newIdx, newIdx + runLen),
            });
            newIdx += runLen;
            i += runLen;
        }
    }

    return hunks;
}

/** Builds a single hunk from edit operations.
 * @param edits - Edit operations for this hunk
 * @param oldLines - Original lines
 * @param newLines - Modified lines
 * @param oldStart - Starting index in old lines
 * @param newStart - Starting index in new lines
 * @returns A single diff hunk
 */
function buildSingleHunk(
    edits: readonly (-1 | 0 | 1)[],
    oldLines: readonly string[],
    newLines: readonly string[],
    oldStart: number,
    newStart: number,
): DiffHunk {
    const oldHunkLines: string[] = [];
    const newHunkLines: string[] = [];

    let oldIdx = oldStart;
    let newIdx = newStart;

    for (const op of edits) {
        if (op === 0) {
            oldHunkLines.push(oldLines[oldIdx] ?? "");
            newHunkLines.push(newLines[newIdx] ?? "");
            oldIdx += 1;
            newIdx += 1;
        } else if (op === -1) {
            oldHunkLines.push(oldLines[oldIdx] ?? "");
            oldIdx += 1;
        } else {
            newHunkLines.push(newLines[newIdx] ?? "");
            newIdx += 1;
        }
    }

    // Check if any non-equal operations exist
    const hasNonEqualOps = edits.some((op) => op !== 0);

    if (!hasNonEqualOps) {
        return {
            kind: "equal",
            oldLines: oldHunkLines,
            newLines: newHunkLines,
        };
    }

    const hasDeletions = edits.some((op) => op === -1);
    const hasInsertions = edits.some((op) => op === 1);

    if (!hasDeletions) {
        return {
            kind: "insert",
            lines: newHunkLines,
        };
    }

    if (!hasInsertions) {
        return {
            kind: "delete",
            lines: oldHunkLines,
        };
    }

    // Mixed hunk - split into consecutive groups of same operation type
    const resultHunks: DiffHunk[] = [];
    let editIdx = 0;
    let localOldIdx = oldStart;
    let localNewIdx = newStart;

    while (editIdx < edits.length) {
        if (edits[editIdx] === 0) {
            let runLen = 0;
            while (editIdx + runLen < edits.length && edits[editIdx + runLen] === 0) {
                runLen += 1;
            }
            resultHunks.push({
                kind: "equal",
                oldLines: oldLines.slice(localOldIdx, localOldIdx + runLen),
                newLines: newLines.slice(localNewIdx, localNewIdx + runLen),
            });
            localOldIdx += runLen;
            localNewIdx += runLen;
            editIdx += runLen;
        } else if (edits[editIdx] === -1) {
            let runLen = 0;
            while (editIdx + runLen < edits.length && edits[editIdx + runLen] === -1) {
                runLen += 1;
            }
            resultHunks.push({
                kind: "delete",
                lines: oldLines.slice(localOldIdx, localOldIdx + runLen),
            });
            localOldIdx += runLen;
            editIdx += runLen;
        } else {
            let runLen = 0;
            while (editIdx + runLen < edits.length && edits[editIdx + runLen] === 1) {
                runLen += 1;
            }
            resultHunks.push({
                kind: "insert",
                lines: newLines.slice(localNewIdx, localNewIdx + runLen),
            });
            localNewIdx += runLen;
            editIdx += runLen;
        }
    }

    // If all one type, return as single hunk
    if (resultHunks.length === 1) {
        return resultHunks[0]!;
    }

    // Otherwise return them as a combined equal hunk (callers should split properly)
    // We merge back into the original format for simple cases
    return mergeHunks(resultHunks);
}

/** Merges consecutive hunks of the same type.
 * @param hunks - Array of hunks to merge
 * @returns Merged hunk (equal, insert, or combined)
 */
function mergeHunks(hunks: DiffHunk[]): DiffHunk {
    if (hunks.length === 0) {
        return { kind: "equal", oldLines: [], newLines: [] };
    }

    if (hunks.length === 1) {
        return hunks[0]!;
    }

    // Check if all hunks are of the same kind and can be merged
    const allEqual = hunks.every((h) => h.kind === "equal");
    const allInsert = hunks.every((h) => h.kind === "insert");
    const allDelete = hunks.every((h) => h.kind === "delete");

    if (allEqual) {
        const allOld = hunks.flatMap((h) => (h as DiffEqual).oldLines);
        const allNew = hunks.flatMap((h) => (h as DiffEqual).newLines);
        return { kind: "equal", oldLines: allOld, newLines: allNew };
    }

    if (allInsert) {
        const allLines = hunks.flatMap((h) => (h as DiffInsert).lines);
        return { kind: "insert", lines: allLines };
    }

    if (allDelete) {
        const allLines = hunks.flatMap((h) => (h as DiffDelete).lines);
        return { kind: "delete", lines: allLines };
    }

    // Mixed - return as combined (we'll render them separately in UI)
    const mergedOld: string[] = [];
    const mergedNew: string[] = [];
    for (const h of hunks) {
        if (h.kind === "equal") {
            mergedOld.push(...h.oldLines);
            mergedNew.push(...h.newLines);
        } else if (h.kind === "delete") {
            mergedOld.push(...h.lines);
        } else if (h.kind === "insert") {
            mergedNew.push(...h.lines);
        }
    }
    return { kind: "equal", oldLines: mergedOld, newLines: mergedNew };
}

/** Splits text into words for word-level diff.
 * @param text - Input text
 * @returns Array of words
 */
function splitWords(text: string): string[] {
    return text.split(/(\s+)/).filter((s) => s.length > 0);
}

/** Computes a word-level diff for inline display.
 * @param oldLine - Original line
 * @param newLine - Modified line
 * @returns Array of character diff operations for rendering
 * @example
 * const words = diffWordsInLine("hello world", "hello beautiful world");
 * // Returns marked up string with + and - for insertions/deletions
 */
export interface WordDiff {
    readonly type: "equal" | "insert" | "delete";
    readonly text: string;
}

export function diffWordsInLine(oldLine: string, newLine: string): WordDiff[] {
    const oldWords = splitWords(oldLine);
    const newWords = splitWords(newLine);

    if (oldWords.length === 0 && newWords.length === 0) {
        return [];
    }

    const edits = computeWordEditScript(oldWords, newWords);
    const result: WordDiff[] = [];
    let oldIdx = 0;
    let newIdx = 0;

    for (const op of edits) {
        if (op === 0) {
            result.push({ type: "equal", text: oldWords[oldIdx] ?? newWords[newIdx] ?? "" });
            oldIdx += 1;
            newIdx += 1;
        } else if (op === -1) {
            result.push({ type: "delete", text: oldWords[oldIdx] ?? "" });
            oldIdx += 1;
        } else {
            result.push({ type: "insert", text: newWords[newIdx] ?? "" });
            newIdx += 1;
        }
    }

    return result;
}

/** Simple LCS-based word diff for smaller inputs.
 * @param oldWords - Old words
 * @param newWords - New words
 * @returns Edit operations
 */
function computeWordEditScript(oldWords: readonly string[], newWords: readonly string[]): readonly (-1 | 0 | 1)[] {
    const n = oldWords.length;
    const m = newWords.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

    for (let i = 1; i <= n; i += 1) {
        for (let j = 1; j <= m; j += 1) {
            if (oldWords[i - 1] === newWords[j - 1]) {
                dp[i]![j] = dp[i - 1]![j - 1]! + 1;
            } else {
                dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
            }
        }
    }

    // Backtrack
    const edits: (-1 | 0 | 1)[] = [];
    let i = n;
    let j = m;

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
            edits.unshift(0);
            i -= 1;
            j -= 1;
        } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
            edits.unshift(1);
            j -= 1;
        } else {
            edits.unshift(-1);
            i -= 1;
        }
    }

    return edits;
}

/** Returns statistics about a diff for summary display.
 * @param result - The diff result
 * @returns Object with added, removed, and unchanged line counts
 * @example
 * const stats = getDiffStats(diffLines("a\nb", "a\nc"));
 * stats.added   // 1
 * stats.removed // 1
 * stats.unchanged // 1
 */
export function getDiffStats(result: DiffResult): { added: number; removed: number; unchanged: number } {
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    for (const hunk of result.hunks) {
        if (hunk.kind === "insert") {
            added += hunk.lines.length;
        } else if (hunk.kind === "delete") {
            removed += hunk.lines.length;
        } else {
            unchanged += hunk.oldLines.length;
        }
    }

    return { added, removed, unchanged };
}