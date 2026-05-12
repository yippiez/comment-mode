/**
 * Tests for version control detection logic.
 *
 * Tests verify the module structure and type exports; git/jj detection
 * requires actual repo access and is tested integration-style.
 */
import { describe, test, expect } from "bun:test";
import { detectVcsType, collectDiffInfo } from "./interface";

describe("detectVcsType", () => {
    test("function is callable", () => {
        expect(typeof detectVcsType).toBe("function");
    });

    test("returns a valid VcsType", () => {
        const result = detectVcsType(".");
        expect(["git", "jj", "none"]).toContain(result);
    });
});

describe("collectDiffInfo", () => {
    test("function is callable and returns async", () => {
        expect(typeof collectDiffInfo).toBe("function");
    });

    test("resolves with DiffInfo shape", async () => {
        const info = await collectDiffInfo(".");
        expect(info).toHaveProperty("vcsType");
        expect(info).toHaveProperty("changedFiles");
        expect(info).toHaveProperty("hasStagedChanges");
        expect(info).toHaveProperty("hasUnstagedChanges");
        expect(info).toHaveProperty("hasUntrackedFiles");
        expect(info).toHaveProperty("root");
    });
});
