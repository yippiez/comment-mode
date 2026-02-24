import type { CodeRenderable, LineNumberRenderable, RGBA } from "@opentui/core";

export type FocusMode = "chips" | "code" | "prompt";
export type ViewMode = "code" | "files";
export type BlockKind = "code" | "collapsed" | "agent" | "file";
export type AgentHarness = "opencode";
export type AgentModel = string;
export type AgentUpdateStatus = "draft" | "running" | "completed" | "failed";

export type CodeFileEntry = {
  relativePath: string;
  content: string;
  filetype?: string;
  typeLabel: string;
  typePriority: number;
  lineCount: number;
  uncommittedLines: Set<number>;
};

export type AgentUpdate = {
  id: string;
  contextMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  selectedText: string;
  prompt: string;
  harness: AgentHarness;
  model: AgentModel;
  variant?: string;
  status: AgentUpdateStatus;
  runId?: string;
  messages: string[];
  error?: string;
};

export type RenderedLineBlock = {
  lineView: LineNumberRenderable | null;
  codeView: CodeRenderable | null;
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
  blockKind: BlockKind;
  fileLineStart: number | null;
  renderedLines: string[];
  lineStart: number;
  lineEnd: number;
  filePath: string;
};
