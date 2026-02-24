import type { CodeFileEntry } from "../types";
import type { ModePromptContext, ModePromptSelection } from "./types";

export type SignatureBlock = {
  fileLineStart: number;
  anchorFileLine: number;
  lines: string[];
};

export function filterSignaturesModeEntries(entries: readonly CodeFileEntry[]): CodeFileEntry[] {
  return entries.filter((entry) => entry.filetype !== "markdown" && entry.typeLabel !== "MD");
}

export function buildSignaturesPromptSelection(context: ModePromptContext): ModePromptSelection | null {
  const selectedSignatures = context.selection.filter(
    (line) => line.blockKind === "signature" && typeof line.fileLine === "number",
  );
  if (selectedSignatures.length === 0) return null;

  const sections: string[] = ["Mode: SIGNATURES", "Selected signatures:"];
  for (const line of selectedSignatures) {
    sections.push(`- ${line.filePath}:${String(line.fileLine)} ${line.text}`);
  }

  return {
    selection: selectedSignatures,
    selectedText: sections.join("\n"),
  };
}

/** Extracts function-like signatures plus nearby docs/comments. */
export function extractSignatureBlocks(content: string): SignatureBlock[] {
  const lines = content.split("\n");
  const blocks: SignatureBlock[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const signature = readSignature(lines, lineIndex);
    if (!signature) continue;

    const leadingDocs = readLeadingDocLines(lines, signature.startLineIndex);
    const trailingDocs = readTrailingPythonDocstring(lines, signature.endLineIndex, signature.isPythonDef);

    const fileLineStart = leadingDocs.startLineIndex + 1;
    const blockLines = stripSharedIndentation([
      ...leadingDocs.lines,
      ...signature.lines,
      ...trailingDocs.lines,
    ]);
    blocks.push({
      fileLineStart,
      anchorFileLine: signature.startLineIndex + 1,
      lines: blockLines,
    });

    lineIndex = Math.max(lineIndex, trailingDocs.endLineIndex, signature.endLineIndex);
  }

  return blocks;
}

function readSignature(
  lines: readonly string[],
  startLineIndex: number,
):
  | {
      startLineIndex: number;
      endLineIndex: number;
      lines: string[];
      isPythonDef: boolean;
    }
  | null {
  const firstLine = lines[startLineIndex] ?? "";
  const trimmed = firstLine.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("#")) {
    return null;
  }
  if (isControlStatement(trimmed)) return null;

  const isPythonDef = /^\s*def\s+[A-Za-z_][\w]*\s*\(/.test(firstLine);
  const isFunctionLike =
    /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(firstLine) ||
    /^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/.test(
      firstLine,
    ) ||
    /^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?function\b/.test(firstLine) ||
    isPythonDef ||
    /^\s*func\s+[A-Za-z_][\w]*\s*\(/.test(firstLine) ||
    /^\s*fn\s+[A-Za-z_][\w]*\s*\(/.test(firstLine) ||
    /^\s*(?:template\s*<[^>]+>\s*)?(?:inline\s+)?(?:virtual\s+)?(?:static\s+)?(?:constexpr\s+)?(?:[A-Za-z_][\w:<>,\s*&~]+\s+)+[A-Za-z_][\w]*\s*\([^;{}]*\)\s*(?:const\s*)?(?:=\s*0\s*)?[;{]?$/.test(
      firstLine,
    ) ||
    /^\s*[A-Za-z_][\w<>]*\s*\([^;{}]*\)\s*;\s*$/.test(firstLine) ||
    /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*(?::[^{]+)?\s*\{?\s*$/.test(
      firstLine,
    );

  if (!isFunctionLike) return null;

  const signatureLines: string[] = [firstLine.trimEnd()];
  let endLineIndex = startLineIndex;
  let parenBalance = countChar(firstLine, "(") - countChar(firstLine, ")");

  while (
    endLineIndex + 1 < lines.length &&
    endLineIndex - startLineIndex < 12 &&
    !isSignatureTerminated(lines[endLineIndex] ?? "", parenBalance, isPythonDef)
  ) {
    const nextLineIndex = endLineIndex + 1;
    const nextLine = lines[nextLineIndex] ?? "";
    const nextTrimmed = nextLine.trim();
    if (nextTrimmed.length === 0 && parenBalance <= 0) break;
    signatureLines.push(nextLine.trimEnd());
    endLineIndex = nextLineIndex;
    parenBalance += countChar(nextLine, "(") - countChar(nextLine, ")");
  }

  return {
    startLineIndex,
    endLineIndex,
    lines: signatureLines,
    isPythonDef,
  };
}

function readLeadingDocLines(
  lines: readonly string[],
  beforeLineIndex: number,
): { startLineIndex: number; lines: string[] } {
  const collected: string[] = [];
  let cursor = beforeLineIndex - 1;
  let startLineIndex = beforeLineIndex;
  let inBlockComment = false;
  let sawDocLine = false;

  while (cursor >= 0) {
    const line = lines[cursor] ?? "";
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      if (!sawDocLine) {
        cursor -= 1;
        continue;
      }
      break;
    }

    const isCommentLine =
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.endsWith("*/") ||
      inBlockComment;

    if (!isCommentLine) break;

    collected.unshift(line.trimEnd());
    startLineIndex = cursor;
    sawDocLine = true;

    if (trimmed.endsWith("*/") && !trimmed.startsWith("/*")) {
      inBlockComment = true;
    }
    if (inBlockComment && trimmed.startsWith("/*")) {
      inBlockComment = false;
    }

    cursor -= 1;
  }

  return {
    startLineIndex,
    lines: collected,
  };
}

function readTrailingPythonDocstring(
  lines: readonly string[],
  afterLineIndex: number,
  isPythonDef: boolean,
): { endLineIndex: number; lines: string[] } {
  if (!isPythonDef) {
    return { endLineIndex: afterLineIndex, lines: [] };
  }

  let cursor = afterLineIndex + 1;
  while (cursor < lines.length && (lines[cursor] ?? "").trim().length === 0) {
    cursor += 1;
  }
  if (cursor >= lines.length) {
    return { endLineIndex: afterLineIndex, lines: [] };
  }

  const firstDocLine = lines[cursor] ?? "";
  const firstTrimmed = firstDocLine.trim();
  const delimiter = firstTrimmed.startsWith('"""') ? '"""' : firstTrimmed.startsWith("'''") ? "'''" : null;
  if (!delimiter) {
    return { endLineIndex: afterLineIndex, lines: [] };
  }

  const docLines: string[] = [firstDocLine.trimEnd()];
  let endLineIndex = cursor;

  if (firstTrimmed.slice(delimiter.length).includes(delimiter)) {
    return { endLineIndex, lines: docLines };
  }

  for (let index = cursor + 1; index < lines.length && index - cursor <= 24; index += 1) {
    const line = lines[index] ?? "";
    docLines.push(line.trimEnd());
    endLineIndex = index;
    if (line.includes(delimiter)) break;
  }

  return { endLineIndex, lines: docLines };
}

function isControlStatement(trimmed: string): boolean {
  return /^(if|for|while|switch|catch|return|throw|else|do)\b/.test(trimmed);
}

function isSignatureTerminated(line: string, parenBalance: number, isPythonDef: boolean): boolean {
  const trimmed = line.trim();
  if (isPythonDef) {
    return parenBalance <= 0 && trimmed.endsWith(":");
  }
  if (trimmed.includes("=>")) return true;
  if (trimmed.includes("{")) return true;
  if (parenBalance <= 0 && trimmed.endsWith(";")) return true;
  return false;
}

function countChar(text: string, char: string): number {
  let count = 0;
  for (const letter of text) {
    if (letter === char) count += 1;
  }
  return count;
}

function stripSharedIndentation(lines: readonly string[]): string[] {
  let minIndent = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    let indent = 0;
    for (const char of line) {
      if (char !== " " && char !== "\t") break;
      indent += 1;
    }
    minIndent = Math.min(minIndent, indent);
  }

  if (!Number.isFinite(minIndent) || minIndent <= 0) {
    return [...lines];
  }

  return lines.map((line) => {
    if (line.length === 0) return line;
    const sliceStart = Math.min(minIndent, line.length);
    return line.slice(sliceStart);
  });
}
