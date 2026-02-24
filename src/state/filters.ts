import type { CodeFileEntry } from "../types";
import { clamp } from "../utils/ui";
import type { StoreApi } from "./store";
import type { FiltersState, RootState } from "./types";

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
];
const CONFIG_FILES = ["json", "yaml", "yml", "toml", "xml", "ini", "conf", "config", "env", "properties"];
const TEXT_FILES = ["md", "txt", "rst", "log"];

function getTypePriority(type: string): number {
  const lower = type.toLowerCase();
  if (PROGRAMMING_LANGS.includes(lower)) return 0;
  if (CONFIG_FILES.includes(lower)) return 1;
  if (TEXT_FILES.includes(lower)) return 3;
  return 2;
}

export function initialFiltersState(): FiltersState {
  return {
    typeCounts: new Map(),
    sortedTypes: [],
    enabledTypes: new Map(),
  };
}

export function isTypeEnabled(state: RootState, type: string): boolean {
  return state.filters.enabledTypes.get(type) ?? false;
}

export function createFilterActions(store: StoreApi<RootState>) {
  return {
    recomputeFromEntries(entries: readonly CodeFileEntry[], actionChipCount = 0): void {
      store.update((state) => {
        const previousEnabled = new Map(state.filters.enabledTypes);
        const nextTypeCounts = new Map<string, number>();

        for (const entry of entries) {
          nextTypeCounts.set(entry.typeLabel, (nextTypeCounts.get(entry.typeLabel) ?? 0) + 1);
        }

        const sortedTypes = [...nextTypeCounts.keys()].sort((a, b) => {
          const pa = getTypePriority(a);
          const pb = getTypePriority(b);
          if (pa !== pb) return pa - pb;
          return a.localeCompare(b);
        });

        const nextEnabled = new Map<string, boolean>();
        for (const type of sortedTypes) {
          nextEnabled.set(type, previousEnabled.get(type) ?? true);
        }

        state.filters.typeCounts = nextTypeCounts;
        state.filters.sortedTypes = sortedTypes;
        state.filters.enabledTypes = nextEnabled;

        state.ui.selectedChipIndex = clamp(
          state.ui.selectedChipIndex,
          0,
          Math.max(0, sortedTypes.length + Math.max(0, actionChipCount) - 1),
        );
      });
    },
    toggleType(type: string): void {
      store.update((state) => {
        const enabled = state.filters.enabledTypes.get(type) ?? false;
        state.filters.enabledTypes.set(type, !enabled);
      });
    },
    moveChipSelection(delta: number, actionChipCount = 0): void {
      store.update((state) => {
        const chipCount = state.filters.sortedTypes.length + Math.max(0, actionChipCount);
        if (chipCount <= 0) return;
        const nextIndex = state.ui.selectedChipIndex + delta;
        state.ui.selectedChipIndex = ((nextIndex % chipCount) + chipCount) % chipCount;
      });
    },
    toggleSelectedType(actionChipCount = 0): string | null {
      let toggledType: string | null = null;
      store.update((state) => {
        const selectedChipIndex = state.ui.selectedChipIndex;
        const typeCount = state.filters.sortedTypes.length;
        if (selectedChipIndex >= typeCount + Math.max(0, actionChipCount)) {
          return;
        }
        if (selectedChipIndex >= typeCount) {
          return;
        }

        const selectedType = state.filters.sortedTypes[selectedChipIndex];
        if (!selectedType) return;
        const enabled = state.filters.enabledTypes.get(selectedType) ?? false;
        state.filters.enabledTypes.set(selectedType, !enabled);
        toggledType = selectedType;
      });
      return toggledType;
    },
  };
}
