import type { LineNumberRenderable } from "@opentui/core";

export type FocusMode = "chips" | "code";

export type CodeFileEntry = {
  relativePath: string;
  content: string;
  filetype?: string;
  typeLabel: string;
  lineCount: number;
};

export type RenderedLineBlock = {
  lineView: LineNumberRenderable;
  lineStart: number;
  lineEnd: number;
};
