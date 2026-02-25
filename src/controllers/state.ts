import type { CodeFileEntry, FocusMode, ViewMode } from "../types";
import { clamp } from "../utils/math";
import { getParentPosixPath } from "../utils/path";

export class AppStateStore {
  public focusMode: FocusMode = "code";
  public viewMode: ViewMode = "code";
  public selectedChipIndex = 0;
}

type RecomputeTypeStateResult = {
  typeCounts: Map<string, number>;
  sortedTypes: string[];
  enabledTypes: Map<string, boolean>;
  selectedChipIndex: number;
};

export function recomputeTypeState(
  entries: readonly CodeFileEntry[],
  previousEnabled: ReadonlyMap<string, boolean>,
  selectedChipIndex: number,
  actionChipCount: number,
): RecomputeTypeStateResult {
  const typeCounts = new Map<string, number>();
  const typePriorities = new Map<string, number>();
  for (const entry of entries) {
    typeCounts.set(entry.typeLabel, (typeCounts.get(entry.typeLabel) ?? 0) + 1);
    const existingPriority = typePriorities.get(entry.typeLabel);
    if (existingPriority === undefined || entry.typePriority < existingPriority) {
      typePriorities.set(entry.typeLabel, entry.typePriority);
    }
  }

  const sortedTypes = [...typeCounts.keys()].sort((a, b) => {
    const pa = typePriorities.get(a) ?? 2;
    const pb = typePriorities.get(b) ?? 2;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  const enabledTypes = new Map<string, boolean>();
  for (const type of sortedTypes) {
    enabledTypes.set(type, previousEnabled.get(type) ?? true);
  }

  return {
    typeCounts,
    sortedTypes,
    enabledTypes,
    selectedChipIndex: clamp(selectedChipIndex, 0, Math.max(0, sortedTypes.length + actionChipCount - 1)),
  };
}

export function ensureFilesModeDirectoryVisible(
  entries: readonly CodeFileEntry[],
  directoryPath: string,
): string {
  let directory = directoryPath;
  while (directory.length > 0) {
    const hasVisibleChild = entries.some((entry) => entry.relativePath.startsWith(`${directory}/`));
    if (hasVisibleChild) break;
    directory = getParentPosixPath(directory);
  }
  return directory;
}
