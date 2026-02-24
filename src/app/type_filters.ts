import type { CodeFileEntry } from "../types";
import { clamp } from "../utils/ui";

const PROGRAMMING_LANGS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "rb",
  "php",
  "swift",
  "kt",
  "scala",
  "vue",
  "svelte",
] as const;

const CONFIG_FILES = [
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "ini",
  "conf",
  "config",
  "env",
  "properties",
] as const;

const TEXT_FILES = ["md", "txt", "rst", "log"] as const;

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
  for (const entry of entries) {
    typeCounts.set(entry.typeLabel, (typeCounts.get(entry.typeLabel) ?? 0) + 1);
  }

  const sortedTypes = [...typeCounts.keys()].sort((a, b) => {
    const pa = getPriority(a);
    const pb = getPriority(b);
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
    selectedChipIndex: clamp(
      selectedChipIndex,
      0,
      Math.max(0, sortedTypes.length + actionChipCount - 1),
    ),
  };
}

function getPriority(type: string): number {
  const lower = type.toLowerCase();
  if (PROGRAMMING_LANGS.includes(lower as (typeof PROGRAMMING_LANGS)[number])) return 0;
  if (CONFIG_FILES.includes(lower as (typeof CONFIG_FILES)[number])) return 1;
  if (TEXT_FILES.includes(lower as (typeof TEXT_FILES)[number])) return 3;
  return 2;
}
