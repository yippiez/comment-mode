import { BoxRenderable, TextAttributes, TextRenderable, type CliRenderer } from "@opentui/core";

type BottomChipOptions = {
  label: string;
  bg: string;
  fg: string;
  variant: "active" | "inactive" | "plain";
};

export function createBottomChip(renderer: CliRenderer, options: BottomChipOptions): BoxRenderable {
  const horizontalPadding = options.variant === "plain" ? 0 : 1;
  const chip = new BoxRenderable(renderer, {
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
    backgroundColor: options.bg,
  });

  chip.add(
    new TextRenderable(renderer, {
      content: options.label,
      fg: options.fg,
      attributes:
        options.variant === "active"
          ? TextAttributes.BOLD | TextAttributes.UNDERLINE
          : options.variant === "plain"
            ? TextAttributes.BOLD
            : TextAttributes.DIM,
    }),
  );

  return chip;
}
