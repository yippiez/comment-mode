/**
 * Agent harness smoke tests: validates each harness's CRUD lifecycle
 * without requiring API credentials.
 */
import { describe, test, expect } from "bun:test";
import { OpenCode } from "../tui/integrations/agents/opencode";
import { Pi } from "../tui/integrations/agents/pi";
import { Codex } from "../tui/integrations/agents/codex";
import { ClaudeCode } from "../tui/integrations/agents/claude_code";
import type { BaseHarness, Submission } from "../tui/integrations/agents/interface";
import type { AgentHarness } from "../tui/types";

const harnessFactories: Array<{
    id: AgentHarness;
    create: () => BaseHarness;
}> = [
    {
        id: "opencode",
        create: () => new OpenCode({ rootDir: process.cwd(), initialUpdates: [] }),
    },
    {
        id: "pi",
        create: () => new Pi({ rootDir: process.cwd(), initialUpdates: [] }),
    },
    {
        id: "codex",
        create: () => new Codex({ rootDir: process.cwd(), initialUpdates: [] }),
    },
    {
        id: "claude_code",
        create: () => new ClaudeCode({ rootDir: process.cwd(), initialUpdates: [] }),
    },
];

for (const { id, create } of harnessFactories) {
    describe(`agent harness: ${id}`, () => {
        test("upsertFromSubmission creates a draft AgentUpdate", () => {
            const harness = create();
            const submission: Submission = {
                filePath: "test/example.ts",
                selectionStartFileLine: 1,
                selectionEndFileLine: 10,
                selectedText: "console.log('hello');",
                prompt: "Fix the code",
                model: `${id}:test-model`,
            };
            const update = harness.upsertFromSubmission(submission);
            expect(update.filePath).toBe("test/example.ts");
            expect(update.harness).toBe(id);
            expect(update.status).toBe("draft");
            expect(update.messages).toEqual([]);
            harness.shutdown();
        });

        test("findById returns the update after upsert", () => {
            const harness = create();
            const submission: Submission = {
                filePath: "test/example.ts",
                selectionStartFileLine: 1,
                selectionEndFileLine: 10,
                selectedText: "test",
                prompt: "test",
                model: `${id}:test-model`,
            };
            const update = harness.upsertFromSubmission(submission);
            const found = harness.findById(update.id);
            expect(found).toBeDefined();
            expect(found?.id).toBe(update.id);
            harness.shutdown();
        });

        test("getUpdates returns array", () => {
            const harness = create();
            const updates = harness.getUpdates();
            expect(Array.isArray(updates)).toBe(true);
            harness.shutdown();
        });

        test("remove deletes an update", () => {
            const harness = create();
            const submission: Submission = {
                filePath: "test/example.ts",
                selectionStartFileLine: 1,
                selectionEndFileLine: 10,
                selectedText: "test",
                prompt: "test",
                model: `${id}:test-model`,
            };
            const update = harness.upsertFromSubmission(submission);
            const removed = harness.remove(update.id);
            expect(removed).toBe(true);
            harness.shutdown();
        });

        test("remove returns false for non-existent id", () => {
            const harness = create();
            expect(harness.remove("non-existent")).toBe(false);
            harness.shutdown();
        });

        test("pruneForEntries keeps only matching files", () => {
            const harness = create();
            harness.upsertFromSubmission({
                filePath: "src/keep.ts",
                selectionStartFileLine: 1,
                selectionEndFileLine: 1,
                selectedText: "",
                prompt: "",
                model: `${id}:test-model`,
            });
            harness.upsertFromSubmission({
                filePath: "src/remove.ts",
                selectionStartFileLine: 1,
                selectionEndFileLine: 1,
                selectedText: "",
                prompt: "",
                model: `${id}:test-model`,
            });
            harness.pruneForEntries(new Set(["src/keep.ts"]));
            const updates = harness.getUpdates();
            expect(updates.length).toBe(1);
            expect(updates[0]?.filePath).toBe("src/keep.ts");
            harness.shutdown();
        });

        test("listModels returns an array", async () => {
            const harness = create();
            const models = await harness.listModels();
            expect(Array.isArray(models)).toBe(true);
            harness.shutdown();
        });
    });
}
