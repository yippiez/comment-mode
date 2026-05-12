/**
 * Version control abstraction: detects git or jj and provides unified diff access.
 */
import { isGitRepo, collectGitDiffInfo, type GitDiffInfo } from "./git";
import { isJjRepo, collectJjDiffInfo, type JjDiffInfo } from "./jj";

/** Unified changed file representation. */
export interface ChangedFile {
    readonly relativePath: string;
    readonly status: "modified" | "added" | "deleted" | "renamed" | "untracked";
    /** Staging layer: "staged" | "unstaged" | "both" (git only; undefined for jj). */
    readonly staged?: "staged" | "unstaged" | "both";
    readonly oldContent: string;
    readonly newContent: string;
}

/** Supported version control systems. */
export type VcsType = "git" | "jj" | "none";

/** Unified diff info that works for any VCS. */
export interface DiffInfo {
    readonly vcsType: VcsType;
    readonly changedFiles: readonly ChangedFile[];
    readonly hasStagedChanges: boolean;
    readonly hasUnstagedChanges: boolean;
    readonly hasUntrackedFiles: boolean;
    readonly root: string;
}

/** Detects which version control system is in use.
 * @param root - Directory to check
 * @returns The detected VCS type
 * @example
 * detectVcsType("/project") // "git" | "jj" | "none"
 */
export function detectVcsType(root: string): VcsType {
    if (isGitRepo(root)) {
        return "git";
    }
    if (isJjRepo(root)) {
        return "jj";
    }
    return "none";
}

/**
 * Collects diff information from the detected VCS.
 * @param root - Repository root
 * @returns Complete diff information
 * @example
 * const info = await collectDiffInfo("/project");
 * info.vcsType // "git" | "jj" | "none"
 * info.changedFiles // Array of changed files with old/new content
 */
export async function collectDiffInfo(root: string): Promise<DiffInfo> {
    const vcsType = detectVcsType(root);

    if (vcsType === "git") {
        const gitInfo = await collectGitDiffInfo(root);
        return convertGitDiffInfo(gitInfo);
    }

    if (vcsType === "jj") {
        const jjInfo = await collectJjDiffInfo(root);
        return convertJjDiffInfo(jjInfo);
    }

    return {
        vcsType: "none",
        changedFiles: [],
        hasStagedChanges: false,
        hasUnstagedChanges: false,
        hasUntrackedFiles: false,
        root,
    };
}

/**
 * Gets the list of changed files without full content.
 * @param root - Repository root
 * @returns Array of changed file paths
 * @example
 * const files = getChangedFiles("/project");
 * files // ["src/index.ts", "package.json"]
 */
export function getChangedFiles(root: string): string[] {
    if (isGitRepo(root)) {
        const { getChangedFiles: gitGetChanged } = require("./git");
        return gitGetChanged(root);
    }
    if (isJjRepo(root)) {
        const { getChangedFiles: jjGetChanged } = require("./jj");
        return jjGetChanged(root);
    }
    return [];
}

/** Converts git diff info to unified format. */
function convertGitDiffInfo(git: GitDiffInfo): DiffInfo {
    return {
        vcsType: git.isGitRepo ? "git" : "none",
        changedFiles: git.changedFiles.map((f) => ({
            relativePath: f.relativePath,
            status: f.status,
            staged: f.staged,
            oldContent: f.oldContent,
            newContent: f.newContent,
        })),
        hasStagedChanges: git.hasStagedChanges,
        hasUnstagedChanges: git.hasUnstagedChanges,
        hasUntrackedFiles: git.hasUntrackedFiles,
        root: git.root,
    };
}

/** Converts jj diff info to unified format. */
function convertJjDiffInfo(jj: JjDiffInfo): DiffInfo {
    return {
        vcsType: jj.isJjRepo ? "jj" : "none",
        changedFiles: jj.changedFiles.map((f) => ({
            relativePath: f.relativePath,
            status: f.status,
            staged: undefined, // jj has no staging concept
            oldContent: f.oldContent,
            newContent: f.newContent,
        })),
        hasStagedChanges: jj.hasStagedChanges,
        hasUnstagedChanges: jj.hasUnstagedChanges,
        hasUntrackedFiles: jj.hasUntrackedFiles,
        root: jj.root,
    };
}

/** Re-exports for convenience. */
export type { GitDiffInfo } from "./git";
export type { JjDiffInfo } from "./jj";
export { isGitRepo } from "./git";
export { isJjRepo } from "./jj";