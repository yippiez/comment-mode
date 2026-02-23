export type ShortcutSection = {
  title: string;
  entries: Array<{ keys: string; description: string }>;
};

export type CodeKeyAction =
  | "move_up"
  | "move_down"
  | "page_up"
  | "page_down"
  | "toggle_visual"
  | "collapse_file"
  | "toggle_diff"
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
  d: "toggle_diff",
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

export const SHORTCUTS_SECTIONS: ShortcutSection[] = [
  {
    title: "Global",
    entries: [
      { keys: "q", description: "Quit the application" },
      { keys: "?", description: "Toggle this help popup" },
      { keys: "t", description: "Toggle color theme" },
      { keys: "m", description: "Switch view mode" },
      { keys: "Tab", description: "Switch focus between chips and code" },
      { keys: "Esc", description: "Close help popup" },
    ],
  },
  {
    title: "Code",
    entries: [
      { keys: "Up / k", description: "Move cursor up" },
      { keys: "Down / j", description: "Move cursor down" },
      { keys: "PageUp", description: "Move cursor one page up" },
      { keys: "PageDown", description: "Move cursor one page down" },
      { keys: "v", description: "Toggle visual selection mode" },
      { keys: "Esc", description: "Exit visual selection mode" },
      { keys: "gg", description: "Jump to top" },
      { keys: "G", description: "Jump to bottom" },
      { keys: "n", description: "Jump to next file start" },
      { keys: "p", description: "Jump to previous file start" },
      { keys: "a", description: "Jump to next agent prompt" },
      { keys: "x", description: "Delete current agent prompt" },
      { keys: "c", description: "Toggle collapse current file" },
      { keys: "Space (FILES)", description: "Enter current folder" },
      { keys: "Backspace (FILES)", description: "Go to parent folder" },
      { keys: "d", description: "Toggle diff collapse mode" },
      { keys: "y", description: "Copy selected content to clipboard" },
      { keys: "Enter", description: "Open agent prompt composer" },
    ],
  },
  {
    title: "Chips",
    entries: [
      { keys: "Left/Right", description: "Move selected chip" },
      { keys: "Space/Enter", description: "Toggle selected chip" },
    ],
  },
];
