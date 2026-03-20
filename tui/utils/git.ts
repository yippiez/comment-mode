/**
 * Git workspace helpers: parse `.gitignore`/top-level ignores and list
 * workspace files tracked/untracked for the TUI.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Parses a line from a .gitignore file to extract top-level directory names.
 * @param rawLine - A single line from a .gitignore file
 * @returns The directory name if valid, null otherwise
 * @example
 * parseIgnoredTopLevelDir("node_modules/") // "node_modules"
 * parseIgnoredTopLevelDir("# comment")   // null
 * parseIgnoredTopLevelDir("*.log")       // null (glob pattern)
 * parseIgnoredTopLevelDir("foo/bar")    // null (nested path)
 */
export function parseIgnoredTopLevelDir(rawLine: string): string | null {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) { return null; }
    if (trimmed.startsWith("#") || trimmed.startsWith("!")) { return null; }

    let normalized = trimmed;
    if (normalized.startsWith("/")) {
        normalized = normalized.slice(1);
    }
    if (normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
    }

    if (normalized.length === 0) { return null; }
    if (normalized.includes("/")) { return null; }
    if (/[*?\[\\]/.test(normalized)) { return null; }
    if (normalized === "." || normalized === "..") { return null; }
    return normalized;
}

/**
 * Lists all tracked and untracked files in a git workspace.
 * @param root - Root directory of the git repository
 * @returns Array of relative file paths, or null if not a git repository
 * @example
 * listGitWorkspaceFiles("/project") // ["src/index.ts", "package.json"]
 * listGitWorkspaceFiles("/not-git") // null
 */
export function listGitWorkspaceFiles(root: string): string[] | null {
    const probe = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
        encoding: "utf8",
    });

    if (probe.status !== 0 || probe.stdout.trim() !== "true") {
        return null;
    }

    const lsFiles = spawnSync(
        "git",
        ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        {
            encoding: "utf8",
        },
    );

    if (lsFiles.status !== 0) {
        return null;
    }

    return [...new Set((lsFiles.stdout ?? "").split("\0").filter(Boolean))].filter((relativePath) => {
        const absolutePath = path.join(root, relativePath);
        return existsSync(absolutePath);
    });
}

/**
 * Filters out files that are ignored by git based on .gitignore rules.
 * @param root - Root directory of the git repository
 * @param files - Array of file paths to filter
 * @returns Array of files that are not git-ignored
 * @example
 * filterGitIgnored("/project", ["src/index.ts", "node_modules/foo"]) // ["src/index.ts"]
 */
export function filterGitIgnored(root: string, files: string[]): string[] {
    if (files.length === 0) { return files; }

    const checkIgnore = spawnSync("git", ["-C", root, "check-ignore", "--no-index", "-z", "--stdin"], {
        input: `${files.join("\0")}\0`,
        encoding: "utf8",
    });

    if (checkIgnore.status === 129) {
        return filterGitIgnoredInRepository(root, files);
    }

    if (checkIgnore.status !== 0 && checkIgnore.status !== 1) {
        return files;
    }

    const ignored = new Set(checkIgnore.stdout.split("\0").filter(Boolean));
    return files.filter((file) => !ignored.has(file));
}

/**
 * Fallback function to filter git-ignored files using git check-ignore with stdin.
 * @param root - Root directory of the git repository
 * @param files - Array of file paths to filter
 * @returns Array of files that are not git-ignored
 * @example
 * filterGitIgnoredInRepository("/project", ["a.ts", "dist/b.js"]) // ["a.ts"]
 */
export function filterGitIgnoredInRepository(root: string, files: string[]): string[] {
    const probe = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
        encoding: "utf8",
    });

    if (probe.status !== 0 || probe.stdout.trim() !== "true") {
        return files;
    }

    const checkIgnore = spawnSync("git", ["-C", root, "check-ignore", "-z", "--stdin"], {
        input: `${files.join("\0")}\0`,
        encoding: "utf8",
    });

    if (checkIgnore.status !== 0 && checkIgnore.status !== 1) {
        return files;
    }

    const ignored = new Set(checkIgnore.stdout.split("\0").filter(Boolean));
    return files.filter((file) => !ignored.has(file));
}

/**
 * Parses a unified diff patch and merges changed line numbers into a target map.
 * @param target - Map to store file paths and their changed line numbers
 * @param patch - The git diff patch string to parse
 * @example
 * const changes = new Map();
 * mergePatchChangedLines(changes, "diff --git a/src/index.ts b/src/index.ts\n@@ -1,3 +1,3 @@\n-initial\n+updated");
 * changes.get("src/index.ts") // Set containing line numbers
 */
export function mergePatchChangedLines(target: Map<string, Set<number>>, patch: string): void {
    let currentPath: string | null = null;
    const lines = patch.split("\n");

    for (const line of lines) {
        if (line.startsWith("+++ ")) {
            const nextPath = line.slice(4).trim();
            currentPath = nextPath === "/dev/null" ? null : nextPath;
            continue;
        }

        if (!currentPath) { continue; }
        if (!line.startsWith("@@ ")) { continue; }

        const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (!match) { continue; }

        const start = Number.parseInt(match[1] ?? "0", 10);
        const count = Number.parseInt(match[2] ?? "1", 10);
        if (count <= 0 || Number.isNaN(start)) { continue; }

        const fileSet = target.get(currentPath) ?? new Set<number>();
        for (let lineNo = start; lineNo < start + count; lineNo += 1) {
            fileSet.add(lineNo);
        }
        target.set(currentPath, fileSet);
    }
}

/**
 * Checks if the first segment of a relative path matches an ignored directory name.
 * @param relativePath - The relative file path to check
 * @param ignoredDirs - Set of directory names that are ignored
 * @returns True if the path's first segment is in the ignored set
 * @example
 * isPathInsideIgnoredDir("node_modules/foo.js", new Set(["node_modules"])) // true
 * isPathInsideIgnoredDir("src/app.ts", new Set(["node_modules"]))           // false
 */
export function isPathInsideIgnoredDir(relativePath: string, ignoredDirs: ReadonlySet<string>): boolean {
    const normalized = relativePath.split(path.sep).join("/");
    const firstSegment = normalized.split("/")[0]?.trim();
    if (!firstSegment) { return false; }
    return ignoredDirs.has(firstSegment);
}

/**
 * Checks if an absolute path is within a root directory (not outside it).
 * @param root - The root directory path
 * @param absolutePath - The absolute path to check
 * @returns True if the path is within root, false if outside or at root
 * @example
 * isPathWithinRoot("/project", "/project/src/index.ts") // true
 * isPathWithinRoot("/project", "/other/file.ts")        // false
 * isPathWithinRoot("/project", "/project")              // true
 */
export function isPathWithinRoot(root: string, absolutePath: string): boolean {
    const relative = path.relative(root, absolutePath);
    if (relative.length === 0) { return true; }
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}
