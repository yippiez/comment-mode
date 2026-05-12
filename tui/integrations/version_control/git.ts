/**
 * Git integration: detects git repositories and provides diff information
 * for the TUI diff view.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Represents a file that has changes in the working directory. */
export interface ChangedFile {
    readonly relativePath: string;
    readonly status: GitFileStatus;
    /** Staging status — git only. jj backends leave this undefined. */
    readonly staged?: "staged" | "unstaged" | "both";
    readonly oldContent: string;
    readonly newContent: string;
}

/** Possible git file statuses. */
export type GitFileStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";

/** Complete git diff information for a repository. */
export interface GitDiffInfo {
    readonly isGitRepo: boolean;
    readonly changedFiles: readonly ChangedFile[];
    readonly hasStagedChanges: boolean;
    readonly hasUnstagedChanges: boolean;
    readonly hasUntrackedFiles: boolean;
    readonly root: string;
}

/**
 * Checks if a directory is a git repository.
 * @param root - Directory to check
 * @returns True if it's a git repository
 * @example
 * isGitRepo("/project") // true or false
 */
export function isGitRepo(root: string): boolean {
    const probe = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
        encoding: "utf8",
    });

    return probe.status === 0 && probe.stdout.trim() === "true";
}

/**
 * Gets the list of changed files in the working directory.
 * @param root - Repository root
 * @returns Array of changed file paths
 */
export function getChangedFiles(root: string): string[] {
    if (!isGitRepo(root)) {
        return [];
    }

    const files = new Set<string>();

    // Get unstaged changes
    const unstagedResult = spawnSync(
        "git",
        ["-C", root, "-c", "core.quotepath=false", "diff", "--name-status", "--no-color"],
        { encoding: "utf8" },
    );
    if (unstagedResult.status === 0) {
        for (const line of (unstagedResult.stdout ?? "").split("\n").filter(Boolean)) {
            const [, ...pathParts] = line.split("\t");
            const filePath = pathParts.join("\t");
            if (filePath) { files.add(filePath); }
        }
    }

    // Get staged changes
    const stagedResult = spawnSync(
        "git",
        ["-C", root, "-c", "core.quotepath=false", "diff", "--cached", "--name-only"],
        { encoding: "utf8" },
    );
    if (stagedResult.status === 0) {
        for (const filePath of (stagedResult.stdout ?? "").split("\n").filter(Boolean)) {
            files.add(filePath);
        }
    }

    // Get untracked files
    const untrackedResult = spawnSync(
        "git",
        ["-C", root, "ls-files", "--others", "--exclude-standard", "-z"],
        { encoding: "utf8" },
    );
    if (untrackedResult.status === 0) {
        for (const filePath of (untrackedResult.stdout ?? "").split("\0").filter(Boolean)) {
            files.add(filePath);
        }
    }

    return [...files];
}

/**
 * Retrieves staged diff content for a file.
 * @param root - Repository root
 * @param filePath - Relative path to the file
 * @returns The staged diff content, or null if not available
 */
export function getStagedDiff(root: string, filePath: string): string | null {
    const result = spawnSync(
        "git",
        [
            "-C",
            root,
            "-c",
            "core.quotepath=false",
            "diff",
            "--cached",
            "--",
            filePath,
        ],
        { encoding: "utf8" },
    );

    return result.status === 0 ? (result.stdout ?? "") : null;
}

/**
 * Retrieves unstaged diff content for a file.
 * @param root - Repository root
 * @param filePath - Relative path to the file
 * @returns The unstaged diff content, or null if not available
 */
export function getUnstagedDiff(root: string, filePath: string): string | null {
    const result = spawnSync(
        "git",
        [
            "-C",
            root,
            "-c",
            "core.quotepath=false",
            "diff",
            "--",
            filePath,
        ],
        { encoding: "utf8" },
    );

    return result.status === 0 ? (result.stdout ?? "") : null;
}

/**
 * Gets the old version of a file from the index (HEAD or staged).
 * @param root - Repository root
 * @param filePath - Relative path to the file
 * @returns File content from index, or null if not tracked
 */
export async function getOldContentFromIndex(root: string, filePath: string): Promise<string | null> {
    // First try staged content
    const stagedResult = spawnSync(
        "git",
        ["-C", root, "show", `:0:${filePath}`],
        { encoding: "utf8" },
    );

    if (stagedResult.status === 0) {
        return stagedResult.stdout ?? "";
    }

    // Fall back to HEAD
    const headResult = spawnSync(
        "git",
        ["-C", root, "show", `HEAD:${filePath}`],
        { encoding: "utf8" },
    );

    if (headResult.status === 0) {
        return headResult.stdout ?? "";
    }

    return null;
}

/**
 * Collects complete diff information for all changed files.
 * @param root - Repository root
 * @returns Complete git diff information
 * @example
 * const info = collectGitDiffInfo("/project");
 * info.changedFiles // [{ relativePath: "src/index.ts", status: "modified", ... }]
 */
export async function collectGitDiffInfo(root: string): Promise<GitDiffInfo> {
    if (!isGitRepo(root)) {
        return {
            isGitRepo: false,
            changedFiles: [],
            hasStagedChanges: false,
            hasUnstagedChanges: false,
            hasUntrackedFiles: false,
            root,
        };
    }

    // Check for staged changes
    const stagedResult = spawnSync(
        "git",
        ["-C", root, "diff", "--cached", "--quiet"],
        { encoding: "utf8" },
    );
    const hasStagedChanges = stagedResult.status !== 0;

    // Check for unstaged changes
    const unstagedResult = spawnSync(
        "git",
        ["-C", root, "diff", "--quiet"],
        { encoding: "utf8" },
    );
    const hasUnstagedChanges = unstagedResult.status !== 0;

    // Check for untracked files
    const untrackedResult = spawnSync(
        "git",
        ["-C", root, "ls-files", "--others", "--exclude-standard", "-z"],
        { encoding: "utf8" },
    );
    const untracked = (untrackedResult.stdout ?? "").split("\0").filter(Boolean);
    const hasUntrackedFiles = untracked.length > 0;

    // Get list of all changed files
    const changedFiles: ChangedFile[] = [];

    // Build a map of file → porcelain status for staging detection
    const porcelainStatus = spawnSync(
        "git",
        ["-C", root, "-c", "core.quotepath=false", "status", "--porcelain"],
        { encoding: "utf8" },
    );
    const fileStagedFlag = new Map<string, string>();
    for (const line of (porcelainStatus.stdout ?? "").split("\n").filter(Boolean)) {
        if (line.length < 3) { continue; }
        const pathPart = line.slice(3).trim();
        if (!pathPart) { continue; }
        fileStagedFlag.set(pathPart, line.slice(0, 2));
    }

    /** Resolves staging info from porcelain XY flags. */
    function stagingFor(filePath: string): "staged" | "unstaged" | "both" | undefined {
        const flag = fileStagedFlag.get(filePath);
        if (!flag || flag === "??") { return undefined; } // untracked — no staging
        const indexCh = flag[0] ?? " ";
        const workCh = flag[1] ?? " ";
        const indexStaged = indexCh !== " " && indexCh !== "?";
        const workUnstaged = workCh !== " " && workCh !== "?";
        if (indexStaged && workUnstaged) { return "both"; }
        if (indexStaged) { return "staged"; }
        if (workUnstaged) { return "unstaged"; }
        return undefined;
    }

    // Collect both unstaged and staged files (deduplicated by path)
    const fileMap = new Map<string, { status: GitFileStatus; stagedFromIndex: boolean; unstagedFromWorktree: boolean }>();

    // Parse unstaged diff (git diff --name-status)
    const unstagedDiffResult = spawnSync(
        "git",
        ["-C", root, "-c", "core.quotepath=false", "diff", "--name-status", "--no-color"],
        { encoding: "utf8" },
    );
    for (const line of (unstagedDiffResult.stdout ?? "").split("\n").filter(Boolean)) {
        const [statusChar, ...pathParts] = line.split("\t");
        const filePath = pathParts.join("\t");
        if (!filePath) { continue; }
        const status = parseGitStatusChar(statusChar ?? "M");
        const existing = fileMap.get(filePath);
        if (existing) {
            existing.unstagedFromWorktree = true;
            // Prefer the more severe status
            if (status !== "modified") { existing.status = status; }
        } else {
            fileMap.set(filePath, { status, stagedFromIndex: false, unstagedFromWorktree: true });
        }
    }

    // Parse staged diff (git diff --cached --name-status)
    if (hasStagedChanges) {
        const stagedDiffResult = spawnSync(
            "git",
            ["-C", root, "-c", "core.quotepath=false", "diff", "--cached", "--name-status"],
            { encoding: "utf8" },
        );
        for (const line of (stagedDiffResult.stdout ?? "").split("\n").filter(Boolean)) {
            const [statusChar, ...pathParts] = line.split("\t");
            const filePath = pathParts.join("\t");
            if (!filePath) { continue; }
            const status = parseGitStatusChar(statusChar ?? "M");
            const existing = fileMap.get(filePath);
            if (existing) {
                existing.stagedFromIndex = true;
            } else {
                fileMap.set(filePath, { status, stagedFromIndex: true, unstagedFromWorktree: false });
            }
        }
    }

    // Convert to ChangedFile[] and determine staging from porcelain flags
    for (const [filePath, { status }] of fileMap) {
        const oldContent = await getOldContentFromIndex(root, filePath) ?? "";
        const newContent = status === "deleted" ? "" : await readFileContent(root, filePath);

        changedFiles.push({
            relativePath: filePath,
            status,
            staged: stagingFor(filePath),
            oldContent,
            newContent,
        });
    }

    // Add untracked files (reuse `untracked` array from check above)
    if (hasUntrackedFiles) {
        for (const filePath of untracked) {
            const absolutePath = path.join(root, filePath);
            if (!existsSync(absolutePath)) { continue; }

            changedFiles.push({
                relativePath: filePath,
                status: "untracked",
                staged: stagingFor(filePath),
                oldContent: "",
                newContent: await readFileContent(root, filePath),
            });
        }
    }

    return {
        isGitRepo: true,
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

/** Maps a git status character to a GitFileStatus. */
function parseGitStatusChar(ch: string): GitFileStatus {
    switch (ch) {
        case "A": return "added";
        case "D": return "deleted";
        case "R": return "renamed";
        case "M": return "modified";
        default: return "modified";
    }
}

/**
 * Gets file status for a specific file.
 * @param root - Repository root
 * @param filePath - Relative path to the file
 * @returns File status or null if not a git repo
 */
export function getFileStatus(root: string, filePath: string): GitFileStatus | null {
    if (!isGitRepo(root)) {
        return null;
    }

    const result = spawnSync(
        "git",
        ["-C", root, "status", "--porcelain", "--", filePath],
        { encoding: "utf8" },
    );

    if (result.status !== 0 || !result.stdout) {
        return null;
    }

    const statusLine = (result.stdout ?? "").split("\n")[0] ?? "";
    if (statusLine.length < 2) {
        return null;
    }

    const indexStatus = statusLine[0];
    const workTreeStatus = statusLine[1];

    // Staged changes
    if (indexStatus === "A" || indexStatus === "M") { return "added"; }
    if (indexStatus === "D") { return "deleted"; }
    if (indexStatus === "R") { return "renamed"; }

    // Unstaged changes
    if (workTreeStatus === "M") { return "modified"; }
    if (workTreeStatus === "D") { return "deleted"; }

    // Untracked
    if (indexStatus === "?" && workTreeStatus === "?") { return "untracked"; }

    return "modified";
}