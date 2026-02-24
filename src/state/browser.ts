import type { CodeFileEntry } from "../types";
import type { BrowserState, RootState } from "./types";
import type { StoreApi } from "./store";

export function initialBrowserState(): BrowserState {
  return {
    collapsedFiles: new Set(),
    filesModeDirectoryPath: "",
  };
}

export function normalizeDirectoryPath(directoryPath: string): string {
  if (!directoryPath) return "";
  return directoryPath
    .split("/")
    .filter(Boolean)
    .join("/");
}

export function parentDirectoryPath(directoryPath: string): string {
  const normalized = normalizeDirectoryPath(directoryPath);
  if (!normalized) return "";
  const parts = normalized.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

export function createBrowserActions(store: StoreApi<RootState>) {
  return {
    setFilesModeDirectoryPath(path: string): void {
      store.update((state) => {
        state.browser.filesModeDirectoryPath = normalizeDirectoryPath(path);
      });
    },
    goToParentDirectory(): string {
      let nextPath = "";
      store.update((state) => {
        const parent = parentDirectoryPath(state.browser.filesModeDirectoryPath);
        if (parent === state.browser.filesModeDirectoryPath) {
          nextPath = state.browser.filesModeDirectoryPath;
          return;
        }
        state.browser.filesModeDirectoryPath = parent;
        nextPath = parent;
      });
      return nextPath;
    },
    ensureFilesModeDirectoryVisible(entries: readonly CodeFileEntry[]): void {
      store.update((state) => {
        let directory = state.browser.filesModeDirectoryPath;
        while (directory.length > 0) {
          const hasVisibleChild = entries.some((entry) => entry.relativePath.startsWith(`${directory}/`));
          if (hasVisibleChild) break;
          directory = parentDirectoryPath(directory);
        }
        state.browser.filesModeDirectoryPath = directory;
      });
    },
    toggleCollapsedFile(filePath: string): boolean {
      let collapsed = false;
      store.update((state) => {
        if (state.browser.collapsedFiles.has(filePath)) {
          state.browser.collapsedFiles.delete(filePath);
          collapsed = false;
          return;
        }
        state.browser.collapsedFiles.add(filePath);
        collapsed = true;
      });
      return collapsed;
    },
    pruneCollapsedFiles(entries: readonly CodeFileEntry[]): void {
      store.update((state) => {
        const existing = new Set(entries.map((entry) => entry.relativePath));
        for (const filePath of state.browser.collapsedFiles) {
          if (existing.has(filePath)) continue;
          state.browser.collapsedFiles.delete(filePath);
        }
      });
    },
  };
}
