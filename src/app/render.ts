import { BoxRenderable, TextAttributes, TextRenderable, type CliRenderer } from "@opentui/core";
import { clearChildren } from "../utils/ui";
import { theme } from "../theme";
import type { AgentUpdate } from "../types";

type RenderTypeChipsOptions = {
  renderer: CliRenderer;
  chipsRow: BoxRenderable;
  sortedTypes: readonly string[];
  selectedChipIndex: number;
  chipsFocused: boolean;
  getTypeCount: (type: string) => number;
  isTypeEnabled: (type: string) => boolean;
  onChipSelected: (index: number) => void;
  onToggleSelectedChip: () => void;
};

export function renderTypeChips(options: RenderTypeChipsOptions): void {
  clearChildren(options.chipsRow);

  for (const [index, type] of options.sortedTypes.entries()) {
    const enabled = options.isTypeEnabled(type);
    const selected = index === options.selectedChipIndex;

    const chip = new BoxRenderable(options.renderer, {
      paddingLeft: 1,
      paddingRight: 1,
      backgroundColor: selected
        ? theme.getChipSelectedBackgroundColor(options.chipsFocused)
        : theme.getChipBackgroundColor(enabled),
      onMouseDown: () => {
        options.onChipSelected(index);
        options.onToggleSelectedChip();
      },
    });

    chip.add(
      new TextRenderable(options.renderer, {
        content: `${type} (${options.getTypeCount(type)})`,
        fg: theme.getChipTextColor(selected, enabled),
        attributes: selected
          ? TextAttributes.BOLD | TextAttributes.UNDERLINE
          : enabled
            ? TextAttributes.BOLD
            : TextAttributes.DIM,
      }),
    );

    options.chipsRow.add(chip);
  }
}

export function computeFilesModeViewportWidth(
  viewportWidth: number,
  scrollboxWidth: number,
  rendererWidth: number,
): number {
  const resolved = resolveViewportWidth(viewportWidth, scrollboxWidth, rendererWidth);
  return Math.max(1, resolved - 1);
}

export function formatCollapsedContentLine(label: string, width: number): string {
  const trimmed = label.trim();
  if (trimmed.length >= width) return trimmed.slice(0, width);
  const remaining = width - trimmed.length;
  const left = Math.floor(remaining / 2);
  const right = remaining - left;
  return `${" ".repeat(left)}${trimmed}${" ".repeat(right)}`;
}

export function formatAgentUpdateLine(update: AgentUpdate): string {
  const prefix =
    update.status === "running"
      ? "AGENT RUNNING"
      : update.status === "completed"
        ? "AGENT DONE"
        : update.status === "failed"
          ? "AGENT FAILED"
          : "AGENT DRAFT";
  const prompt = update.prompt.trim().length > 0 ? update.prompt : "<type prompt>";
  const variantSuffix = update.variant ? ` · think:${update.variant}` : "";
  const runSuffix = update.runId ? ` · ${update.runId}` : "";
  const errorSuffix = update.error ? ` | error: ${update.error}` : "";
  return `● ${prefix} · ${update.model}${variantSuffix} · ${prompt}${runSuffix}${errorSuffix}`;
}

export function computeAgentContentWidth(
  viewportWidth: number,
  scrollboxWidth: number,
  rendererWidth: number,
  paddingLeft: number,
  paddingRight: number,
): number {
  const resolved = resolveViewportWidth(viewportWidth, scrollboxWidth, rendererWidth);
  return Math.max(8, resolved - Math.max(0, paddingLeft) - Math.max(0, paddingRight));
}

function resolveViewportWidth(viewportWidth: number, scrollboxWidth: number, rendererWidth: number): number {
  if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
    return Math.floor(viewportWidth);
  }
  if (Number.isFinite(scrollboxWidth) && scrollboxWidth > 0) {
    return Math.floor(scrollboxWidth);
  }
  return Math.max(1, Math.floor(rendererWidth));
}
