import type { KeyEvent } from "@opentui/core";
import type { PromptComposerField } from "../components/prompt-composer-bar";
import type { FocusMode } from "../types";
import { CHIPS_KEYMAP, CODE_KEYMAP } from "../shortcuts";
import { subscribeToEvent, type EventSource } from "./subscription";

type KeypressSource = EventSource<"keypress", (key: KeyEvent) => void>;

export type KeyboardStateSnapshot = {
  promptVisible: boolean;
  focusMode: FocusMode;
  viewMode: "code" | "files";
  promptField: PromptComposerField | null;
};

export type KeyboardAction =
  | { type: "none" }
  | { type: "theme.toggle" }
  | { type: "focus.toggle_code_chips" }
  | { type: "app.quit" }
  | { type: "chips.move"; delta: -1 | 1 }
  | { type: "chips.toggle_selected" }
  | { type: "cursor.move"; delta: -1 | 1; repeated: boolean }
  | { type: "cursor.page"; delta: -1 | 1 }
  | { type: "visual.toggle" }
  | { type: "visual.exit" }
  | { type: "selection.yank" }
  | { type: "files.enter_or_open" }
  | { type: "files.parent_dir" }
  | { type: "files.toggle_explorer" }
  | { type: "files.enter_directory" }
  | { type: "files.open_selected_file" }
  | { type: "files.collapse_current" }
  | { type: "nav.jump"; target: "top" | "bottom" | "next_file" | "prev_file" | "next_agent" }
  | { type: "agent.delete_at_cursor" }
  | { type: "prompt.close" }
  | { type: "prompt.submit" }
  | { type: "prompt.field.cycle"; delta: -2 | -1 | 1 }
  | { type: "prompt.model.cycle"; delta: -1 | 1 }
  | { type: "prompt.thinking.cycle"; delta: -1 | 1 }
  | { type: "prompt.models.refresh" }
  | { type: "prompt.input_key" };

export type KeyboardHandlers = {
  dispatch: (action: KeyboardAction, key: KeyEvent) => void;
};

export function registerKeyboardEvents(
  source: KeypressSource,
  getState: () => KeyboardStateSnapshot,
  handlers: KeyboardHandlers,
): () => void {
  let pendingLeaderAt: number | null = null;
  let pendingGChordAt: number | null = null;
  const leaderTimeoutMs = 500;
  const gChordTimeoutMs = 500;

  const dispatch = (action: KeyboardAction, key: KeyEvent): void => {
    handlers.dispatch(action, key);
  };

  const routePrompt = (keyName: string, key: KeyEvent): void => {
    if (keyName === "escape") {
      dispatch({ type: "prompt.close" }, key);
      return;
    }

    if (keyName === "tab") {
      dispatch({ type: "prompt.field.cycle", delta: 1 }, key);
      return;
    }

    const { promptField } = getState();
    if (promptField === "model") {
      if (keyName === "left" || keyName === "up") {
        dispatch({ type: "prompt.model.cycle", delta: -1 }, key);
        return;
      }
      if (keyName === "right" || keyName === "down") {
        dispatch({ type: "prompt.model.cycle", delta: 1 }, key);
        return;
      }
      if (keyName === "r") {
        dispatch({ type: "prompt.models.refresh" }, key);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        dispatch({ type: "prompt.field.cycle", delta: 1 }, key);
        return;
      }
      dispatch({ type: "none" }, key);
      return;
    }

    if (promptField === "thinking") {
      if (keyName === "left" || keyName === "up") {
        dispatch({ type: "prompt.thinking.cycle", delta: -1 }, key);
        return;
      }
      if (keyName === "right" || keyName === "down") {
        dispatch({ type: "prompt.thinking.cycle", delta: 1 }, key);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        dispatch({ type: "prompt.field.cycle", delta: -2 }, key);
        return;
      }
    }

    if (keyName === "return" || keyName === "enter") {
      dispatch({ type: "prompt.submit" }, key);
      return;
    }

    dispatch({ type: "prompt.input_key" }, key);
  };

  const routeCode = (keyName: string, rawKeyName: string | undefined, key: KeyEvent): void => {
    const now = Date.now();
    const leaderActive = pendingLeaderAt !== null && now - pendingLeaderAt <= leaderTimeoutMs;
    if (leaderActive && keyName === "o") {
      pendingLeaderAt = null;
      pendingGChordAt = null;
      dispatch({ type: "files.toggle_explorer" }, key);
      return;
    }

    const { viewMode } = getState();
    if (keyName === "space" && viewMode !== "files") {
      pendingLeaderAt = now;
      dispatch({ type: "none" }, key);
      return;
    }

    if (keyName === "o" && viewMode === "files") {
      pendingLeaderAt = null;
      pendingGChordAt = null;
      dispatch({ type: "files.toggle_explorer" }, key);
      return;
    }

    pendingLeaderAt = null;

    const mappedAction = CODE_KEYMAP[keyName];
    if (mappedAction === "escape_visual") {
      pendingGChordAt = null;
      dispatch({ type: "visual.exit" }, key);
      return;
    }

    const isShiftG = keyName === "g" && (Boolean(key.shift) || rawKeyName === "G");
    if (isShiftG) {
      pendingGChordAt = null;
      dispatch({ type: "nav.jump", target: "bottom" }, key);
      return;
    }

    if (keyName === "g" && !key.shift) {
      if (pendingGChordAt !== null && now - pendingGChordAt <= gChordTimeoutMs) {
        pendingGChordAt = null;
        dispatch({ type: "nav.jump", target: "top" }, key);
      } else {
        pendingGChordAt = now;
        dispatch({ type: "none" }, key);
      }
      return;
    }

    if (keyName === "n") {
      pendingGChordAt = null;
      dispatch({ type: "nav.jump", target: "next_file" }, key);
      return;
    }

    if (keyName === "p") {
      pendingGChordAt = null;
      dispatch({ type: "nav.jump", target: "prev_file" }, key);
      return;
    }

    if (keyName === "a") {
      pendingGChordAt = null;
      dispatch({ type: "nav.jump", target: "next_agent" }, key);
      return;
    }

    if (keyName === "x") {
      pendingGChordAt = null;
      dispatch({ type: "agent.delete_at_cursor" }, key);
      return;
    }

    pendingGChordAt = null;

    if (mappedAction === "open_prompt") {
      dispatch({ type: "files.enter_or_open" }, key);
      return;
    }

    if (mappedAction === "move_up") {
      dispatch({ type: "cursor.move", delta: -1, repeated: Boolean(key.repeated) }, key);
      return;
    }

    if (mappedAction === "move_down") {
      dispatch({ type: "cursor.move", delta: 1, repeated: Boolean(key.repeated) }, key);
      return;
    }

    if (mappedAction === "page_up") {
      dispatch({ type: "cursor.page", delta: -1 }, key);
      return;
    }

    if (mappedAction === "page_down") {
      dispatch({ type: "cursor.page", delta: 1 }, key);
      return;
    }

    if (mappedAction === "toggle_visual") {
      dispatch({ type: "visual.toggle" }, key);
      return;
    }

    if (mappedAction === "yank_selection") {
      dispatch({ type: "selection.yank" }, key);
      return;
    }

    if (keyName === "space" && viewMode === "files") {
      dispatch({ type: "files.enter_directory" }, key);
      return;
    }

    if (keyName === "backspace" && viewMode === "files") {
      dispatch({ type: "files.parent_dir" }, key);
      return;
    }

    if (mappedAction === "collapse_file") {
      dispatch({ type: "files.collapse_current" }, key);
      return;
    }

    if (mappedAction === "quit") {
      dispatch({ type: "app.quit" }, key);
      return;
    }

    dispatch({ type: "none" }, key);
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
      dispatch({ type: "theme.toggle" }, key);
      return;
    }

    if (keyName === "tab") {
      dispatch({ type: "focus.toggle_code_chips" }, key);
      return;
    }

    if (state.focusMode === "chips") {
      const action = CHIPS_KEYMAP[keyName];
      if (action === "move_left") {
        dispatch({ type: "chips.move", delta: -1 }, key);
        return;
      }
      if (action === "move_right") {
        dispatch({ type: "chips.move", delta: 1 }, key);
        return;
      }
      if (action === "toggle_chip") {
        dispatch({ type: "chips.toggle_selected" }, key);
        return;
      }
      dispatch({ type: "none" }, key);
      return;
    }

    routeCode(keyName, rawKeyName, key);
  };

  return subscribeToEvent(source, "keypress", onKeypress);
}
