import { BoxRenderable, TextAttributes, TextRenderable, type CliRenderer } from "@opentui/core";

export type AgentRowDecoration = {
  row: BoxRenderable;
  text: TextRenderable;
  baseBg: string;
  baseFg: string;
  selectedBg: string;
  selectedFg: string;
  cursorBg: string;
  cursorFg: string;
};

type AgentRowOptions = {
  content: string;
  baseBg: string;
  baseFg: string;
  selectedBg: string;
  selectedFg: string;
  cursorBg: string;
  cursorFg: string;
  paddingLeft?: number;
  paddingRight?: number;
  bold?: boolean;
};

export function createAgentRow(
  renderer: CliRenderer,
  options: AgentRowOptions,
): AgentRowDecoration {
  const row = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "row",
    backgroundColor: options.baseBg,
    paddingLeft: options.paddingLeft,
    paddingRight: options.paddingRight,
  });

  const text = new TextRenderable(renderer, {
    content: options.content,
    fg: options.baseFg,
    width: "100%",
    overflow: "hidden",
    truncate: true,
    wrapMode: "none",
    attributes: options.bold ? TextAttributes.BOLD : TextAttributes.NONE,
  });

  row.add(text);

  return {
    row,
    text,
    baseBg: options.baseBg,
    baseFg: options.baseFg,
    selectedBg: options.selectedBg,
    selectedFg: options.selectedFg,
    cursorBg: options.cursorBg,
    cursorFg: options.cursorFg,
  };
}
