/**
 * Tests for the refactored Review Diff Feed and Agent Run Event modules.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { parseAgentStreamLine } from "./agents/events";
import { computeReviewViewport, ReviewTuiApp } from "./app2/review_tui_app";
import { buildReviewDiffFeed, resolveReviewSelection } from "./domain/review_diff_feed";
import type { DiffInfo } from "./integrations/version_control/interface";

type TestRenderer = Awaited<ReturnType<typeof createTestRenderer>>;
let rendererFixture: TestRenderer | null = null;

afterEach(() => {
    rendererFixture?.renderer.destroy();
    rendererFixture = null;
});

/** Creates a tiny DiffInfo fixture for review feed tests. */
function diffInfoFixture(): DiffInfo {
    return {
        vcsType: "git",
        root: "/repo",
        hasStagedChanges: false,
        hasUnstagedChanges: true,
        hasUntrackedFiles: false,
        changedFiles: [{
            relativePath: "src/a.ts",
            status: "modified",
            staged: "unstaged",
            oldContent: ["one", "two", "three", "four", "five", "six", "seven"].join("\n"),
            newContent: ["one", "two", "THREE", "four", "five", "six", "seven"].join("\n"),
        }],
    };
}

/** Creates a large changed-file fixture for viewport performance regression tests. */
function largeDiffInfoFixture(lineCount: number): DiffInfo {
    const oldLines: string[] = [];
    const newLines: string[] = [];
    for (let index = 0; index < lineCount; index += 1) {
        oldLines.push(`line ${index}`);
        newLines.push(index % 17 === 0 ? `changed ${index}` : `line ${index}`);
    }
    return {
        vcsType: "git",
        root: "/repo",
        hasStagedChanges: false,
        hasUnstagedChanges: true,
        hasUntrackedFiles: false,
        changedFiles: [{
            relativePath: "src/large.ts",
            status: "modified",
            staged: "unstaged",
            oldContent: oldLines.join("\n"),
            newContent: newLines.join("\n"),
        }],
    };
}

describe("Review Diff Feed", () => {
    test("builds navigable hunks without exposing the old TUI shell", () => {
        const feed = buildReviewDiffFeed(diffInfoFixture());
        expect(feed.hunks.length).toBe(1);
        expect(feed.rows.some((row) => row.kind === "hunk")).toBe(true);
        expect(feed.rows.some((row) => row.kind === "insert")).toBe(true);
        expect(feed.rows.some((row) => row.kind === "delete")).toBe(true);
    });

    test("resolves a Review Selection from a changed row", () => {
        const feed = buildReviewDiffFeed(diffInfoFixture());
        const rowIndex = feed.rows.findIndex((row) => row.kind === "insert");
        const selection = resolveReviewSelection(feed, rowIndex, rowIndex);
        expect(selection?.filePath).toBe("src/a.ts");
        expect(selection?.selectedText).toContain("THREE");
        expect(selection?.diffText).toContain("@@");
    });
});

describe("Review TUI viewport", () => {
    test("keeps cursor visible without jumping when it is already onscreen", () => {
        expect(computeReviewViewport(1000, 10, 20, 5)).toBe(5);
        expect(computeReviewViewport(1000, 25, 20, 5)).toBe(6);
        expect(computeReviewViewport(1000, 3, 20, 5)).toBe(3);
    });

    test("clamps viewport starts for small or terminal rows", () => {
        expect(computeReviewViewport(5, 4, 20, 999)).toBe(0);
        expect(computeReviewViewport(100, 99, 20, 999)).toBe(80);
    });

    test("renders only terminal-visible rows for large feeds", async () => {
        rendererFixture = await createTestRenderer({ width: 100, height: 24 });
        const app = new ReviewTuiApp(rendererFixture.renderer, "/repo");
        app["feed"] = buildReviewDiffFeed(largeDiffInfoFixture(2500));
        app["render"]();
        expect(app["feed"]?.rows.length).toBeGreaterThan(1000);
        expect(app["rowPool"].length).toBe(22);
    });
});

describe("Agent Run Events", () => {
    test("normalizes OpenCode text events", () => {
        const events = parseAgentStreamLine("opencode", JSON.stringify({
            type: "text",
            part: { text: "OK" },
        }));
        expect(events).toEqual([{ kind: "assistant_text", text: "OK", rawType: "text" }]);
    });

    test("normalizes Pi text deltas", () => {
        const events = parseAgentStreamLine("pi", JSON.stringify({
            type: "message_update",
            assistantMessageEvent: { type: "text_delta", delta: "OK" },
        }));
        expect(events).toEqual([{ kind: "assistant_text", text: "OK", rawType: "text_delta" }]);
    });
});
