import type { CodeRenderable, LineNumberRenderable, RGBA } from "@opentui/core";

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
  codeView: CodeRenderable;
  defaultLineNumberFg: string;
  defaultLineSigns: Map<
    number,
    {
      before?: string;
      beforeColor?: string | RGBA;
      after?: string;
      afterColor?: string | RGBA;
    }
  >;
  lineStart: number;
  lineEnd: number;
  filePath: string;
};
