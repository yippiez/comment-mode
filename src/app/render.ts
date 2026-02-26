import { BoxRenderable, TextAttributes, TextRenderable, type CliRenderer } from "@opentui/core";
import { clearChildren } from "../utils/ui";
import { theme } from "../theme";
import type { AgentUpdate } from "../types";
import { displayWidth } from "../utils/text";

type RenderTypeChipsOptions = {
  renderer: CliRenderer;
  chipsRow: BoxRenderable;
  sortedTypes: readonly string[];
  selectedChipIndex: number;
  chipWindowStartIndex: number;
  chipsFocused: boolean;
  getTypeCount: (type: string) => number;
  isTypeEnabled: (type: string) => boolean;
  onChipSelected: (index: number) => void;
  onToggleSelectedChip: () => void;
};

const CHIP_SCROLL_LEFT_TRIGGER_RATIO = 0.2;
const CHIP_SCROLL_RIGHT_TRIGGER_RATIO = 0.8;
const CHIP_GAP_WIDTH = 1;
const CHIP_OVERFLOW_LEFT_INDICATOR = "<-";
const CHIP_OVERFLOW_RIGHT_INDICATOR = "->";
const CHIP_OVERFLOW_INDICATOR_COLOR = "#00ffff";

export function renderTypeChips(options: RenderTypeChipsOptions): number {
  clearChildren(options.chipsRow);

  if (options.sortedTypes.length === 0) {
    return 0;
  }

  const chipLabels = options.sortedTypes.map((type) => `${type} (${options.getTypeCount(type)})`);
  const chipWidths = chipLabels.map((label) => Math.max(1, displayWidth(label) + 2));
  const selectedChipIndex = clamp(options.selectedChipIndex, 0, chipWidths.length - 1);
  const viewportWidth = resolveChipsViewportWidth(options);
  const { startIndex, endIndex, hasHiddenLeft, hasHiddenRight } = resolveChipWindow(
    chipWidths,
    viewportWidth,
    selectedChipIndex,
    options.chipWindowStartIndex,
  );

  options.chipsRow.add(createOverflowIndicator(options.renderer, "left", hasHiddenLeft));
  const chipsViewport = new BoxRenderable(options.renderer, {
    flexDirection: "row",
    flexWrap: "no-wrap",
    alignItems: "center",
    gap: CHIP_GAP_WIDTH,
    flexGrow: 1,
  });
  options.chipsRow.add(chipsViewport);

  for (let index = startIndex; index < endIndex; index += 1) {
    const type = options.sortedTypes[index];
    if (!type) continue;
    const enabled = options.isTypeEnabled(type);
    const selected = index === selectedChipIndex;

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
        content: chipLabels[index] ?? "",
        fg: theme.getChipTextColor(selected, enabled),
        attributes: selected
          ? TextAttributes.BOLD | TextAttributes.UNDERLINE
          : enabled
            ? TextAttributes.BOLD
            : TextAttributes.DIM,
      }),
    );

    chipsViewport.add(chip);
  }

  options.chipsRow.add(createOverflowIndicator(options.renderer, "right", hasHiddenRight));

  return startIndex;
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

function resolveChipsViewportWidth(options: RenderTypeChipsOptions): number {
  if (typeof options.chipsRow.width === "number" && Number.isFinite(options.chipsRow.width)) {
    const rowWidth = Math.floor(options.chipsRow.width);
    if (rowWidth > 1) return rowWidth;
  }

  const rendererWidth = Math.floor(options.renderer.width);
  if (Number.isFinite(rendererWidth) && rendererWidth > 1) {
    return rendererWidth;
  }

  return Number.MAX_SAFE_INTEGER;
}

function resolveChipWindow(
  chipWidths: readonly number[],
  viewportWidth: number,
  selectedChipIndex: number,
  previousStartIndex: number,
): { startIndex: number; endIndex: number; hasHiddenLeft: boolean; hasHiddenRight: boolean } {
  if (chipWidths.length === 0) {
    return { startIndex: 0, endIndex: 0, hasHiddenLeft: false, hasHiddenRight: false };
  }

  const safeSelectedIndex = clamp(selectedChipIndex, 0, chipWidths.length - 1);
  const safeViewportWidth = Math.max(1, Math.floor(viewportWidth));
  const chipsViewportWidth = resolveChipsViewportForWindow(safeViewportWidth);
  if (computeTotalChipWidth(chipWidths) <= chipsViewportWidth) {
    return { startIndex: 0, endIndex: chipWidths.length, hasHiddenLeft: false, hasHiddenRight: false };
  }

  let startIndex = clamp(previousStartIndex, 0, chipWidths.length - 1);

  const ensureSelectionVisible = (): void => {
    if (safeSelectedIndex < startIndex) {
      startIndex = safeSelectedIndex;
      return;
    }
    while (safeSelectedIndex >= computeWindowEnd(chipWidths, startIndex, chipsViewportWidth)) {
      if (startIndex >= safeSelectedIndex) break;
      startIndex += 1;
    }
  };

  ensureSelectionVisible();

  let leftTrigger = Math.max(0, Math.floor((chipsViewportWidth - 1) * CHIP_SCROLL_LEFT_TRIGGER_RATIO));
  let rightTrigger = Math.max(
    leftTrigger + 1,
    Math.floor((chipsViewportWidth - 1) * CHIP_SCROLL_RIGHT_TRIGGER_RATIO),
  );
  let cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex);
  while (cursorPosition > rightTrigger && startIndex < safeSelectedIndex) {
    startIndex += 1;
    cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex);
  }

  while (cursorPosition < leftTrigger && startIndex > 0) {
    startIndex -= 1;
    cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex);
  }

  ensureSelectionVisible();
  const endIndex = computeWindowEnd(chipWidths, startIndex, chipsViewportWidth);

  return {
    startIndex,
    endIndex,
    hasHiddenLeft: startIndex > 0,
    hasHiddenRight: endIndex < chipWidths.length,
  };
}
function resolveChipsViewportForWindow(viewportWidth: number): number {
  let available = Math.max(1, Math.floor(viewportWidth));
  available -= computeIndicatorFootprint() * 2;
  return Math.max(1, available);
}

function computeTotalChipWidth(chipWidths: readonly number[]): number {
  if (chipWidths.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < chipWidths.length; index += 1) {
    total += Math.max(1, Math.floor(chipWidths[index] ?? 1));
    if (index > 0) total += 1;
  }
  return total;
}

function computeWindowEnd(chipWidths: readonly number[], startIndex: number, viewportWidth: number): number {
  const safeViewportWidth = Math.max(1, Math.floor(viewportWidth));
  let consumed = 0;
  let index = startIndex;

  while (index < chipWidths.length) {
    const chipWidth = Math.max(1, Math.floor(chipWidths[index] ?? 1));
    const additionalWidth = consumed === 0 ? chipWidth : chipWidth + CHIP_GAP_WIDTH;
    if (consumed > 0 && consumed + additionalWidth > safeViewportWidth) {
      break;
    }
    consumed += additionalWidth;
    index += 1;
    if (consumed >= safeViewportWidth) {
      break;
    }
  }

  return Math.max(startIndex + 1, index);
}

function computeChipCursorPosition(
  chipWidths: readonly number[],
  startIndex: number,
  selectedChipIndex: number,
): number {
  let cursor = 0;
  for (let index = startIndex; index < selectedChipIndex; index += 1) {
    cursor += Math.max(1, Math.floor(chipWidths[index] ?? 1)) + CHIP_GAP_WIDTH;
  }
  const selectedWidth = Math.max(1, Math.floor(chipWidths[selectedChipIndex] ?? 1));
  return cursor + Math.floor(selectedWidth / 2);
}

function computeIndicatorFootprint(): number {
  return computeOverflowIndicatorWidth() + CHIP_GAP_WIDTH;
}

function createOverflowIndicator(
  renderer: CliRenderer,
  direction: "left" | "right",
  visible: boolean,
): TextRenderable {
  const arrow = direction === "left" ? CHIP_OVERFLOW_LEFT_INDICATOR : CHIP_OVERFLOW_RIGHT_INDICATOR;
  const width = computeOverflowIndicatorWidth();
  return new TextRenderable(renderer, {
    content: visible ? arrow : " ".repeat(width),
    fg: CHIP_OVERFLOW_INDICATOR_COLOR,
    attributes: visible ? TextAttributes.BOLD : TextAttributes.NONE,
  });
}

function computeOverflowIndicatorWidth(): number {
  return Math.max(
    displayWidth(CHIP_OVERFLOW_LEFT_INDICATOR),
    displayWidth(CHIP_OVERFLOW_RIGHT_INDICATOR),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
