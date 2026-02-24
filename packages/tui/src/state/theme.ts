import { clamp } from "../utils/ui";
import type { RootState, ThemeState } from "./types";
import type { StoreApi } from "./store";

export function initialThemeState(): ThemeState {
  return {
    currentThemeIndex: 0,
  };
}

export function createThemeActions(store: StoreApi<RootState>) {
  return {
    setThemeIndex(index: number, totalThemes: number): number {
      let next = 0;
      store.update((state) => {
        if (totalThemes <= 0) {
          state.theme.currentThemeIndex = 0;
          next = 0;
          return;
        }
        next = clamp(Math.round(index), 0, totalThemes - 1);
        state.theme.currentThemeIndex = next;
      });
      return next;
    },
    cycleTheme(totalThemes: number): number {
      let next = 0;
      store.update((state) => {
        if (totalThemes <= 0) {
          state.theme.currentThemeIndex = 0;
          next = 0;
          return;
        }
        next = (state.theme.currentThemeIndex + 1) % totalThemes;
        state.theme.currentThemeIndex = next;
      });
      return next;
    },
  };
}
