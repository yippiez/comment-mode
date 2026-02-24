import type { FocusMode, ViewMode } from "../types";
import type { StoreApi } from "./store";
import type { RootState, UiState } from "./types";

const VIEW_MODE_ORDER: readonly ViewMode[] = ["code", "files"];

export function initialUiState(): UiState {
  return {
    focusMode: "code",
    viewMode: "code",
    selectedChipIndex: 0,
  };
}

export function createUiActions(store: StoreApi<RootState>) {
  return {
    setFocusMode(mode: FocusMode): void {
      store.update((state) => {
        state.ui.focusMode = mode;
      });
    },
    setSelectedChipIndex(index: number): void {
      store.update((state) => {
        state.ui.selectedChipIndex = Math.max(0, Math.floor(index));
      });
    },
    setViewMode(mode: ViewMode): void {
      store.update((state) => {
        state.ui.viewMode = mode;
      });
    },
    cycleViewMode(): ViewMode {
      let nextMode: ViewMode = "code";
      store.update((state) => {
        const currentIndex = VIEW_MODE_ORDER.indexOf(state.ui.viewMode);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = (safeIndex + 1) % VIEW_MODE_ORDER.length;
        nextMode = VIEW_MODE_ORDER[nextIndex] ?? "code";
        state.ui.viewMode = nextMode;
      });
      return nextMode;
    },
  };
}
