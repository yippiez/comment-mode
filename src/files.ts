import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFiletype } from "@opentui/core";
import { CODE_EXTENSIONS, IGNORE_DIRS } from "./config";
import type { CodeFileEntry } from "./types";

export async function listCodeFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) continue;
      results.push(path.relative(root, path.join(dir, entry.name)));
    }
  }

  await walk(root);
  const sorted = results.sort((a, b) => a.localeCompare(b));
  return filterGitIgnored(root, sorted);
}

export async function loadCodeFileEntries(root: string): Promise<CodeFileEntry[]> {
  const files = await listCodeFiles(root);
  const entries = await Promise.all(
    files.map(async (relativePath) => {
      const absolutePath = path.join(root, relativePath);
      const content = await readFile(absolutePath, "utf8");
      const filetype = resolveFiletype(relativePath);
      const typeLabel = resolveTypeLabel(relativePath);
      return {
        relativePath,
        content,
        filetype,
        typeLabel,
        lineCount: countLogicalLines(content),
        uncommittedLines: new Set<number>(),
      };
    }),
  );

  const linesByFile = collectUncommittedLinesByFile(root, entries);
  for (const entry of entries) {
    entry.uncommittedLines = linesByFile.get(entry.relativePath) ?? new Set<number>();
  }

  return entries;
}

export function countLogicalLines(content: string): number {
  if (content.length === 0) return 1;
  return content.split("\n").length;
}

function filterGitIgnored(root: string, files: string[]): string[] {
  if (files.length === 0) return files;

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

  // git check-ignore returns:
  // 0 -> at least one ignored path matched
  // 1 -> no ignored paths matched
  if (checkIgnore.status !== 0 && checkIgnore.status !== 1) {
    return files;
  }

  const ignored = new Set(checkIgnore.stdout.split("\0").filter(Boolean));
  return files.filter((file) => !ignored.has(file));
}

function resolveFiletype(relativePath: string): string | undefined {
  const detected = pathToFiletype(relativePath);
  if (detected === "typescriptreact") return "typescript";
  if (detected === "javascriptreact") return "javascript";
  return detected;
}

function resolveTypeLabel(relativePath: string): string {
  const ext = path.extname(relativePath);
  if (!ext) return "NOEXT";
  return ext.slice(1).toUpperCase();
}

function collectUncommittedLinesByFile(
  root: string,
  entries: CodeFileEntry[],
): Map<string, Set<number>> {
  const probe = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], {
    encoding: "utf8",
  });

  if (probe.status !== 0 || probe.stdout.trim() !== "true") {
    return new Map();
  }

  const trackedOrStagedPatch = spawnSync(
    "git",
    ["-C", root, "-c", "core.quotepath=false", "diff", "--no-color", "--unified=0", "--no-ext-diff", "--no-prefix"],
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

  const untracked = spawnSync(
    "git",
    ["-C", root, "ls-files", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  );

  const linesByFile = new Map<string, Set<number>>();
  mergePatchChangedLines(linesByFile, trackedOrStagedPatch.stdout ?? "");
  mergePatchChangedLines(linesByFile, stagedPatch.stdout ?? "");

  if (untracked.status === 0) {
    const untrackedFiles = new Set((untracked.stdout ?? "").split("\0").filter(Boolean));
    for (const entry of entries) {
      if (!untrackedFiles.has(entry.relativePath)) continue;
      const allLines = new Set<number>();
      for (let line = 1; line <= entry.lineCount; line += 1) {
        allLines.add(line);
      }
      linesByFile.set(entry.relativePath, allLines);
    }
  }

  return linesByFile;
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
