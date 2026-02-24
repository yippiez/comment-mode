export type CodeKeyAction =
  | "move_up"
  | "move_down"
  | "page_up"
  | "page_down"
  | "toggle_visual"
  | "collapse_file"
  | "yank_selection"
  | "open_prompt"
  | "escape_visual"
  | "quit";

export const CODE_KEYMAP: Record<string, CodeKeyAction> = {
  up: "move_up",
  k: "move_up",
  down: "move_down",
  j: "move_down",
  pageup: "page_up",
  pagedown: "page_down",
  v: "toggle_visual",
  c: "collapse_file",
  y: "yank_selection",
  enter: "open_prompt",
  return: "open_prompt",
  escape: "escape_visual",
  q: "quit",
};

export type ChipKeyAction = "move_left" | "move_right" | "toggle_chip";

export const CHIPS_KEYMAP: Record<string, ChipKeyAction> = {
  left: "move_left",
  right: "move_right",
  space: "toggle_chip",
  enter: "toggle_chip",
  return: "toggle_chip",
};
