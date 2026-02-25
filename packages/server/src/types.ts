import type { FileType } from "./file-types";

export type ViewMode = "code" | "files";

export type JsonRecord = Record<string, unknown>;

export type CodeFileEntryPayload = {
  relativePath: string;
  content: string;
  filetype?: FileType;
  typeLabel: string;
  typePriority: number;
  lineCount: number;
  uncommittedLines: number[];
};

export type OpencodeModelCatalogItem = {
  model: string;
  variants: string[];
};

export type OpencodeRunRequestBody = {
  model: string;
  variant?: string;
  contextMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  prompt: string;
  selectedText: string;
};

export type OpencodeRunRequest = OpencodeRunRequestBody & {
  rootDir: string;
  runId: string;
  onMessage: (message: string) => void;
  onExit: (result: { success: boolean; error?: string }) => void;
};

export type OpencodeRunResult =
  | {
      ok: true;
      runId: string;
      stop: () => void;
    }
  | {
      ok: false;
      error: string;
    };

export type StartupConfig = {
  rootDir: string;
  password: string;
  port: number;
  internal: boolean;
};

export type Runtime = {
  url: string;
  close: () => void;
};

export type RpcRequest = {
  id: string;
  method: string;
  params?: unknown;
};

export type RpcResponse =
  | {
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

export type RpcEvent = {
  event: string;
  data?: unknown;
};
