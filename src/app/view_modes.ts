import type { BlockKind, CodeFileEntry } from "../types";
import { getParentPosixPath, normalizePosixPath } from "../utils/path";

export type ModeSelectionLineInfo = {
  globalLine: number;
  filePath: string;
  fileLine: number | null;
  text: string;
  blockKind: BlockKind;
};

export type FileTreeRow = {
  key: string;
  kind: "dir" | "file";
  path: string;
  filePath: string;
  depth: number;
  label: string;
  lineCount?: number;
  childFileCount?: number;
};

export function buildFileTreeRows(
  entries: readonly CodeFileEntry[],
  currentDirectoryPath: string,
): FileTreeRow[] {
  const directoryPath = normalizePosixPath(currentDirectoryPath);
  const prefix = directoryPath.length > 0 ? `${directoryPath}/` : "";
  const rows: FileTreeRow[] = [];

  if (directoryPath.length > 0) {
    const parentPath = getParentPosixPath(directoryPath);
    rows.push({
      key: `dir:${parentPath}:up`,
      kind: "dir",
      path: parentPath,
      filePath: parentPath,
      depth: 0,
      label: "../",
    });
  }

  const childDirectories = new Map<string, number>();
  const childFiles: Array<{ path: string; name: string; lineCount: number }> = [];

  for (const entry of entries) {
    if (prefix.length > 0 && !entry.relativePath.startsWith(prefix)) continue;
    const relative = prefix.length > 0 ? entry.relativePath.slice(prefix.length) : entry.relativePath;
    if (!relative) continue;

    const slashIndex = relative.indexOf("/");
    if (slashIndex >= 0) {
      const directoryName = relative.slice(0, slashIndex);
      const directoryFullPath = prefix.length > 0 ? `${directoryPath}/${directoryName}` : directoryName;
      childDirectories.set(directoryFullPath, (childDirectories.get(directoryFullPath) ?? 0) + 1);
      continue;
    }

    childFiles.push({
      path: entry.relativePath,
      name: relative,
      lineCount: entry.lineCount,
    });
  }

  const sortedDirectories = [...childDirectories.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [directoryFullPath, fileCount] of sortedDirectories) {
    const directoryName = directoryFullPath.split("/").pop() ?? directoryFullPath;
    rows.push({
      key: `dir:${directoryFullPath}`,
      kind: "dir",
      path: directoryFullPath,
      filePath: directoryFullPath,
      depth: 0,
      label: `${directoryName}/`,
      childFileCount: fileCount,
    });
  }

  const sortedFiles = [...childFiles].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sortedFiles) {
    rows.push({
      key: `file:${file.path}`,
      kind: "file",
      path: file.path,
      filePath: file.path,
      depth: 0,
      label: file.name,
      lineCount: file.lineCount,
    });
  }

  return rows;
}
