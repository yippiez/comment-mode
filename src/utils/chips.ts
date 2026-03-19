import {
    BoxRenderable,
    TextAttributes,
    TextRenderable,
    type CliRenderer,
} from "@opentui/core";
import { clamp } from "./math";
import { displayWidth } from "./text";
import { theme } from "../theme";
import { clearChildren } from "./ui";

const CHIP_SCROLL_LEFT_TRIGGER_RATIO = 0.2;
const CHIP_SCROLL_RIGHT_TRIGGER_RATIO = 0.8;
const CHIP_GAP_WIDTH = 1;
const CHIP_OVERFLOW_LEFT_INDICATOR = "<";
const CHIP_OVERFLOW_RIGHT_INDICATOR = ">";
const CHIP_OVERFLOW_INDICATOR_WIDTH = 1;
// The footprint is the width of the indicator and the gap to the next chip.
const CHIP_OVERFLOW_INDICATOR_FOOTPRINT = CHIP_OVERFLOW_INDICATOR_WIDTH + CHIP_GAP_WIDTH;
const CHIP_OVERFLOW_INDICATOR_COLOR = "#00ffff";

type GroupChipDescriptor = {
    name: string;
};

export type RenderTypeChipsOptions = {
    renderer: CliRenderer;
    chipsRow: BoxRenderable;
    sortedTypes: readonly string[];
    groupChips: readonly GroupChipDescriptor[];
    selectedChipIndex: number;
    chipWindowStartIndex: number;
    chipsFocused: boolean;
    getTypeCounts: (type: string) => { shown: number; hidden: number };
    isTypeEnabled: (type: string) => boolean;
    onChipSelected: (index: number) => void;
    onToggleSelectedChip: () => void;
};

/**
 * Renders type and group filter chips into the provided chips row.
 * @param options - Rendering and behavior options for chip layout and interactions
 * @returns The resolved chip window start index to persist for the next render
 * @example
 * const nextStart = renderTypeChips({
 *   renderer,
 *   chipsRow,
 *   sortedTypes: ["todo", "fixme"],
 *   groupChips: [{ name: "backend" }],
 *   selectedChipIndex: 0,
 *   chipWindowStartIndex: 0,
 *   chipsFocused: true,
 *   getTypeCounts: () => ({ shown: 3, hidden: 1 }),
 *   isTypeEnabled: () => true,
 *   onChipSelected: () => {},
 *   onToggleSelectedChip: () => {},
 * });
 */
export function renderTypeChips(options: RenderTypeChipsOptions): number {
    clearChildren(options.chipsRow);

    const typeChipCount = options.sortedTypes.length;
    const totalChipCount = typeChipCount + options.groupChips.length;

    if (totalChipCount === 0) {
        return 0;
    }

    const typeChipLabels = options.sortedTypes.map((type) => {
        const counts = options.getTypeCounts(type);
        return counts.hidden > 0
            ? `${type} (${counts.shown}/${counts.hidden})`
            : `${type} (${counts.shown})`;
    });
    const groupChipLabels = options.groupChips.map((group) => `@${group.name}`);
    const chipLabels = [...typeChipLabels, ...groupChipLabels];
    const chipWidths = chipLabels.map((label) => Math.max(1, displayWidth(label) + 2));
    const selectedChipIndex = clamp(options.selectedChipIndex, 0, chipWidths.length - 1);
    const viewportWidth = resolveChipsViewportWidth(options);
    const { startIndex, endIndex, hasHiddenLeft, hasHiddenRight } = resolveChipWindow({
        chipWidths,
        viewportWidth,
        selectedChipIndex,
        previousStartIndex: options.chipWindowStartIndex,
        gapWidth: CHIP_GAP_WIDTH,
        leftTriggerRatio: CHIP_SCROLL_LEFT_TRIGGER_RATIO,
        rightTriggerRatio: CHIP_SCROLL_RIGHT_TRIGGER_RATIO,
        indicatorFootprint: CHIP_OVERFLOW_INDICATOR_FOOTPRINT,
    });

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
        const isTypeChip = index < typeChipCount;
        const type = isTypeChip ? options.sortedTypes[index] : null;
        if (isTypeChip && !type) continue;

        const enabled = isTypeChip && type ? options.isTypeEnabled(type) : true;
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
                    : isTypeChip && !enabled
                        ? TextAttributes.DIM
                        : TextAttributes.BOLD,
            }),
        );

        chipsViewport.add(chip);
    }

    options.chipsRow.add(createOverflowIndicator(options.renderer, "right", hasHiddenRight));

    return startIndex;
}

export type ChipWindowResult = {
    startIndex: number;
    endIndex: number;
    hasHiddenLeft: boolean;
    hasHiddenRight: boolean;
};

type ResolveChipWindowOptions = {
    chipWidths: readonly number[];
    viewportWidth: number;
    selectedChipIndex: number;
    previousStartIndex: number;
    gapWidth: number;
    leftTriggerRatio: number;
    rightTriggerRatio: number;
    indicatorFootprint: number;
};

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

function createOverflowIndicator(
    renderer: CliRenderer,
    direction: "left" | "right",
    visible: boolean,
): TextRenderable {
    const arrow = direction === "left" ? CHIP_OVERFLOW_LEFT_INDICATOR : CHIP_OVERFLOW_RIGHT_INDICATOR;
    return new TextRenderable(renderer, {
        content: visible ? arrow : " ".repeat(CHIP_OVERFLOW_INDICATOR_WIDTH),
        fg: CHIP_OVERFLOW_INDICATOR_COLOR,
        attributes: visible ? TextAttributes.BOLD : TextAttributes.NONE,
    });
}

/**
 * Resolves the visible chip window around the selected chip.
 * @param options - Chip window sizing, selection, and scroll trigger configuration
 * @returns Window bounds and overflow visibility flags for left and right indicators
 * @example
 * resolveChipWindow({
 *   chipWidths: [8, 10, 9, 7],
 *   viewportWidth: 24,
 *   selectedChipIndex: 2,
 *   previousStartIndex: 0,
 *   gapWidth: 1,
 *   leftTriggerRatio: 0.2,
 *   rightTriggerRatio: 0.8,
 *   indicatorFootprint: 2,
 * });
 */
export function resolveChipWindow(options: ResolveChipWindowOptions): ChipWindowResult {
    const {
        chipWidths,
        viewportWidth,
        selectedChipIndex,
        previousStartIndex,
        gapWidth,
        leftTriggerRatio,
        rightTriggerRatio,
        indicatorFootprint,
    } = options;

    if (chipWidths.length === 0) {
        return { startIndex: 0, endIndex: 0, hasHiddenLeft: false, hasHiddenRight: false };
    }

    const safeSelectedIndex = clamp(selectedChipIndex, 0, chipWidths.length - 1);
    const safeViewportWidth = Math.max(1, Math.floor(viewportWidth));
    const chipsViewportWidth = resolveChipsViewportForWindow(safeViewportWidth, indicatorFootprint);
    if (computeTotalChipWidth(chipWidths, gapWidth) <= chipsViewportWidth) {
        return { startIndex: 0, endIndex: chipWidths.length, hasHiddenLeft: false, hasHiddenRight: false };
    }

    let startIndex = clamp(previousStartIndex, 0, chipWidths.length - 1);

    const ensureSelectionVisible = (): void => {
        if (safeSelectedIndex < startIndex) {
            startIndex = safeSelectedIndex;
            return;
        }
        while (safeSelectedIndex >= computeWindowEnd(chipWidths, startIndex, chipsViewportWidth, gapWidth)) {
            if (startIndex >= safeSelectedIndex) break;
            startIndex += 1;
        }
    };

    ensureSelectionVisible();

    const leftTrigger = Math.max(0, Math.floor((chipsViewportWidth - 1) * leftTriggerRatio));
    const rightTrigger = Math.max(leftTrigger + 1, Math.floor((chipsViewportWidth - 1) * rightTriggerRatio));
    let cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex, gapWidth);
    while (cursorPosition > rightTrigger && startIndex < safeSelectedIndex) {
        startIndex += 1;
        cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex, gapWidth);
    }

    while (cursorPosition < leftTrigger && startIndex > 0) {
        startIndex -= 1;
        cursorPosition = computeChipCursorPosition(chipWidths, startIndex, safeSelectedIndex, gapWidth);
    }

    ensureSelectionVisible();
    const endIndex = computeWindowEnd(chipWidths, startIndex, chipsViewportWidth, gapWidth);

    return {
        startIndex,
        endIndex,
        hasHiddenLeft: startIndex > 0,
        hasHiddenRight: endIndex < chipWidths.length,
    };
}

function resolveChipsViewportForWindow(viewportWidth: number, indicatorFootprint: number): number {
    let available = Math.max(1, Math.floor(viewportWidth));
    available -= Math.max(0, Math.floor(indicatorFootprint)) * 2;
    return Math.max(1, available);
}

function computeTotalChipWidth(chipWidths: readonly number[], gapWidth: number): number {
    if (chipWidths.length === 0) return 0;
    let total = 0;
    for (let index = 0; index < chipWidths.length; index += 1) {
        total += Math.max(1, Math.floor(chipWidths[index] ?? 1));
        if (index > 0) total += gapWidth;
    }
    return total;
}

function computeWindowEnd(
    chipWidths: readonly number[],
    startIndex: number,
    viewportWidth: number,
    gapWidth: number,
): number {
    const safeViewportWidth = Math.max(1, Math.floor(viewportWidth));
    let consumed = 0;
    let index = startIndex;

    while (index < chipWidths.length) {
        const chipWidth = Math.max(1, Math.floor(chipWidths[index] ?? 1));
        const additionalWidth = consumed === 0 ? chipWidth : chipWidth + gapWidth;
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
    gapWidth: number,
): number {
    let cursor = 0;
    for (let index = startIndex; index < selectedChipIndex; index += 1) {
        cursor += Math.max(1, Math.floor(chipWidths[index] ?? 1)) + gapWidth;
    }
    const selectedWidth = Math.max(1, Math.floor(chipWidths[selectedChipIndex] ?? 1));
    return cursor + Math.floor(selectedWidth / 2);
}
