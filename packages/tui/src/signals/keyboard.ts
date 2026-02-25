import type { KeyEvent } from "@opentui/core";
import type { PromptComposerField } from "../components/prompt-composer-bar";
import { SIGNALS } from "./catalog";
import { emit, SignalGroup } from "./core";
import type { FocusMode } from "../types";
import { CHIPS_KEYMAP, CODE_KEYMAP } from "../shortcuts";
import { subscribeToSource, type EventSource } from "./subscription";

type KeypressSource = EventSource<"keypress", (key: KeyEvent) => void>;

export type KeyboardStateSnapshot = {
  promptVisible: boolean;
  focusMode: FocusMode;
  viewMode: "code" | "files";
  promptField: PromptComposerField | null;
};

export function registerKeyboardSignalBindings(
  source: KeypressSource,
  getState: () => KeyboardStateSnapshot,
): () => void {
  let pendingLeaderAt: number | null = null;
  let pendingGChordAt: number | null = null;
  const leaderTimeoutMs = 500;
  const gChordTimeoutMs = 500;

  const consumeKey = (key: KeyEvent): void => {
    key.preventDefault?.();
    key.stopPropagation?.();
  };

  const emitHandled = (key: KeyEvent, signalGroup: SignalGroup, ...args: unknown[]): void => {
    consumeKey(key);
    emit(signalGroup, ...args);
  };

  const routePrompt = (keyName: string, key: KeyEvent): void => {
    if (keyName === "escape") {
      emitHandled(key, SIGNALS.promptClose);
      return;
    }

    if (keyName === "tab") {
      emitHandled(key, SIGNALS.promptFieldCycle, 1);
      return;
    }

    const { promptField } = getState();
    if (promptField === "model") {
      if (keyName === "left" || keyName === "up") {
        emitHandled(key, SIGNALS.promptModelCycle, -1);
        return;
      }
      if (keyName === "right" || keyName === "down") {
        emitHandled(key, SIGNALS.promptModelCycle, 1);
        return;
      }
      if (keyName === "r") {
        emitHandled(key, SIGNALS.promptModelsRefresh);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        emitHandled(key, SIGNALS.promptFieldCycle, 1);
      }
      return;
    }

    if (promptField === "thinking") {
      if (keyName === "left" || keyName === "up") {
        emitHandled(key, SIGNALS.promptThinkingCycle, -1);
        return;
      }
      if (keyName === "right" || keyName === "down") {
        emitHandled(key, SIGNALS.promptThinkingCycle, 1);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        emitHandled(key, SIGNALS.promptFieldCycle, -2);
        return;
      }
    }

    if (keyName === "return" || keyName === "enter") {
      emitHandled(key, SIGNALS.promptSubmit);
      return;
    }

    emit(SIGNALS.promptInputKey, key);
  };

  const routeCode = (keyName: string, rawKeyName: string | undefined, key: KeyEvent): void => {
    const now = Date.now();
    const leaderActive = pendingLeaderAt !== null && now - pendingLeaderAt <= leaderTimeoutMs;
    if (leaderActive && keyName === "o") {
      pendingLeaderAt = null;
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.filesToggleExplorer);
      return;
    }

    const { viewMode } = getState();
    if (keyName === "space" && viewMode !== "files") {
      pendingLeaderAt = now;
      return;
    }

    if (keyName === "o" && viewMode === "files") {
      pendingLeaderAt = null;
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.filesToggleExplorer);
      return;
    }

    pendingLeaderAt = null;

    const mappedAction = CODE_KEYMAP[keyName];
    if (mappedAction === "escape_visual") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.visualExit);
      return;
    }

    const isShiftG = keyName === "g" && (Boolean(key.shift) || rawKeyName === "G");
    if (isShiftG) {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.navJumpBottom);
      return;
    }

    if (keyName === "g" && !key.shift) {
      if (pendingGChordAt !== null && now - pendingGChordAt <= gChordTimeoutMs) {
        pendingGChordAt = null;
        emitHandled(key, SIGNALS.navJumpTop);
      } else {
        pendingGChordAt = now;
      }
      return;
    }

    if (keyName === "n") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.navJumpNextFile);
      return;
    }

    if (keyName === "p") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.navJumpPrevFile);
      return;
    }

    if (keyName === "a") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.navJumpNextAgent);
      return;
    }

    if (keyName === "x") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.agentDeleteAtCursor);
      return;
    }

    pendingGChordAt = null;

    if (mappedAction === "open_prompt") {
      emitHandled(key, SIGNALS.filesEnterOrOpen);
      return;
    }

    if (mappedAction === "move_up") {
      emitHandled(key, SIGNALS.cursorMove, -1, Boolean(key.repeated));
      return;
    }

    if (mappedAction === "move_down") {
      emitHandled(key, SIGNALS.cursorMove, 1, Boolean(key.repeated));
      return;
    }

    if (mappedAction === "page_up") {
      emitHandled(key, SIGNALS.cursorPage, -1);
      return;
    }

    if (mappedAction === "page_down") {
      emitHandled(key, SIGNALS.cursorPage, 1);
      return;
    }

    if (mappedAction === "toggle_visual") {
      emitHandled(key, SIGNALS.visualToggle);
      return;
    }

    if (mappedAction === "yank_selection") {
      emitHandled(key, SIGNALS.selectionYank);
      return;
    }

    if (keyName === "space" && viewMode === "files") {
      emitHandled(key, SIGNALS.filesEnterDirectory);
      return;
    }

    if (keyName === "backspace" && viewMode === "files") {
      emitHandled(key, SIGNALS.filesParentDir);
      return;
    }

    if (mappedAction === "collapse_file") {
      emitHandled(key, SIGNALS.filesCollapseCurrent);
      return;
    }

    if (mappedAction === "quit") {
      emitHandled(key, SIGNALS.appQuit);
    }
  };

  const onKeypress = (key: KeyEvent): void => {
    const keyName = (key.name ?? "").toLowerCase();
    const rawKeyName = key.name;
    const state = getState();

    if (state.promptVisible) {
      routePrompt(keyName, key);
      return;
    }

    if (keyName === "t") {
      emitHandled(key, SIGNALS.themeToggle);
      return;
    }

    if (keyName === "tab") {
      emitHandled(key, SIGNALS.focusToggleCodeChips);
      return;
    }

    if (state.focusMode === "chips") {
      const action = CHIPS_KEYMAP[keyName];
      if (action === "move_left") {
        emitHandled(key, SIGNALS.chipsMove, -1);
        return;
      }
      if (action === "move_right") {
        emitHandled(key, SIGNALS.chipsMove, 1);
        return;
      }
      if (action === "toggle_chip") {
        emitHandled(key, SIGNALS.chipsToggleSelected);
      }
      return;
    }

    routeCode(keyName, rawKeyName, key);
  };

  return subscribeToSource(source, "keypress", onKeypress);
}
