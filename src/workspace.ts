import { spawnSync } from "node:child_process";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isCodeExtension, resolveFileType, resolveTypeLabel, resolveTypePriority } from "./file-types";

export type WorkspaceCodeFileEntry = {
  relativePath: string;
  content: string;
  isContentLoaded: boolean;
  filetype?: string;
  typeLabel: string;
  typePriority: number;
  lineCount: number;
  uncommittedLines: number[];
  markAllLinesUncommitted: boolean;
};

const EAGER_CONTENT_FILE_LIMIT = 250;

export type WorkspaceWatcher = {
  close: () => void;
};

export async function getIgnoredDirs(root: string): Promise<Set<string>> {
  const ignored = new Set<string>([".git"]);
  const gitignorePath = path.join(root, ".gitignore");

  try {
    const content = await readFile(gitignorePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const first = trimmed.split("/")[0]?.trim();
      if (!first || first.includes("*")) continue;
      ignored.add(first);
    }
  } catch {
    // Ignore missing .gitignore.
  }

  return ignored;
}

export async function loadCodeFileEntries(
  root: string,
  ignoredDirs: ReadonlySet<string>,
): Promise<WorkspaceCodeFileEntry[]> {
  const files = await listCodeFiles(root, ignoredDirs);
  const eagerLoadContent = files.length <= EAGER_CONTENT_FILE_LIMIT;
  const entries = await Promise.all(
    files.map(async (relativePath) => {
      const typeLabel = resolveTypeLabel(relativePath);
      let content = "";
      let lineCount = 1;
      let isContentLoaded = false;

      if (eagerLoadContent) {
        try {
          const absolutePath = path.join(root, relativePath);
          content = await readFile(absolutePath, "utf8");
          lineCount = countLogicalLines(content);
          isContentLoaded = true;
        } catch {
          content = "";
          lineCount = 1;
          isContentLoaded = false;
        }
      }

      return {
        relativePath,
        content,
        isContentLoaded,
        filetype: resolveFileType(relativePath),
        typeLabel,
        typePriority: resolveTypePriority(typeLabel),
        lineCount,
        uncommittedLines: [] as number[],
        markAllLinesUncommitted: false as boolean,
      } satisfies WorkspaceCodeFileEntry;
    }),
  );

  const knownFiles = new Set(entries.map((entry) => entry.relativePath));
  const uncommitted = collectUncommittedLinesByFile(root, knownFiles);
  for (const entry of entries) {
    const lines = uncommitted.linesByFile.get(entry.relativePath) ?? new Set<number>();
    entry.uncommittedLines = [...lines].sort((a, b) => a - b);
    entry.markAllLinesUncommitted = uncommitted.wholeFileUncommitted.has(entry.relativePath);
  }

  return entries;
}

export async function listCodeFiles(root: string, ignoredDirs: ReadonlySet<string>): Promise<string[]> {
  const gitVisibleFiles = listGitWorkspaceFiles(root);
  if (gitVisibleFiles) {
    return gitVisibleFiles
      .filter((relativePath) => isCodeExtension(path.extname(relativePath).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  }

  const results: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!isCodeExtension(ext)) continue;
      const relativePath = path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/");
      results.push(relativePath);
    }
  };

  await walk(root);
  const sorted = results.sort((a, b) => a.localeCompare(b));
  return filterGitIgnored(root, sorted);
}

export async function watchWorkspace(
  root: string,
  ignoredDirs: ReadonlySet<string>,
  onChange: () => void,
  options: { changeDebounceMs?: number; rebuildDebounceMs?: number } = {},
): Promise<WorkspaceWatcher> {
  const changeDebounceMs = options.changeDebounceMs ?? 80;
  const rebuildDebounceMs = options.rebuildDebounceMs ?? 160;

  const watchers = new Map<string, FSWatcher>();
  let isClosed = false;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

  const emitChange = () => {
    if (isClosed) return;
    onChange();
  };

  const scheduleChange = () => {
    if (isClosed) return;
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      changeTimer = undefined;
      emitChange();
    }, changeDebounceMs);
  };

  const scheduleRebuild = () => {
    if (isClosed) return;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = undefined;
      void rebuildWatchers();
    }, rebuildDebounceMs);
  };

  const createWatcher = (dir: string) => {
    if (watchers.has(dir) || isClosed) return;

    try {
      const watcher = watch(dir, (eventType) => {
        scheduleChange();
        if (eventType === "rename") {
          scheduleRebuild();
        }
      });

      watcher.on("error", () => {
        scheduleRebuild();
        scheduleChange();
      });

      watchers.set(dir, watcher);
    } catch {
      scheduleRebuild();
    }
  };

  const rebuildWatchers = async () => {
    if (isClosed) return;

    const watchedDirs = await listWatchableDirs(root, ignoredDirs);
    if (isClosed) return;

    const nextSet = new Set(watchedDirs);

    for (const [dir, watcher] of watchers.entries()) {
      if (nextSet.has(dir)) continue;
      watcher.close();
      watchers.delete(dir);
    }

    for (const dir of watchedDirs) {
      createWatcher(dir);
    }
  };

  await rebuildWatchers();

  return {
    close: () => {
      isClosed = true;
      if (changeTimer) clearTimeout(changeTimer);
      if (rebuildTimer) clearTimeout(rebuildTimer);
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
    },
  };
}

function countLogicalLines(content: string): number {
  if (content.length === 0) return 1;
  return content.split("\n").length;
}

function listGitWorkspaceFiles(root: string): string[] | null {
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

function filterGitIgnored(root: string, files: string[]): string[] {
  if (files.length === 0) return files;

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

function filterGitIgnoredInRepository(root: string, files: string[]): string[] {
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

type UncommittedLinesSnapshot = {
  linesByFile: Map<string, Set<number>>;
  wholeFileUncommitted: Set<string>;
};

function collectUncommittedLinesByFile(
  root: string,
  knownFiles: ReadonlySet<string>,
): UncommittedLinesSnapshot {
  const probe = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
  });

  if (probe.status !== 0 || probe.stdout.trim() !== "true") {
    return {
      linesByFile: new Map(),
      wholeFileUncommitted: new Set(),
    };
  }

  const trackedOrStagedPatch = spawnSync(
    "git",
    [
      "-C",
      root,
      "-c",
      "core.quotepath=false",
      "diff",
      "--no-color",
      "--unified=0",
      "--no-ext-diff",
      "--no-prefix",
    ],
    { encoding: "utf8" },
  );

  const stagedPatch = spawnSync(
    "git",
    [
      "-C",
      root,
      "-c",
      "core.quotepath=false",
      "diff",
      "--cached",
      "--no-color",
      "--unified=0",
      "--no-ext-diff",
      "--no-prefix",
    ],
    { encoding: "utf8" },
  );

  const untracked = spawnSync("git", ["-C", root, "ls-files", "--others", "--exclude-standard", "-z"], {
    encoding: "utf8",
  });

  const linesByFile = new Map<string, Set<number>>();
  const wholeFileUncommitted = new Set<string>();
  mergePatchChangedLines(linesByFile, trackedOrStagedPatch.stdout ?? "");
  mergePatchChangedLines(linesByFile, stagedPatch.stdout ?? "");

  if (untracked.status === 0) {
    const untrackedFiles = new Set((untracked.stdout ?? "").split("\0").filter(Boolean));
    for (const filePath of untrackedFiles) {
      if (!knownFiles.has(filePath)) continue;
      wholeFileUncommitted.add(filePath);
    }
  }

  return {
    linesByFile,
    wholeFileUncommitted,
  };
}

function mergePatchChangedLines(target: Map<string, Set<number>>, patch: string): void {
  let currentPath: string | null = null;
  const lines = patch.split("\n");

  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      const nextPath = line.slice(4).trim();
      currentPath = nextPath === "/dev/null" ? null : nextPath;
      continue;
    }

    if (!currentPath) continue;
    if (!line.startsWith("@@ ")) continue;

    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;

    const start = Number.parseInt(match[1] ?? "0", 10);
    const count = Number.parseInt(match[2] ?? "1", 10);
    if (count <= 0 || Number.isNaN(start)) continue;

    const fileSet = target.get(currentPath) ?? new Set<number>();
    for (let lineNo = start; lineNo < start + count; lineNo += 1) {
      fileSet.add(lineNo);
    }
    target.set(currentPath, fileSet);
  }
}

async function listWatchableDirs(root: string, ignoredDirs: ReadonlySet<string>): Promise<string[]> {
  const gitVisibleFiles = listGitWorkspaceFiles(root);
  if (gitVisibleFiles) {
    return buildWatchableDirsFromFiles(root, gitVisibleFiles);
  }

  const dirs: string[] = [];

  async function walk(dir: string): Promise<void> {
    dirs.push(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (ignoredDirs.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      await walk(path.join(dir, entry.name));
    }
  }

  await walk(root);
  return dirs;
}

function buildWatchableDirsFromFiles(root: string, relativePaths: readonly string[]): string[] {
  const dirs = new Set<string>([root]);

  for (const relativePath of relativePaths) {
    let currentDir = path.dirname(path.join(root, relativePath));
    while (currentDir.startsWith(root)) {
      dirs.add(currentDir);
      if (currentDir === root) break;
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  return [...dirs].sort((a, b) => a.localeCompare(b));
}
