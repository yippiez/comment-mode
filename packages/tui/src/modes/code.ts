import type { CodeFileEntry } from "../types";
import type { ModePromptContext, ModePromptSelection } from "./types";

export function filterCodeModeEntries(entries: readonly CodeFileEntry[]): CodeFileEntry[] {
  return [...entries];
}

export function buildCodePromptSelection(context: ModePromptContext): ModePromptSelection | null {
  const selectedCodeLines = context.selection.filter(
    (line) => line.blockKind === "code" && typeof line.fileLine === "number",
  );
  if (selectedCodeLines.length === 0) return null;

  const byFile = new Map<string, typeof selectedCodeLines>();
  for (const line of selectedCodeLines) {
    const existing = byFile.get(line.filePath);
    if (existing) {
      existing.push(line);
    } else {
      byFile.set(line.filePath, [line]);
    }
  }

  const sections: string[] = ["Mode: CODE", "Selected code:"];
  for (const [filePath, lines] of byFile.entries()) {
    sections.push(`File: ${filePath}`);
    for (const line of lines) {
      sections.push(`${String(line.fileLine)}: ${line.text}`);
    }
    sections.push("");
  }

  return {
    selection: selectedCodeLines,
    selectedText: sections.join("\n").trim(),
  };
}
