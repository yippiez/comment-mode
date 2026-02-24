import type { CodeFileEntry } from "../types";

export function getParentDirectoryPath(filePath: string): string {
  const normalized = filePath
    .split("/")
    .filter(Boolean)
    .join("/");
  if (!normalized) return "";
  const parts = normalized.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

export function ensureFilesModeDirectoryVisible(
  entries: readonly CodeFileEntry[],
  directoryPath: string,
): string {
  let directory = directoryPath;
  while (directory.length > 0) {
    const hasVisibleChild = entries.some((entry) => {
      return entry.relativePath.startsWith(`${directory}/`);
    });
    if (hasVisibleChild) break;
    directory = getParentDirectoryPath(directory);
  }
  return directory;
}
