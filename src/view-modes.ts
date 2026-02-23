import type { CodeFileEntry, ViewMode } from "./types";

export type ViewModeDescriptor = {
  id: ViewMode;
  label: string;
};

export type SignatureBlock = {
  fileLineStart: number;
  anchorFileLine: number;
  lines: string[];
};

export type FileTreeRow = {
  key: string;
  kind: "dir" | "file";
  path: string;
  filePath: string;
  depth: number;
  label: string;
};

const MODES: ViewModeDescriptor[] = [
  { id: "code", label: "CODE" },
  { id: "signatures", label: "SIGNATURES" },
  { id: "files", label: "FILES" },
];

class ViewModesManager {
  private index = 0;

  public getAllModes(): readonly ViewModeDescriptor[] {
    return MODES;
  }

  public getMode(): ViewMode {
    return MODES[this.index]?.id ?? "code";
  }

  public getModeName(): string {
    return MODES[this.index]?.label ?? "CODE";
  }

  public setMode(mode: ViewMode): ViewMode {
    const nextIndex = MODES.findIndex((entry) => entry.id === mode);
    if (nextIndex >= 0) {
      this.index = nextIndex;
    }
    return this.getMode();
  }

  public switchMode(): ViewMode {
    this.index = (this.index + 1) % MODES.length;
    return this.getMode();
  }
}

export const viewModes = new ViewModesManager();

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
    const blockLines = [...leadingDocs.lines, ...signature.lines, ...trailingDocs.lines];
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

type FileTreeDirNode = {
  kind: "dir";
  path: string;
  dirs: Map<string, FileTreeDirNode>;
  files: FileTreeFileNode[];
};

type FileTreeFileNode = {
  path: string;
  lineCount: number;
};

type FileTreeChild =
  | {
      kind: "dir";
      name: string;
      path: string;
      node: FileTreeDirNode;
    }
  | {
      kind: "file";
      name: string;
      path: string;
      lineCount: number;
    };

/** Builds a collapsible tree list from relative file paths. */
export function buildFileTreeRows(
  entries: readonly CodeFileEntry[],
  collapsedDirectories: ReadonlySet<string>,
): FileTreeRow[] {
  const root: FileTreeDirNode = {
    kind: "dir",
    path: "",
    dirs: new Map(),
    files: [],
  };

  for (const entry of entries) {
    const parts = entry.relativePath.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let cursor = root;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index] ?? "";
      const isLast = index === parts.length - 1;
      if (isLast) {
        cursor.files.push({ path: entry.relativePath, lineCount: entry.lineCount });
        continue;
      }

      const nextPath = cursor.path ? `${cursor.path}/${part}` : part;
      let next = cursor.dirs.get(part);
      if (!next) {
        next = {
          kind: "dir",
          path: nextPath,
          dirs: new Map(),
          files: [],
        };
        cursor.dirs.set(part, next);
      }
      cursor = next;
    }
  }

  const rows: FileTreeRow[] = [];
  const visit = (node: FileTreeDirNode, depth: number, parentHasNext: boolean[]) => {
    const sortedDirs = [...node.dirs.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, dirNode]) => ({
        kind: "dir" as const,
        name,
        path: dirNode.path,
        node: dirNode,
      }));
    const sortedFiles = [...node.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((fileEntry) => ({
        kind: "file" as const,
        name: fileEntry.path.split("/").pop() ?? fileEntry.path,
        path: fileEntry.path,
        lineCount: fileEntry.lineCount,
      }));
    const children: FileTreeChild[] = [...sortedDirs, ...sortedFiles];

    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (!child) continue;
      const isLast = index === children.length - 1;
      const branchPrefix =
        parentHasNext.map((hasNext) => (hasNext ? "│   " : "    ")).join("") +
        (isLast ? "└── " : "├── ");

      if (child.kind === "dir") {
        const collapsed = collapsedDirectories.has(child.path);
        const marker = collapsed ? "▸" : "▾";
        rows.push({
          key: `dir:${child.path}`,
          kind: "dir",
          path: child.path,
          filePath: child.path,
          depth,
          label: `${branchPrefix}${marker} ${child.name}/`,
        });
        if (!collapsed) {
          visit(child.node, depth + 1, [...parentHasNext, !isLast]);
        }
        continue;
      }
      rows.push({
        key: `file:${child.path}`,
        kind: "file",
        path: child.path,
        filePath: child.path,
        depth,
        label: `${branchPrefix}${child.name} (${String(child.lineCount)})`,
      });
    }
  };

  visit(root, 0, []);
  return rows;
}

export function getAncestorDirectories(filePath: string): string[] {
  const parts = filePath.split("/").filter(Boolean);
  const ancestors: string[] = [];
  for (let index = 0; index < parts.length - 1; index += 1) {
    ancestors.push(parts.slice(0, index + 1).join("/"));
  }
  return ancestors;
}
