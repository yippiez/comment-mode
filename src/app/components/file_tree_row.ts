import { CodeRenderable, SyntaxStyle, type CliRenderer } from "@opentui/core";
import type { FileTreeRow } from "../view_modes";
import { theme } from "../../theme";
import { displayWidth, truncateLeftLabel } from "../../utils/text";

export type FileTreeRowView = {
  codeView: CodeRenderable;
  renderedLine: string;
};

/**
 * Creates a view representation of a file tree row with formatting and styling.
 * @param renderer - The CLI renderer used to create the code view
 * @param row - The file tree row data containing label and kind
 * @param viewportWidth - The width of the viewport for label truncation
 * @returns An object containing the code view and rendered line string
 */
export function createFileTreeRowView(
    renderer: CliRenderer,
    row: FileTreeRow,
    viewportWidth: number,
): FileTreeRowView {
    const renderedLine = formatFileTreeRowLabel(row, viewportWidth);

    const foreground = row.kind === "dir"
        ? theme.getDirectoryColor()
        : theme.getSearchRowForegroundColor();

    const isDir = row.kind === "dir";
    const syntaxStyle = SyntaxStyle.fromTheme([
        { scope: ["default"], style: { foreground: foreground, bold: isDir } },
        { scope: ["text"], style: { foreground: foreground, bold: isDir } },
    ]);
    const bg = theme.getTransparentColor();

    const codeView = new CodeRenderable(renderer, {
        width: "100%",
        content: renderedLine,
        fg: foreground,
        syntaxStyle,
        wrapMode: "none",
        bg,
    });
    codeView.selectable = false;

    return { codeView, renderedLine };
}

/**
 * Formats a file tree row label, optionally appending a file count for directories.
 * Truncates the label if it exceeds the viewport width.
 * @param row - The file tree row data
 * @param viewportWidth - The width of the viewport for truncation calculations
 * @returns The formatted label string
 */
function formatFileTreeRowLabel(row: FileTreeRow, viewportWidth: number): string {
    // Decide whether we should show a right-side file-count label.
    let rightLabel = "";
    const isDirectory = row.kind === "dir";
    const hasChildFileCount = typeof row.childFileCount === "number";
    if (isDirectory && hasChildFileCount) {
        rightLabel = `${String(row.childFileCount)} files`;
    }

    // If there is no right label, return the row label as-is.
    if (!rightLabel) {
        return row.label;
    }

    // Normalize viewport width so spacing logic stays stable.
    const targetWidth = Math.max(10, viewportWidth);
    if (displayWidth(rightLabel) >= targetWidth) {
        return truncateLeftLabel(rightLabel, targetWidth);
    }

    // Reserve room for both labels and at least one space between them.
    const minGap = 1;
    const leftAvailable = Math.max(1, targetWidth - displayWidth(rightLabel) - minGap);
    const leftLabel = truncateLeftLabel(row.label, leftAvailable);

    // Fill any extra space so the right label stays right-aligned.
    const spacing = " ".repeat(
        Math.max(1, targetWidth - displayWidth(leftLabel) - displayWidth(rightLabel)),
    );
    return `${leftLabel}${spacing}${rightLabel}`;
}
