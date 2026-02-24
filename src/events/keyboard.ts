import type { KeyEvent } from "@opentui/core";
import type { FocusMode } from "../types";
import { subscribeToEvent, type EventSource } from "./subscription";

type KeypressSource = EventSource<"keypress", (key: KeyEvent) => void>;

export type KeyboardStateSnapshot = {
  promptVisible: boolean;
  focusMode: FocusMode;
};

export type KeyboardAction =
  | { type: "toggle_theme"; key: KeyEvent }
  | { type: "switch_view_mode"; key: KeyEvent }
  | { type: "consume_only"; key: KeyEvent }
  | { type: "prompt_keypress"; keyName: string; rawKeyName: string | undefined; key: KeyEvent }
  | { type: "toggle_focus_mode"; key: KeyEvent }
  | { type: "chips_keypress"; keyName: string; key: KeyEvent }
  | { type: "code_keypress"; keyName: string; rawKeyName: string | undefined; key: KeyEvent };

export function registerKeyboardEvents(
  source: KeypressSource,
  getState: () => KeyboardStateSnapshot,
  dispatch: (action: KeyboardAction) => void,
): () => void {
  const onKeypress = (key: KeyEvent): void => {
    const keyName = normalizeKeyName(key.name);
    const rawKeyName = key.name;
    const state = getState();

    if (keyName === "t" && !state.promptVisible) {
      dispatch({ type: "toggle_theme", key });
      return;
    }

    if (keyName === "m" && !state.promptVisible) {
      dispatch({ type: "switch_view_mode", key });
      return;
    }

    if (state.promptVisible) {
      dispatch({ type: "prompt_keypress", keyName, rawKeyName, key });
      return;
    }

    if (keyName === "tab") {
      dispatch({ type: "toggle_focus_mode", key });
      return;
    }

    if (state.focusMode === "chips") {
      dispatch({ type: "chips_keypress", keyName, key });
      return;
    }

    dispatch({ type: "code_keypress", keyName, rawKeyName, key });
  };

  return subscribeToEvent(source, "keypress", onKeypress);
}

function normalizeKeyName(name: string | undefined): string {
  return (name ?? "").toLowerCase();
}
