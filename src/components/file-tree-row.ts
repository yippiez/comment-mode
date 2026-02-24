import { CodeRenderable, LineNumberRenderable, SyntaxStyle, type CliRenderer } from "@opentui/core";
import type { FileTreeRow } from "../modes";
import { theme } from "../theme";

export type FileTreeRowView = {
  lineView: LineNumberRenderable;
  codeView: CodeRenderable;
  renderedLine: string;
};

export function createFileTreeRowView(
  renderer: CliRenderer,
  row: FileTreeRow,
  viewportWidth: number,
): FileTreeRowView {
  const renderedLine = formatFileTreeRowLabel(row, viewportWidth);
  const foreground = getFileTreeForegroundColor(row.kind);

  const codeView = new CodeRenderable(renderer, {
    width: "100%",
    content: renderedLine,
    fg: foreground,
    syntaxStyle: getFileTreeSyntaxStyle(foreground, row.kind),
    wrapMode: "none",
    bg: theme.getTransparentColor(),
  });
  codeView.selectable = false;

  const lineView = new LineNumberRenderable(renderer, {
    width: "100%",
    target: codeView,
    showLineNumbers: false,
    minWidth: 0,
    paddingRight: 0,
    fg: theme.getCodeLineNumberColor(),
    bg: theme.getTransparentColor(),
  });
  lineView.selectable = false;

  return { lineView, codeView, renderedLine };
}

function getFileTreeForegroundColor(kind: "dir" | "file"): string {
  return kind === "dir" ? theme.getDirectoryColor() : theme.getSearchRowForegroundColor();
}

function getFileTreeSyntaxStyle(fg: string, kind: "dir" | "file"): SyntaxStyle {
  const isDir = kind === "dir";
  return SyntaxStyle.fromTheme([
    { scope: ["default"], style: { foreground: fg, bold: isDir } },
    { scope: ["text"], style: { foreground: fg, bold: isDir } },
  ]);
}

function formatFileTreeRowLabel(row: FileTreeRow, viewportWidth: number): string {
  const rightLabel =
    row.kind === "dir"
      ? typeof row.childFileCount === "number"
        ? `${String(row.childFileCount)} files`
        : ""
      : `${String(row.lineCount ?? 0)} lines`;
  if (!rightLabel) return row.label;

  const targetWidth = Math.max(10, viewportWidth);
  if (displayWidth(rightLabel) >= targetWidth) {
    return truncateFileTreeLeftLabel(rightLabel, targetWidth);
  }

  const minGap = 1;
  const leftAvailable = Math.max(1, targetWidth - displayWidth(rightLabel) - minGap);
  const leftLabel = truncateFileTreeLeftLabel(row.label, leftAvailable);
  const spacing = " ".repeat(
    Math.max(1, targetWidth - displayWidth(leftLabel) - displayWidth(rightLabel)),
  );
  return `${leftLabel}${spacing}${rightLabel}`;
}

function truncateFileTreeLeftLabel(label: string, maxWidth: number): string {
  if (displayWidth(label) <= maxWidth) return label;
  if (maxWidth <= 3) {
    let compact = "";
    for (const char of label) {
      if (displayWidth(compact + char) > maxWidth) break;
      compact += char;
    }
    return compact;
  }

  const ellipsis = "...";
  const target = Math.max(1, maxWidth - displayWidth(ellipsis));
  let truncated = "";
  for (const char of label) {
    if (displayWidth(truncated + char) > target) break;
    truncated += char;
  }
  return `${truncated}${ellipsis}`;
}

function displayWidth(text: string): number {
  try {
    return Bun.stringWidth(text);
  } catch {
    return text.length;
  }
}
