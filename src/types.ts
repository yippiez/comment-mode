import type { LineNumberRenderable } from "@opentui/core";

export type FocusMode = "chips" | "code";

export type CodeFileEntry = {
  relativePath: string;
  content: string;
  filetype?: string;
  typeLabel: string;
  lineCount: number;
  uncommittedLines: Set<number>;
};

export type RenderedLineBlock = {
  lineView: LineNumberRenderable;
  lineStart: number;
  lineEnd: number;
  filePath: string;
};
