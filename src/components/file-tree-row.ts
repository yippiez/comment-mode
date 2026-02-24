import { CodeRenderable, SyntaxStyle, type CliRenderer } from "@opentui/core";
import type { FileTreeRow } from "../modes";
import { theme } from "../theme";
import { displayWidth, truncateLeftLabel } from "../utils/ui";

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

  const syntaxStyle = getFileTreeSyntaxStyle(foreground, row.kind);
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
 * Creates a syntax style for the file tree row based on its kind.
 * Directories are rendered in bold, files are not.
 * @param fg - The foreground color to apply
 * @param kind - The type of the row, either "dir" or "file"
 * @returns A SyntaxStyle configured for the file tree row
 */
function getFileTreeSyntaxStyle(fg: string, kind: "dir" | "file"): SyntaxStyle {
  const isDir = kind === "dir";
  return SyntaxStyle.fromTheme([
    { scope: ["default"], style: { foreground: fg, bold: isDir } },
    { scope: ["text"], style: { foreground: fg, bold: isDir } },
  ]);
}

/**
 * Formats a file tree row label, optionally appending a file count for directories.
 * Truncates the label if it exceeds the viewport width.
 * @param row - The file tree row data
 * @param viewportWidth - The width of the viewport for truncation calculations
 * @returns The formatted label string
 */
function formatFileTreeRowLabel(row: FileTreeRow, viewportWidth: number): string {
  // Step 1: Decide whether we should show a right-side file-count label.
  let rightLabel = "";
  const isDirectory = row.kind === "dir";
  const hasChildFileCount = typeof row.childFileCount === "number";
  if (isDirectory && hasChildFileCount) {
    rightLabel = `${String(row.childFileCount)} files`;
  }

  // Step 2: If there is no right label, return the row label as-is.
  if (!rightLabel) {
    return row.label;
  }

  // Step 3: Normalize viewport width so spacing logic stays stable.
  const targetWidth = Math.max(10, viewportWidth);
  if (displayWidth(rightLabel) >= targetWidth) {
    return truncateLeftLabel(rightLabel, targetWidth);
  }

  // Step 4: Reserve room for both labels and at least one space between them.
  const minGap = 1;
  const leftAvailable = Math.max(1, targetWidth - displayWidth(rightLabel) - minGap);
  const leftLabel = truncateLeftLabel(row.label, leftAvailable);

  // Step 5: Fill any extra space so the right label stays right-aligned.
  const spacing = " ".repeat(
    Math.max(1, targetWidth - displayWidth(leftLabel) - displayWidth(rightLabel)),
  );
    return `${leftLabel}${spacing}${rightLabel}`;
}
