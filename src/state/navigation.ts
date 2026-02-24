import { clamp } from "../utils/ui";
import type { NavigationState, RootState } from "./types";
import type { StoreApi } from "./store";

export function initialNavigationState(): NavigationState {
  return {
    cursor: {
      totalLines: 0,
      line: 1,
      visualMode: false,
      visualAnchorLine: 1,
    },
    camera: {
      preferredViewportOffset: 0,
      lastKnownScrollTop: 0,
      internalScrollUpdate: false,
      pendingProgrammaticScrolls: [],
    },
    pendingGChordAt: null,
    lastRepeatedMoveAt: 0,
  };
}

export function getSelectionRange(state: NavigationState): { start: number; end: number } {
  if (state.cursor.totalLines <= 0) {
    return { start: 0, end: 0 };
  }
  if (!state.cursor.visualMode) {
    return { start: state.cursor.line, end: state.cursor.line };
  }
  return {
    start: Math.min(state.cursor.visualAnchorLine, state.cursor.line),
    end: Math.max(state.cursor.visualAnchorLine, state.cursor.line),
  };
}

function pruneProgrammaticScrolls(state: NavigationState, ttlMs: number, now: number): void {
  const cutoff = now - ttlMs;
  state.camera.pendingProgrammaticScrolls = state.camera.pendingProgrammaticScrolls.filter(
    (entry) => entry.at >= cutoff,
  );
}

export function createNavigationActions(store: StoreApi<RootState>) {
  return {
    configureTotalLines(totalLines: number): void {
      store.update((state) => {
        state.navigation.cursor.totalLines = Math.max(0, totalLines);
        if (state.navigation.cursor.totalLines <= 0) {
          state.navigation.cursor.line = 1;
          state.navigation.cursor.visualAnchorLine = 1;
          return;
        }

        state.navigation.cursor.line = clamp(state.navigation.cursor.line, 1, state.navigation.cursor.totalLines);
        state.navigation.cursor.visualAnchorLine = clamp(
          state.navigation.cursor.visualAnchorLine,
          1,
          state.navigation.cursor.totalLines,
        );
      });
    },
    moveCursorBy(delta: number): number {
      let nextLine = 1;
      store.update((state) => {
        if (state.navigation.cursor.totalLines <= 0) {
          nextLine = state.navigation.cursor.line;
          return;
        }
        state.navigation.cursor.line = clamp(
          state.navigation.cursor.line + delta,
          1,
          state.navigation.cursor.totalLines,
        );
        nextLine = state.navigation.cursor.line;
      });
      return nextLine;
    },
    goToLine(targetLine: number): number {
      let nextLine = 1;
      store.update((state) => {
        if (state.navigation.cursor.totalLines <= 0) {
          nextLine = state.navigation.cursor.line;
          return;
        }
        state.navigation.cursor.line = clamp(targetLine, 1, state.navigation.cursor.totalLines);
        nextLine = state.navigation.cursor.line;
      });
      return nextLine;
    },
    setVisualMode(enabled: boolean): void {
      store.update((state) => {
        if (state.navigation.cursor.totalLines <= 0) return;
        state.navigation.cursor.visualMode = enabled;
        state.navigation.cursor.visualAnchorLine = state.navigation.cursor.line;
      });
    },
    toggleVisualMode(): boolean {
      let next = false;
      store.update((state) => {
        if (state.navigation.cursor.totalLines <= 0) {
          next = state.navigation.cursor.visualMode;
          return;
        }
        state.navigation.cursor.visualMode = !state.navigation.cursor.visualMode;
        state.navigation.cursor.visualAnchorLine = state.navigation.cursor.line;
        next = state.navigation.cursor.visualMode;
      });
      return next;
    },
    disableVisualMode(): void {
      store.update((state) => {
        if (!state.navigation.cursor.visualMode) return;
        state.navigation.cursor.visualMode = false;
        state.navigation.cursor.visualAnchorLine = state.navigation.cursor.line;
      });
    },
    setPreferredViewportOffset(offset: number): void {
      store.update((state) => {
        state.navigation.camera.preferredViewportOffset = Math.max(0, Math.round(offset));
      });
    },
    setLastKnownScrollTop(scrollTop: number): void {
      store.update((state) => {
        state.navigation.camera.lastKnownScrollTop = Math.max(0, Math.round(scrollTop));
      });
    },
    setInternalScrollUpdate(internal: boolean): void {
      store.update((state) => {
        state.navigation.camera.internalScrollUpdate = internal;
      });
    },
    trackProgrammaticScroll(top: number, at = Date.now(), maxEvents = 64, ttlMs = 400): void {
      store.update((state) => {
        const normalizedTop = Math.max(0, Math.round(top));
        pruneProgrammaticScrolls(state.navigation, ttlMs, at);
        state.navigation.camera.pendingProgrammaticScrolls.push({ top: normalizedTop, at });
        if (state.navigation.camera.pendingProgrammaticScrolls.length <= maxEvents) {
          return;
        }
        state.navigation.camera.pendingProgrammaticScrolls.splice(
          0,
          state.navigation.camera.pendingProgrammaticScrolls.length - maxEvents,
        );
      });
    },
    consumeProgrammaticScroll(top: number, now = Date.now(), ttlMs = 400): boolean {
      let consumed = false;
      store.update((state) => {
        const normalizedTop = Math.max(0, Math.round(top));
        pruneProgrammaticScrolls(state.navigation, ttlMs, now);
        const index = state.navigation.camera.pendingProgrammaticScrolls.findIndex(
          (entry) => entry.top === normalizedTop,
        );
        if (index < 0) return;
        state.navigation.camera.pendingProgrammaticScrolls.splice(index, 1);
        consumed = true;
      });
      return consumed;
    },
    resetChordState(): void {
      store.update((state) => {
        state.navigation.pendingGChordAt = null;
      });
    },
    markGChord(now = Date.now()): void {
      store.update((state) => {
        state.navigation.pendingGChordAt = now;
      });
    },
    consumeGChord(now = Date.now(), timeoutMs = 500): boolean {
      let matched = false;
      store.update((state) => {
        if (
          state.navigation.pendingGChordAt !== null &&
          now - state.navigation.pendingGChordAt <= timeoutMs
        ) {
          matched = true;
        }
        state.navigation.pendingGChordAt = null;
      });
      return matched;
    },
    shouldThrottleRepeatedMove(now = Date.now(), throttleMs = 14): boolean {
      let throttled = false;
      store.update((state) => {
        if (now - state.navigation.lastRepeatedMoveAt < throttleMs) {
          throttled = true;
          return;
        }
        state.navigation.lastRepeatedMoveAt = now;
      });
      return throttled;
    },
  };
}
