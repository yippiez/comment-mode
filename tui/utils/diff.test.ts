/**
 * Tests for the Myers diff algorithm and related utilities.
 */
import { describe, test, expect } from "bun:test";
import {
    diffLines,
    diffWordsInLine,
    getDiffStats,
} from "./diff";

describe("diffLines", () => {
    test("returns empty hunks for identical empty text", () => {
        const result = diffLines("", "");
        expect(result.hunks).toEqual([]);
        expect(result.oldLineCount).toBe(0);
        expect(result.newLineCount).toBe(0);
    });

    test("returns equal for identical single-line text", () => {
        const result = diffLines("hello", "hello");
        expect(result.hunks.length).toBe(1);
        expect(result.hunks[0]!.kind).toBe("equal");
    });

    test("returns equal for identical multi-line text", () => {
        const result = diffLines("a\nb\nc", "a\nb\nc");
        expect(result.hunks.length).toBe(1);
        expect(result.hunks[0]!.kind).toBe("equal");
        expect((result.hunks[0] as { kind: string; oldLines?: string[] }).oldLines).toEqual(["a", "b", "c"]);
    });

    test("detects single line insertion at end", () => {
        const result = diffLines("a", "a\nb");
        expect(result.hunks.length).toBeGreaterThan(0);
        const hasInsert = result.hunks.some((h) => h.kind === "insert");
        expect(hasInsert).toBe(true);
    });

    test("detects single line deletion", () => {
        const result = diffLines("a\nb", "a");
        const hasDelete = result.hunks.some((h) => h.kind === "delete");
        expect(hasDelete).toBe(true);
    });

    test("handles line modification", () => {
        const result = diffLines("hello world", "hello there");
        // Should produce a delete + insert hunk
        const kinds = result.hunks.map((h) => h.kind);
        expect(kinds).toContain("delete");
        expect(kinds).toContain("insert");
    });

    test("handles empty old text (all insert)", () => {
        const result = diffLines("", "a\nb\nc");
        expect(result.oldLineCount).toBe(0);
        expect(result.newLineCount).toBe(3);
        const hasInsert = result.hunks.some(
            (h) => h.kind === "insert" && h.lines.length === 3,
        );
        expect(hasInsert).toBe(true);
    });

    test("handles empty new text (all delete)", () => {
        const result = diffLines("a\nb\nc", "");
        expect(result.oldLineCount).toBe(3);
        expect(result.newLineCount).toBe(0);
        const hasDelete = result.hunks.some(
            (h) => h.kind === "delete" && h.lines.length === 3,
        );
        expect(hasDelete).toBe(true);
    });

    test("preserves trailing empty lines", () => {
        const result = diffLines("a\n\n", "a\nb\n");
        expect(result.hunks.length).toBeGreaterThan(0);
    });

    test("handles multiple changes interleaved with equal lines", () => {
        const result = diffLines(
            "line1\nline2\nline3\nline4",
            "line1\nmodified\nline3\nadded\nline4",
        );
        expect(result.hunks.length).toBeGreaterThan(1);
    });
});

describe("diffWordsInLine", () => {
    test("returns equal for identical words", () => {
        const result = diffWordsInLine("hello world", "hello world");
        expect(result.every((w) => w.type === "equal")).toBe(true);
    });

    test("detects word insertion", () => {
        const result = diffWordsInLine("hello", "hello world");
        const hasInsert = result.some((w) => w.type === "insert");
        expect(hasInsert).toBe(true);
    });

    test("detects word deletion", () => {
        const result = diffWordsInLine("hello world", "hello");
        const hasDelete = result.some((w) => w.type === "delete");
        expect(hasDelete).toBe(true);
    });

    test("detects word modification", () => {
        const result = diffWordsInLine("hello world", "hello there");
        const hasDelete = result.some((w) => w.type === "delete" && w.text === "world");
        const hasInsert = result.some((w) => w.type === "insert" && w.text === "there");
        expect(hasDelete).toBe(true);
        expect(hasInsert).toBe(true);
    });

    test("handles empty strings", () => {
        const result = diffWordsInLine("", "");
        expect(result).toEqual([]);
    });

    test("handles empty old line", () => {
        const result = diffWordsInLine("", "new text");
        expect(result.every((w) => w.type === "insert")).toBe(true);
    });

    test("handles empty new line", () => {
        const result = diffWordsInLine("old text", "");
        expect(result.every((w) => w.type === "delete")).toBe(true);
    });
});

describe("getDiffStats", () => {
    test("counts additions correctly", () => {
        const result = diffLines("", "a\nb\nc");
        const stats = getDiffStats(result);
        expect(stats.added).toBe(3);
        expect(stats.removed).toBe(0);
        expect(stats.unchanged).toBe(0);
    });

    test("counts deletions correctly", () => {
        const result = diffLines("a\nb\nc", "");
        const stats = getDiffStats(result);
        expect(stats.added).toBe(0);
        expect(stats.removed).toBe(3);
        expect(stats.unchanged).toBe(0);
    });

    test("counts unchanged lines correctly", () => {
        const result = diffLines("a\nb", "a\nb");
        const stats = getDiffStats(result);
        expect(stats.added).toBe(0);
        expect(stats.removed).toBe(0);
        expect(stats.unchanged).toBe(2);
    });

    test("counts mixed changes correctly", () => {
        const result = diffLines(
            "line1\nline2\nline3",
            "line1\nmodified\nline3",
        );
        const stats = getDiffStats(result);
        expect(stats.added).toBe(1);
        expect(stats.removed).toBe(1);
        expect(stats.unchanged).toBe(2);
    });
});
