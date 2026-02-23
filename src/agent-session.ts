import { spawn } from "node:child_process";
import path from "node:path";
import {
  consumeBufferedLines,
  flushSseState,
  looksJsonLike,
  looksLikeError,
  normalizeStderrMessage,
  parseOpencodeJsonPayload,
  type ParsedOpencodeEvent,
  sanitizeLine,
  shouldIgnoreStdoutLine,
  type SseState,
} from "./agent-session-parser";
import type { AgentHarness, AgentModel, ViewMode } from "./types";

export type HeadlessAgentRunRequest = {
  rootDir: string;
  harness: AgentHarness;
  model: AgentModel;
  variant?: string;
  contextMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  prompt: string;
  selectedText: string;
  onMessage: (message: string) => void;
  onExit: (result: { success: boolean; error?: string }) => void;
};

export type HeadlessAgentRunResult =
  | {
      ok: true;
      runId: string;
      stop: () => void;
    }
  | {
      ok: false;
      error: string;
    };

export type OpencodeModelCatalogItem = {
  model: string;
  variants: string[];
};

/** Lists models plus per-model thinking variants from opencode CLI metadata. */
export async function listOpencodeModelCatalog(rootDir: string): Promise<OpencodeModelCatalogItem[]> {
  const verboseResult = await runProcessCapture("opencode", ["models", "--verbose"], rootDir);
  const verboseItems = parseVerboseModelCatalog(`${verboseResult.stdout ?? ""}\n${verboseResult.stderr ?? ""}`);
  if (verboseItems.length > 0) return verboseItems;

  const result = await runProcessCapture("opencode", ["models"], rootDir);
  if (result.error) return [];

  const merged = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const models = new Set<string>();
  for (const rawLine of merged.split(/\r?\n/)) {
    const line = sanitizeLine(rawLine);
    if (!line) continue;
    if (!isModelIdentifier(line)) continue;
    models.add(line);
  }

  return [...models]
    .sort((a, b) => a.localeCompare(b))
    .map((model) => ({ model, variants: [] }));
}

/** Lists model identifiers available to opencode. */
export async function listOpencodeModels(rootDir: string): Promise<string[]> {
  const catalog = await listOpencodeModelCatalog(rootDir);
  return catalog.map((item) => item.model);
}

/** Starts a streaming headless opencode run. */
export async function startHeadlessAgentRun(
  request: HeadlessAgentRunRequest,
): Promise<HeadlessAgentRunResult> {
  const runId = createRunId(request.filePath);
  const message = buildRunMessage(request);
  const runArgs = ["run", message, "--format", "json", "--model", request.model];
  if (request.variant && request.variant !== "auto") {
    runArgs.push("--variant", request.variant);
  }

  const child = spawn("opencode", runArgs, {
    cwd: request.rootDir,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let handledExit = false;
  let hadRuntimeError = false;
  let lastErrorMessage: string | undefined;
  const emitExit = (result: { success: boolean; error?: string }) => {
    if (handledExit) return;
    handledExit = true;
    request.onExit(result);
  };

  let stdoutBuffer = "";
  let stderrBuffer = "";
  const stdoutSseState: SseState = { eventType: undefined, dataLines: [] };
  const stderrSseState: SseState = { eventType: undefined, dataLines: [] };

  const emitParsedMessage = (parsed: ParsedOpencodeEvent | null) => {
    if (!parsed || parsed.messages.length === 0) return;
    for (const rawMessage of parsed.messages) {
      const message = rawMessage.trim();
      if (!message) continue;
      request.onMessage(message);
      if (parsed.isError) {
        hadRuntimeError = true;
        lastErrorMessage = message;
      }
    }
  };

  const consumeStdoutLine = (rawLine: string) => {
    const line = sanitizeLine(rawLine);
    if (!line) {
      emitParsedMessage(flushSseState(stdoutSseState));
      return;
    }

    if (line.startsWith("event:")) {
      const nextEvent = line.slice("event:".length).trim();
      if (stdoutSseState.eventType || stdoutSseState.dataLines.length > 0) {
        emitParsedMessage(flushSseState(stdoutSseState));
      }
      stdoutSseState.eventType = nextEvent || undefined;
      return;
    }

    if (line.startsWith("data:")) {
      stdoutSseState.dataLines.push(line.slice("data:".length).trim());
      return;
    }

    if (stdoutSseState.eventType || stdoutSseState.dataLines.length > 0) {
      emitParsedMessage(flushSseState(stdoutSseState));
    }

    const parsed = parseOpencodeJsonPayload(line);
    if (parsed) {
      emitParsedMessage(parsed);
      return;
    }

    if (looksJsonLike(line)) {
      return;
    }

    if (!shouldIgnoreStdoutLine(line)) {
      request.onMessage(line);
    }
  };

  const consumeStderrLine = (rawLine: string) => {
    const line = sanitizeLine(rawLine);
    if (!line) {
      emitParsedMessage(flushSseState(stderrSseState));
      return;
    }

    if (line.startsWith("event:")) {
      const nextEvent = line.slice("event:".length).trim();
      if (stderrSseState.eventType || stderrSseState.dataLines.length > 0) {
        emitParsedMessage(flushSseState(stderrSseState));
      }
      stderrSseState.eventType = nextEvent || undefined;
      return;
    }

    if (line.startsWith("data:")) {
      stderrSseState.dataLines.push(line.slice("data:".length).trim());
      return;
    }

    if (stderrSseState.eventType || stderrSseState.dataLines.length > 0) {
      emitParsedMessage(flushSseState(stderrSseState));
    }

    const parsed = parseOpencodeJsonPayload(line);
    if (parsed) {
      emitParsedMessage(parsed);
      return;
    }

    if (looksJsonLike(line)) {
      return;
    }

    const cleaned = normalizeStderrMessage(line);
    if (!cleaned) return;
    request.onMessage(cleaned);
    if (looksLikeError(cleaned)) {
      hadRuntimeError = true;
      lastErrorMessage = cleaned;
    }
  };

  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutBuffer = consumeBufferedLines(stdoutBuffer, String(chunk), consumeStdoutLine);
  });

  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrBuffer = consumeBufferedLines(stderrBuffer, String(chunk), consumeStderrLine);
  });

  child.on("error", (error) => {
    emitExit({ success: false, error: `Failed to run opencode: ${error.message}` });
  });

  child.on("close", (code) => {
    if (stdoutBuffer.trim().length > 0) {
      consumeStdoutLine(stdoutBuffer);
    }
    emitParsedMessage(flushSseState(stdoutSseState));
    if (stderrBuffer.trim().length > 0) {
      consumeStderrLine(stderrBuffer);
    }
    emitParsedMessage(flushSseState(stderrSseState));

    if (code === 0 && !hadRuntimeError) {
      emitExit({ success: true });
      return;
    }
    if (hadRuntimeError) {
      emitExit({ success: false, error: lastErrorMessage ?? "opencode reported an error." });
      return;
    }
    emitExit({ success: false, error: `opencode exited with status ${String(code ?? 1)}` });
  });

  return {
    ok: true,
    runId,
    stop: () => {
      if (child.killed) return;
      child.kill("SIGTERM");
    },
  };
}

function buildRunMessage(request: {
  contextMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  prompt: string;
  selectedText: string;
}): string {
  const contextLabel = request.contextMode ? request.contextMode.toUpperCase() : "CODE";
  return [
    `Context mode: ${contextLabel}`,
    `File: ${request.filePath}`,
    `Selected lines: ${request.selectionStartFileLine}-${request.selectionEndFileLine}`,
    "",
    "Instruction:",
    request.prompt,
    "",
    "Selected text:",
    request.selectedText,
  ].join("\n");
}

function createRunId(filePath: string): string {
  const safeStem = path
    .basename(filePath)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const unique = Date.now().toString(36);
  return `run-${safeStem || "task"}-${unique}`;
}

/** Runs a process and collects stdout/stderr buffers. */
async function runProcessCapture(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number | null; error?: Error }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, code: null, error });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      resolve({ stdout, stderr, code });
    });
  });
}

/** Parses `opencode models --verbose` output into model + variants records. */
function parseVerboseModelCatalog(rawText: string): OpencodeModelCatalogItem[] {
  const items = new Map<string, OpencodeModelCatalogItem>();
  const lines = rawText.split(/\r?\n/);
  let currentModel: string | null = null;
  let jsonBuffer: string[] = [];
  let depth = 0;

  const flushJsonBuffer = () => {
    if (!currentModel || jsonBuffer.length === 0) return;
    const rawJson = jsonBuffer.join("\n");
    jsonBuffer = [];
    try {
      const parsed = JSON.parse(rawJson) as { variants?: Record<string, unknown> };
      const variants = parsed.variants ? Object.keys(parsed.variants).sort((a, b) => a.localeCompare(b)) : [];
      items.set(currentModel, { model: currentModel, variants });
    } catch {
      items.set(currentModel, { model: currentModel, variants: [] });
    }
  };

  for (const rawLine of lines) {
    const line = sanitizeLine(rawLine);
    if (!line) continue;

    if (isModelIdentifier(line)) {
      if (depth > 0) {
        depth = 0;
        jsonBuffer = [];
      }
      currentModel = line;
      if (!items.has(line)) {
        items.set(line, { model: line, variants: [] });
      }
      continue;
    }

    if (!currentModel) continue;
    if (!line.includes("{") && depth === 0) continue;

    jsonBuffer.push(line);
    depth += countChar(line, "{");
    depth -= countChar(line, "}");
    if (depth <= 0) {
      depth = 0;
      flushJsonBuffer();
    }
  }

  return [...items.values()].sort((a, b) => a.model.localeCompare(b.model));
}

/** Returns true when line matches provider/model identifier format. */
function isModelIdentifier(line: string): boolean {
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(line);
}

/** Counts occurrences of a single character in a string. */
function countChar(text: string, char: string): number {
  let count = 0;
  for (const candidate of text) {
    if (candidate === char) count += 1;
  }
  return count;
}
