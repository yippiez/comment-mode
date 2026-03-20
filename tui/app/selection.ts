/**
 * Selection helpers: extracts per-line selection metadata from the cursor
 * and converts code/virtual selections into `PromptTarget` payloads.
 */
import type { PromptTarget } from "../controllers/prompt";
import type { Cursor } from "../controllers/cursor";
import type { LineModel } from "../line_model";
import type { FileTreeRow, ModeSelectionLineInfo } from "./view_modes";
import { clamp } from "../utils/math";
import type { PromptComposerLayout } from "./components/prompt_composer_bar";

export type SelectionLineInfo = ModeSelectionLineInfo;

export function collectSelectionLineInfos(cursor: Cursor, lineModel: LineModel): SelectionLineInfo[] {
    const { start, end } = cursor.selectionRange;
    if (start <= 0 || end <= 0) return [];
    const selection: SelectionLineInfo[] = [];

    for (let globalLine = start; globalLine <= end; globalLine += 1) {
        const lineInfo = lineModel.getVisibleLineInfo(globalLine);
        if (!lineInfo) continue;
        selection.push({
            globalLine,
            filePath: lineInfo.filePath,
            fileLine: lineInfo.fileLine,
            text: lineInfo.text,
            blockKind: lineInfo.blockKind,
        });
    }

    return selection;
}

export function createPromptTargetFromSelection(
    cursor: Cursor,
    lineModel: LineModel,
    fileTreeRowsByLine: ReadonlyMap<number, FileTreeRow>,
    projectRootPath: string,
): PromptTarget | null {
    const selection = collectSelectionLineInfos(cursor, lineModel);
    if (selection.length === 0) return null;

    const virtualRows = selection
        .map((line) => fileTreeRowsByLine.get(line.globalLine))
        .filter((row): row is FileTreeRow => Boolean(row));
    const isPureVirtualSelection = virtualRows.length === selection.length && virtualRows.length > 0;
    if (isPureVirtualSelection) {
        const selectedPaths = dedupePreserveOrder(
            virtualRows.map((row) => normalizeSelectionPath(row.filePath, projectRootPath)),
        );
        if (selectedPaths.length === 0) return null;

        const last = selection[selection.length - 1];
        if (!last) return null;
        const selectedText = [
            "Mode: VIRTUAL FILE",
            `Selected items: ${String(selectedPaths.length)}`,
            "Selection:",
            ...selectedPaths.map((path) => `- ${path}`),
        ].join("\n");

        return {
            viewMode: "virtual",
            filePath: projectRootPath,
            selectionStartFileLine: 1,
            selectionEndFileLine: 1,
            anchorLine: last.globalLine,
            selectedText,
            prompt: "",
            model: "",
        };
    }

    const selectedCodeLines = selection.filter(
        (line) => line.blockKind === "code" && typeof line.fileLine === "number",
    );
    if (selectedCodeLines.length !== selection.length) return null;

    const uniquePath = resolveSinglePath(selectedCodeLines.map((line) => line.filePath));
    if (uniquePath === null) return null;

    const last = selectedCodeLines[selectedCodeLines.length - 1];
    if (!last) return null;

    const fileLines = selectedCodeLines.map((line) => line.fileLine as number);
    const selectionStartFileLine = Math.min(...fileLines);
    const selectionEndFileLine = Math.max(...fileLines);
    const selectedText = [
        "Mode: CODE",
        `File: ${uniquePath}`,
        "Selected code:",
        ...selectedCodeLines.map((line) => `${String(line.fileLine)}: ${line.text}`),
    ].join("\n");

    return {
        viewMode: "code",
        filePath: uniquePath,
        selectionStartFileLine,
        selectionEndFileLine,
        anchorLine: last.globalLine,
        selectedText,
        prompt: "",
        model: "",
    };
}

export function buildClipboardSelectionText(
    selection: readonly SelectionLineInfo[],
    fileTreeRowsByLine: ReadonlyMap<number, FileTreeRow>,
): string {
    const virtualRows = selection
        .map((line) => fileTreeRowsByLine.get(line.globalLine))
        .filter((row): row is FileTreeRow => Boolean(row));
    const isPureVirtualSelection = virtualRows.length === selection.length && virtualRows.length > 0;
    if (isPureVirtualSelection) {
        const selectedPaths = dedupePreserveOrder(
            virtualRows.map((row) => normalizeSelectionPath(row.filePath, ".")),
        );
        return selectedPaths.join("\n");
    }

    const codeLines = selection.filter(
        (line) => line.blockKind === "code" && typeof line.fileLine === "number",
    );
    if (codeLines.length !== selection.length) return "";
    const uniquePath = resolveSinglePath(codeLines.map((line) => line.filePath));
    if (uniquePath === null) return "";

    return codeLines.map((line) => line.text).join("\n").trimEnd();
}

function resolveSinglePath(paths: readonly string[]): string | null {
    const unique = new Set(paths);
    if (unique.size !== 1) return null;
    const [first] = unique;
    return first ?? null;
}

function dedupePreserveOrder(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
        if (seen.has(value)) continue;
        seen.add(value);
        output.push(value);
    }
    return output;
}

function normalizeSelectionPath(path: string, fallback: string): string {
    return path.length > 0 ? path : fallback;
}

export function resolvePromptComposerLayout(options: {
  target: PromptTarget | null;
  fallbackAnchorLine: number | null;
  lineModel: LineModel;
  cursorLine: number;
  scrollboxY: number;
  scrollTop: number;
  viewportHeight: number;
}): PromptComposerLayout {
    const viewportTop = Math.max(0, options.scrollboxY);
    const viewportHeight = Math.max(1, options.viewportHeight);
    const viewportBottom = viewportTop + viewportHeight - 1;
    const anchorLine = resolvePromptAnchorLine(
        options.target,
        options.fallbackAnchorLine,
        options.lineModel,
        options.cursorLine,
    );
    const anchorDisplayRow = options.lineModel.getDisplayRowForLine(anchorLine);
    const rowInViewport = anchorDisplayRow - options.scrollTop;
    const desiredTop = viewportTop + rowInViewport + 1;
    const top = clamp(desiredTop, viewportTop, viewportBottom);
    return {
        top,
        maxHeight: Math.max(1, viewportBottom - top + 1),
    };
}

export function resolvePromptAnchorLine(
    target: PromptTarget | null,
    fallbackAnchorLine: number | null,
    lineModel: LineModel,
    cursorLine: number,
): number {
    if (target) {
        const visibleLine = lineModel.findGlobalLineForFileLine(target.filePath, target.selectionEndFileLine);
        if (typeof visibleLine === "number") {
            return visibleLine;
        }
    }

    if (lineModel.totalLines <= 0) return 1;
    const fallback = fallbackAnchorLine ?? cursorLine;
    return clamp(fallback, 1, lineModel.totalLines);
}
