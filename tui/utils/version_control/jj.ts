/**
 * Jujutsu (jj) integration: detects jj repositories and provides diff information
 * for the TUI diff view.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Represents a file that has changes in the working directory. */
export interface ChangedFile {
    readonly relativePath: string;
    readonly status: JjFileStatus;
    readonly oldContent: string;
    readonly newContent: string;
}

/** Possible jj file statuses. */
export type JjFileStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";

/** Complete jj diff information for a repository. */
export interface JjDiffInfo {
    readonly isJjRepo: boolean;
    readonly changedFiles: readonly ChangedFile[];
    readonly hasStagedChanges: boolean;
    readonly hasUnstagedChanges: boolean;
    readonly hasUntrackedFiles: boolean;
    readonly root: string;
}

/**
 * Checks if a directory is a jj repository.
 * @param root - Directory to check
 * @returns True if it's a jj repository
 * @example
 * isJjRepo("/project") // true or false
 */
export function isJjRepo(root: string): boolean {
    const probe = spawnSync("jj", ["status", "-R", root], {
        encoding: "utf8",
    });

    // jj returns 0 for valid repos, even if there are no changes
    return probe.status === 0;
}

/**
 * Gets the list of changed files in the working directory.
 * @param root - Repository root
 * @returns Array of changed file paths
 */
export function getChangedFiles(root: string): string[] {
    if (!isJjRepo(root)) {
        return [];
    }

    const result = spawnSync(
        "jj",
        ["diff", "--summary", "-R", root],
        { encoding: "utf8" },
    );

    if (result.status !== 0) {
        return [];
    }

    const lines = (result.stdout ?? "").split("\n").filter(Boolean);
    const files: string[] = [];

    for (const line of lines) {
        // jj diff --summary shows lines like:
        // M src/index.ts
        // A newfile.ts
        // D deleted.ts
        // R old.ts -> new.ts
        const match = /^[MARCD] (.+?)(?: -> .+)?$/.exec(line);
        if (match && match[1]) {
            files.push(match[1]);
        }
    }

    // Also get untracked files from jj status
    const statusResult = spawnSync(
        "jj",
        ["status", "-R", root],
        { encoding: "utf8" },
    );

    if (statusResult.status === 0) {
        const statusLines = (statusResult.stdout ?? "").split("\n");
        for (const line of statusLines) {
            if (line.startsWith("? ")) {
                const filePath = line.slice(2).trim();
                if (filePath) {
                    files.push(filePath);
                }
            }
        }
    }

    return [...new Set(files)];
}

/**
 * Gets the old version of a file from the prior revision.
 * @param root - Repository root
 * @param filePath - Relative path to the file
 * @returns File content from prior revision, or null if not available
 */
export async function getOldContentFromPriorRevision(
    root: string,
    filePath: string,
): Promise<string | null> {
    // Get the content from the "before" revision (parent of current working copy)
    const result = spawnSync(
        "jj",
        ["file", "show", "-r", "@-", "-R", root, "--", filePath],
        { encoding: "utf8" },
    );

    if (result.status === 0) {
        return result.stdout ?? "";
    }

    return null;
}

/**
 * Collects complete diff information for all changed files.
 * @param root - Repository root
 * @returns Complete jj diff information
 * @example
 * const info = collectJjDiffInfo("/project");
 * info.changedFiles // [{ relativePath: "src/index.ts", status: "modified", ... }]
 */
export async function collectJjDiffInfo(root: string): Promise<JjDiffInfo> {
    if (!isJjRepo(root)) {
        return {
            isJjRepo: false,
            changedFiles: [],
            hasStagedChanges: false,
            hasUnstagedChanges: false,
            hasUntrackedFiles: false,
            root,
        };
    }

    // Get status to check for changes
    const statusResult = spawnSync(
        "jj",
        ["status", "-R", root],
        { encoding: "utf8" },
    );

    let hasStagedChanges = false;
    let hasUnstagedChanges = false;
    let hasUntrackedFiles = false;
    const changedFiles: ChangedFile[] = [];

    if (statusResult.status === 0) {
        const statusLines = (statusResult.stdout ?? "").split("\n");

        for (const line of statusLines) {
            // Working copy changes (not yet committed)
            if (line.startsWith("M ") || line.startsWith("A ") || line.startsWith("D ") || line.startsWith("R ")) {
                hasUnstagedChanges = true;
                break;
            }
            // Untracked files
            if (line.startsWith("? ")) {
                hasUntrackedFiles = true;
            }
        }
    }

    // Get diff summary
    const diffResult = spawnSync(
        "jj",
        ["diff", "--summary", "-R", root],
        { encoding: "utf8" },
    );

    if (diffResult.status === 0) {
        const diffLines = (diffResult.stdout ?? "").split("\n").filter(Boolean);

        for (const line of diffLines) {
            let status: JjFileStatus = "modified";
            let filePath = "";

            if (line.startsWith("M ")) {
                status = "modified";
                filePath = line.slice(2);
            } else if (line.startsWith("A ")) {
                status = "added";
                filePath = line.slice(2);
            } else if (line.startsWith("D ")) {
                status = "deleted";
                filePath = line.slice(2).trim();
            } else if (line.startsWith("R ")) {
                status = "renamed";
                const parts = line.slice(2).split(" -> ");
                filePath = parts[0] ?? "";
            } else {
                continue;
            }

            if (!filePath) { continue; }

            const oldContent = status === "added"
                ? ""
                : await getOldContentFromPriorRevision(root, filePath) ?? "";
            const newContent = status === "deleted"
                ? ""
                : await readFileContent(root, filePath);

            changedFiles.push({
                relativePath: filePath,
                status,
                oldContent,
                newContent,
            });
        }
    }

    // Add untracked files
    if (statusResult.status === 0) {
        const statusLines = (statusResult.stdout ?? "").split("\n");
        for (const line of statusLines) {
            if (!line.startsWith("? ")) { continue; }

            const filePath = line.slice(2).trim();
            if (!filePath) { continue; }

            const absolutePath = path.join(root, filePath);
            if (!existsSync(absolutePath)) { continue; }

            changedFiles.push({
                relativePath: filePath,
                status: "untracked",
                oldContent: "",
                newContent: await readFileContent(root, filePath),
            });
        }
    }

    return {
        isJjRepo: true,
        changedFiles,
        hasStagedChanges,
        hasUnstagedChanges,
        hasUntrackedFiles,
        root,
    };
}

/** Helper to read file content safely. */
async function readFileContent(root: string, relativePath: string): Promise<string> {
    try {
        const absolutePath = path.join(root, relativePath);
        return await readFile(absolutePath, "utf8");
    } catch {
        return "";
    }
}

/**
 * Gets file status for a specific file.
 * @param root - Repository root
 * @param filePath - Relative path to the file
 * @returns File status or null if not a jj repo
 */
export function getFileStatus(root: string, filePath: string): JjFileStatus | null {
    if (!isJjRepo(root)) {
        return null;
    }

    const result = spawnSync(
        "jj",
        ["status", "-R", root],
        { encoding: "utf8" },
    );

    if (result.status !== 0) {
        return null;
    }

    const searchPath = `${filePath}`;
    for (const line of (result.stdout ?? "").split("\n")) {
        if (line.includes(searchPath)) {
            if (line.startsWith("M ")) { return "modified"; }
            if (line.startsWith("A ")) { return "added"; }
            if (line.startsWith("D ")) { return "deleted"; }
            if (line.startsWith("R ")) { return "renamed"; }
            if (line.startsWith("? ")) { return "untracked"; }
        }
    }

    return null;
}

/**
 * Gets the jj log for recent commits.
 * @param root - Repository root
 * @param limit - Maximum number of commits to return
 * @returns Array of commit info
 */
export function getRecentCommits(
    root: string,
    limit = 10,
): Array<{ changeId: string; message: string; author: string }> {
    if (!isJjRepo(root)) {
        return [];
    }

    const result = spawnSync(
        "jj",
        ["log", "-R", root, "-n", String(limit), "--no-pager"],
        { encoding: "utf8" },
    );

    if (result.status !== 0) {
        return [];
    }

    const commits: Array<{ changeId: string; message: string; author: string }> = [];
    const lines = (result.stdout ?? "").split("\n");

    let currentCommit: { changeId: string; message: string; author: string } | null = null;

    for (const line of lines) {
        if (!line.trim()) {
            if (currentCommit) {
                commits.push(currentCommit);
                currentCommit = null;
            }
            continue;
        }

        // Parse change ID
        const idMatch = /^([a-f0-9]+)/.exec(line);
        if (idMatch && line.includes("change id:")) {
            currentCommit = {
                changeId: idMatch[1] ?? "",
                message: "",
                author: "",
            };
        }

        // Parse message
        if (currentCommit && line.startsWith("    ")) {
            currentCommit.message = line.trim();
        }

        // Parse author
        if (currentCommit && line.includes("author:")) {
            const authorMatch = /author:\s*(.+?)(?:\s+<|$)/.exec(line);
            if (authorMatch) {
                currentCommit.author = (authorMatch[1] ?? "").trim();
            }
        }
    }

    if (currentCommit) {
        commits.push(currentCommit);
    }

    return commits;
}