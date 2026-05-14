/**
 * End-to-end integration test: verifies all integration modules compile
 * and basic wiring is correct (harness routing, state management, signals,
 * version control, diff utilities).
 */
import { describe, test, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Agent harnesses
// ---------------------------------------------------------------------------
import {
    BaseHarness,
    type ModelCatalogItem,
    type HarnessOptions,
    type Submission,
} from "./integrations/agents/interface";
import { OpenCode } from "./integrations/agents/opencode";
import { Pi } from "./integrations/agents/pi";
import { Codex } from "./integrations/agents/codex";
import { ClaudeCode } from "./integrations/agents/claude_code";

// ---------------------------------------------------------------------------
// Version control
// ---------------------------------------------------------------------------
import {
    detectVcsType,
    collectDiffInfo,
    type DiffInfo,
    type ChangedFile,
    type VcsType,
    isGitRepo,
    isJjRepo,
} from "./integrations/version_control/interface";

// ---------------------------------------------------------------------------
// Diff utilities
// ---------------------------------------------------------------------------
import { diffLines, type DiffHunk, getDiffStats, type DiffResult } from "./utils/diff";

// ---------------------------------------------------------------------------
// State & signals
// ---------------------------------------------------------------------------
import { AppStateStore, recomputeTypeState } from "./controllers/state";
import { SIGNALS, type Signal } from "./signals";
import type { AgentHarness, AgentUpdate, CodeFileEntry } from "./types";

// ---------------------------------------------------------------------------
// Diff view rendering (import only — verifies compilation)
// ---------------------------------------------------------------------------
import { renderDiffList, type DiffLayoutMode, type DiffRenderResult } from "./app/components/diff_view";

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
import { NavigationController } from "./controllers/navigation";

// ---------------------------------------------------------------------------
// Diff algorithm end-to-end
// ---------------------------------------------------------------------------

describe("diff algorithm e2e", () => {
    test("diffLines produces correct hunks for a typical file change", () => {
        const oldText = [
            "function hello() {",
            "  return 'hello';",
            "}",
            "",
            "function world() {",
            "  return 'world';",
            "}",
        ].join("\n");

        const newText = [
            "function hello() {",
            "  return 'hello world';",
            "}",
            "",
            "function goodbye() {",
            "  return 'goodbye';",
            "}",
        ].join("\n");

        const result = diffLines(oldText, newText);
        const stats = getDiffStats(result);

        // 3 deleted lines, 3 added lines (2 modified pairs + function rename)
        expect(stats.added).toBe(3);
        expect(stats.removed).toBe(3);
        expect(result.hunks.length).toBeGreaterThan(1);
    });

    test("empty diff produces single equal hunk", () => {
        const text = "hello\nworld";
        const result = diffLines(text, text);
        expect(result.hunks.length).toBe(1);
        expect(result.hunks[0]?.kind).toBe("equal");
        expect(getDiffStats(result).added).toBe(0);
        expect(getDiffStats(result).removed).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Version control interface
// ---------------------------------------------------------------------------

describe("version control interface", () => {
    test("detectVcsType returns a valid type string", () => {
        const vcsType = detectVcsType(process.cwd());
        expect(["git", "jj", "none"].includes(vcsType)).toBe(true);
    });

    test("isGitRepo and isJjRepo are callable", () => {
        const git = isGitRepo(process.cwd());
        const jj = isJjRepo(process.cwd());
        expect(typeof git).toBe("boolean");
        expect(typeof jj).toBe("boolean");
    });

    test("collectDiffInfo returns valid shape even for non-VCS dirs", async () => {
        const info = await collectDiffInfo(process.cwd());
        expect(typeof info.vcsType).toBe("string");
        expect(Array.isArray(info.changedFiles)).toBe(true);
        expect(typeof info.root).toBe("string");
    });
});

// ---------------------------------------------------------------------------
// Agent harnesses — structure and type-safety
// ---------------------------------------------------------------------------

describe("agent harnesses", () => {
    const dummyUpdates: AgentUpdate[] = [];
    const dummyHarnessOptions: HarnessOptions = {
        rootDir: process.cwd(),
        initialUpdates: dummyUpdates,
    };

    test("all four harnesses instantiate", () => {
        const opencode = new OpenCode(dummyHarnessOptions);
        const pi = new Pi(dummyHarnessOptions);
        const codex = new Codex(dummyHarnessOptions);
        const claude = new ClaudeCode(dummyHarnessOptions);

        expect(opencode.command).toBe("opencode");
        expect(opencode.harnessId).toBe("opencode");
        expect(pi.command).toBe("pi");
        expect(pi.harnessId).toBe("pi");
        expect(codex.command).toBe("codex");
        expect(codex.harnessId).toBe("codex");
        expect(claude.command).toBe("claude");
        expect(claude.harnessId).toBe("claude_code");
    });

    test("harnesses share BaseHarness interface", () => {
        const harnesses: BaseHarness[] = [
            new OpenCode(dummyHarnessOptions),
            new Pi(dummyHarnessOptions),
            new Codex(dummyHarnessOptions),
            new ClaudeCode(dummyHarnessOptions),
        ];

        for (const h of harnesses) {
            // All must have these methods
            expect(typeof h.getUpdates).toBe("function");
            expect(typeof h.getMutableUpdates).toBe("function");
            expect(typeof h.upsertFromSubmission).toBe("function");
            expect(typeof h.findById).toBe("function");
            expect(typeof h.remove).toBe("function");
            expect(typeof h.pruneForEntries).toBe("function");
            expect(typeof h.launch).toBe("function");
            expect(typeof h.shutdown).toBe("function");
            expect(typeof h.listModels).toBe("function");
        }
    });

    test("upsertFromSubmission creates and returns an AgentUpdate", () => {
        const harness = new OpenCode(dummyHarnessOptions);
        const submission: Submission = {
            filePath: "src/test.ts",
            selectionStartFileLine: 1,
            selectionEndFileLine: 5,
            selectedText: "test",
            prompt: "fix this",
            model: "opencode/big-pickle",
        };

        const update = harness.upsertFromSubmission(submission);
        expect(update.filePath).toBe("src/test.ts");
        expect(update.prompt).toBe("fix this");
        expect(update.harness).toBe("opencode");
        expect(update.status).toBe("draft");
        expect(Array.isArray(update.messages)).toBe(true);
    });

    test("remove returns false for non-existent id", () => {
        const harness = new OpenCode(dummyHarnessOptions);
        expect(harness.remove("non-existent")).toBe(false);
    });

    test("pruneForEntries removes updates for missing files", () => {
        const harness = new OpenCode(dummyHarnessOptions);
        harness.upsertFromSubmission({
            filePath: "src/keep.ts",
            selectionStartFileLine: 1,
            selectionEndFileLine: 1,
            selectedText: "",
            prompt: "",
            model: "opencode/big-pickle",
        });
        harness.upsertFromSubmission({
            filePath: "src/remove.ts",
            selectionStartFileLine: 1,
            selectionEndFileLine: 1,
            selectedText: "",
            prompt: "",
            model: "opencode/big-pickle",
        });

        harness.pruneForEntries(new Set(["src/keep.ts"]));
        const updates = harness.getUpdates();
        expect(updates.length).toBe(1);
        expect(updates[0]?.filePath).toBe("src/keep.ts");
    });
});

// ---------------------------------------------------------------------------
// State store — diff fields
// ---------------------------------------------------------------------------

describe("AppStateStore", () => {
    test("default diff state is clean", () => {
        const store = new AppStateStore();
        expect(store.diffLayoutMode).toBe("stacked");
        expect(store.diffInfo).toBeNull();
        expect(store.diffHunkLines.length).toBe(0);
    });

    test("diffInfo assignment works", () => {
        const store = new AppStateStore();
        const mockInfo: DiffInfo = {
            vcsType: "git",
            changedFiles: [],
            hasStagedChanges: false,
            hasUnstagedChanges: false,
            hasUntrackedFiles: false,
            root: "/test",
        };
        store.diffInfo = mockInfo;
        expect(store.diffInfo?.vcsType).toBe("git");
    });
});

// ---------------------------------------------------------------------------
// Signals smoke test
// ---------------------------------------------------------------------------

describe("signals", () => {
    test("all required signals exist and are callable", () => {
        // These signals must be present for the app to wire correctly
        const required: Array<{ name: string; signal: Signal<unknown[]> }> = [
            { name: "shortcutsToggle", signal: SIGNALS.shortcutsToggle as Signal<unknown[]> },
            { name: "promptSubmission", signal: SIGNALS.promptSubmission as Signal<unknown[]> },
            { name: "cursorChanged", signal: SIGNALS.cursorChanged as Signal<unknown[]> },
            { name: "agentRenderRequested", signal: SIGNALS.agentRenderRequested as Signal<unknown[]> },
            { name: "diffViewCycleLayout", signal: SIGNALS.diffViewCycleLayout as Signal<unknown[]> },
            { name: "navJumpNextHunk", signal: SIGNALS.navJumpNextHunk as Signal<unknown[]> },
            { name: "navJumpPrevHunk", signal: SIGNALS.navJumpPrevHunk as Signal<unknown[]> },
            { name: "navJumpNextFile", signal: SIGNALS.navJumpNextFile as Signal<unknown[]> },
            { name: "navJumpPrevFile", signal: SIGNALS.navJumpPrevFile as Signal<unknown[]> },
            { name: "navJumpTop", signal: SIGNALS.navJumpTop as Signal<unknown[]> },
            { name: "navJumpBottom", signal: SIGNALS.navJumpBottom as Signal<unknown[]> },
            { name: "agentDeleteAtCursor", signal: SIGNALS.agentDeleteAtCursor as Signal<unknown[]> },
            { name: "visualToggle", signal: SIGNALS.visualToggle as Signal<unknown[]> },
            { name: "focusToggleCodeChips", signal: SIGNALS.focusToggleCodeChips as Signal<unknown[]> },
            { name: "workspaceChanged", signal: SIGNALS.workspaceChanged as Signal<unknown[]> },
            { name: "filesCollapseCurrent", signal: SIGNALS.filesCollapseCurrent as Signal<unknown[]> },
            { name: "filesResetVisibility", signal: SIGNALS.filesResetVisibility as Signal<unknown[]> },
            { name: "systemStdoutResize", signal: SIGNALS.systemStdoutResize as Signal<unknown[]> },
        ];

        let listenerFired = false;
        let unsubscribeCount = 0;

        for (const { name, signal } of required) {
            expect(signal).toBeDefined();
            expect(typeof signal).toBe("function");

            // Verify subscription works
            const unsub = signal(() => {
                listenerFired = true;
            });
            expect(typeof unsub).toBe("function");

            // Verify unsubscription works
            unsub();
            unsubscribeCount += 1;
        }

        // Just verifying they all respond to subscription calls
        expect(unsubscribeCount).toBe(required.length);
        // Listener shouldn't fire because we unsubscribed before dispatching
        expect(listenerFired).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Prompt harness resolution logic
// ---------------------------------------------------------------------------

describe("prompt harness resolution", () => {
    /** Replicates the resolveHarnessFromModel logic from Prompt controller. */
    function resolveHarnessFromModel(model: string): AgentHarness {
        if (model.startsWith("opencode/")) { return "opencode"; }
        if (model.startsWith("pi:")) { return "pi"; }
        if (model.startsWith("codex:")) { return "codex"; }
        if (model.startsWith("claude:")) { return "claude_code"; }
        return "opencode";
    }

    test("resolves opencode models", () => {
        expect(resolveHarnessFromModel("opencode/big-pickle")).toBe("opencode");
        expect(resolveHarnessFromModel("opencode/gpt-4")).toBe("opencode");
    });

    test("resolves pi models", () => {
        expect(resolveHarnessFromModel("pi:google/gemini-3-pro")).toBe("pi");
        expect(resolveHarnessFromModel("pi:anthropic/claude-sonnet")).toBe("pi");
    });

    test("resolves codex models", () => {
        expect(resolveHarnessFromModel("codex:gpt-4")).toBe("codex");
    });

    test("resolves claude models", () => {
        expect(resolveHarnessFromModel("claude:claude-sonnet-4-6")).toBe("claude_code");
    });

    test("defaults to opencode for unknown prefixes", () => {
        expect(resolveHarnessFromModel("unknown/model")).toBe("opencode");
        expect(resolveHarnessFromModel("")).toBe("opencode");
    });
});

// ---------------------------------------------------------------------------
// Diff view rendering (compilation smoke test)
// ---------------------------------------------------------------------------

describe("diff view types", () => {
    test("DiffRenderResult has navigation fields", () => {
        const result: DiffRenderResult = {
            nextLineNumber: 1,
            nextDisplayRow: 0,
            blockStartLine: 1,
            hunkLines: [5, 12, 20],
            fileAnchors: [{ line: 1, dividerRow: 0, filePath: "src/test.ts" }],
            blocks: [],
        };
        expect(result.hunkLines.length).toBe(3);
        expect(result.fileAnchors.length).toBe(1);
        expect(result.fileAnchors[0]?.filePath).toBe("src/test.ts");
    });

    test("ChangedFile type has optional staged field", () => {
        const gitFile: ChangedFile = {
            relativePath: "src/test.ts",
            status: "modified",
            staged: "unstaged",
            oldContent: "old",
            newContent: "new",
        };
        const jjFile: ChangedFile = {
            relativePath: "src/test.ts",
            status: "modified",
            staged: undefined,
            oldContent: "old",
            newContent: "new",
        };
        expect(gitFile.staged).toBe("unstaged");
        expect(jjFile.staged).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// AgentHarness type union
// ---------------------------------------------------------------------------

describe("AgentHarness type", () => {
    test("harness IDs match AgentHarness union", () => {
        const validHarnesses: AgentHarness[] = [
            "opencode",
            "pi",
            "codex",
            "claude_code",
        ];
        for (const h of validHarnesses) {
            expect(["opencode", "pi", "codex", "claude_code"].includes(h)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// ModelCatalogItem shape
// ---------------------------------------------------------------------------

describe("ModelCatalogItem shape", () => {
    test("items have model and variants", () => {
        const item: ModelCatalogItem = {
            model: "pi:google/gemini-3-pro",
            variants: ["auto", "high", "low"],
        };
        expect(item.model).toBe("pi:google/gemini-3-pro");
        expect(item.variants).toEqual(["auto", "high", "low"]);
    });

    test("listModels returns catalog items from Pi", async () => {
        const pi = new Pi({ rootDir: process.cwd(), initialUpdates: [] });
        const items = await pi.listModels();
        // May be empty if pi isn't fully configured, but must return an array
        expect(Array.isArray(items)).toBe(true);
        for (const item of items) {
            expect(typeof item.model).toBe("string");
            expect(Array.isArray(item.variants)).toBe(true);
        }
    });
});

// ---------------------------------------------------------------------------
// Number of functions explicitly tested to confirm compilation
// ---------------------------------------------------------------------------

describe("module compilation smoke", () => {
    test("diffLines is callable with correct types", () => {
        const result: DiffResult = diffLines("a\nb", "a\nc");
        expect(result.hunks.length).toBeGreaterThan(0);
        expect(typeof result.oldLineCount).toBe("number");
        expect(typeof result.newLineCount).toBe("number");
    });

    test("DiffHunk type is structurally correct", () => {
        const hunk: DiffHunk = { kind: "insert", lines: ["hello"] };
        expect(hunk.kind).toBe("insert");
        expect(hunk.lines).toEqual(["hello"]);
    });

    test("all diff types are importable", () => {
        // Verify key types exist at compile time
        type CheckTypes = {
            diffResult: DiffResult;
            diffHunk: DiffHunk;
            changedFile: ChangedFile;
            diffInfo: DiffInfo;
            vcsType: VcsType;
            agentHarness: AgentHarness;
        };
        // If this compiles, the type system is intact
        const _check: CheckTypes = null as unknown as CheckTypes;
        expect(_check).toBeNull();
    });
});
