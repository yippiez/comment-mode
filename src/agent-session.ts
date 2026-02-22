import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AgentHarness, AgentModel } from "./types";

export type HeadlessAgentRunRequest = {
  rootDir: string;
  harness: AgentHarness;
  model: AgentModel;
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

export async function listOpencodeModels(rootDir: string): Promise<string[]> {
  if (!isOpencodeAvailable()) return [];

  const opencodeEnv = buildOpencodeEnv(rootDir);
  await mkdir(opencodeEnv.XDG_DATA_HOME, { recursive: true });
  await mkdir(opencodeEnv.XDG_CONFIG_HOME, { recursive: true });
  await mkdir(opencodeEnv.XDG_STATE_HOME, { recursive: true });

  const result = spawnSync("opencode", ["models"], {
    cwd: rootDir,
    env: opencodeEnv,
    encoding: "utf8",
  });

  const merged = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const models = new Set<string>();
  for (const rawLine of merged.split(/\r?\n/)) {
    const line = sanitizeLine(rawLine);
    if (!line) continue;
    if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(line)) continue;
    models.add(line);
  }

  return [...models].sort((a, b) => a.localeCompare(b));
}

export async function startHeadlessAgentRun(
  request: HeadlessAgentRunRequest,
): Promise<HeadlessAgentRunResult> {
  if (!isOpencodeAvailable()) {
    return { ok: false, error: "opencode is not available on PATH." };
  }

  const runId = createRunId(request.filePath);
  const message = buildRunMessage(request);

  const opencodeEnv = buildOpencodeEnv(request.rootDir);
  await mkdir(opencodeEnv.XDG_DATA_HOME, { recursive: true });
  await mkdir(opencodeEnv.XDG_CONFIG_HOME, { recursive: true });
  await mkdir(opencodeEnv.XDG_STATE_HOME, { recursive: true });

  const child = spawn(
    "opencode",
    ["run", message, "--format", "json", "--model", request.model],
    {
      cwd: request.rootDir,
      env: opencodeEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

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

  const emitParsedMessage = (parsed: ParsedOpencodeEvent | null) => {
    if (!parsed?.message) return;
    const message = parsed.message.trim();
    if (!message) return;
    request.onMessage(message);
    if (parsed.isError) {
      hadRuntimeError = true;
      lastErrorMessage = message;
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

    if (!shouldIgnoreStdoutLine(line)) {
      request.onMessage(line);
    }
  };

  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutBuffer = consumeBufferedLines(stdoutBuffer, String(chunk), consumeStdoutLine);
  });

  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrBuffer = consumeBufferedLines(stderrBuffer, String(chunk), (line) => {
      const cleaned = sanitizeLine(line);
      if (!cleaned) return;
      request.onMessage(cleaned);
      if (looksLikeError(cleaned)) {
        hadRuntimeError = true;
        lastErrorMessage = cleaned;
      }
    });
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
      const cleaned = sanitizeLine(stderrBuffer);
      if (cleaned) {
        request.onMessage(cleaned);
        if (looksLikeError(cleaned)) {
          hadRuntimeError = true;
          lastErrorMessage = cleaned;
        }
      }
    }

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

type ParsedOpencodeEvent = { message: string; isError: boolean };
type SseState = { eventType: string | undefined; dataLines: string[] };

function parseOpencodeJsonPayload(line: string): ParsedOpencodeEvent | null {
  const cleaned = sanitizeLine(line);
  if (!cleaned || (!cleaned.startsWith("{") && !cleaned.startsWith("["))) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(cleaned);
  } catch {
    return null;
  }
  return parseOpencodePayload(payload, undefined);
}

function flushSseState(state: SseState): ParsedOpencodeEvent | null {
  const eventType = state.eventType;
  const rawData = state.dataLines.join("\n");
  state.eventType = undefined;
  state.dataLines = [];

  if (!eventType && rawData.trim().length === 0) return null;
  if (rawData.trim() === "[DONE]") return null;

  if (rawData.trim().startsWith("{")) {
    try {
      const payload = JSON.parse(rawData);
      return parseOpencodePayload(payload, eventType);
    } catch {
      // fall through to raw data handling below
    }
  }

  const directText = toString(rawData);
  if (directText) {
    if (eventType && isMetaEvent(eventType)) return null;
    if (eventType && eventType !== "text") {
      return { message: `${eventType}: ${directText}`, isError: isErrorEvent(eventType) };
    }
    return { message: directText, isError: false };
  }

  return null;
}

function parseOpencodePayload(payload: unknown, fallbackType: string | undefined): ParsedOpencodeEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const type = toString(record.type) ?? fallbackType;

  const errorObject = asRecord(record.error) ?? asRecord(asRecord(record.data)?.error);
  const errorData = asRecord(errorObject?.data);
  const errorMessage = firstText(
    errorData?.message,
    errorObject?.message,
    record.error,
    asRecord(record.data)?.error,
    record.message,
  );
  if (errorMessage) {
    return { message: type ? `${type}: ${errorMessage}` : errorMessage, isError: true };
  }

  const data = asRecord(record.data);
  const result = asRecord(record.result);
  const primary = firstText(
    record.message,
    record.text,
    record.content,
    record.delta,
    record.response,
    record.output,
    record.completion,
    data?.message,
    data?.text,
    data?.content,
    data?.delta,
    data?.response,
    data?.output,
    data?.completion,
    result?.message,
    result?.text,
    result?.content,
    result?.delta,
    result?.response,
    result?.output,
    result?.completion,
  );
  if (primary) return { message: primary, isError: false };

  if (type && isErrorEvent(type)) {
    return { message: `opencode ${type}`, isError: true };
  }
  return null;
}

function consumeBufferedLines(buffer: string, nextChunk: string, onLine: (line: string) => void): string {
  const full = buffer + nextChunk;
  const parts = full.split(/\r?\n/);
  const tail = parts.pop() ?? "";
  for (const line of parts) {
    onLine(line);
  }
  return tail;
}

function sanitizeLine(line: string): string {
  return stripAnsi(line).trim();
}

function shouldIgnoreStdoutLine(line: string): boolean {
  return line.startsWith("event:") || line.startsWith("data:");
}

function isMetaEvent(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return lower === "start" || lower === "done" || lower === "end" || lower === "session";
}

function isErrorEvent(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return lower === "error" || lower.endsWith("_error") || lower.includes("failed");
}

function looksLikeError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.startsWith("error") || lower.includes(" failed");
}

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*[A-Za-z]/g, "").replace(/\u001B\][^\u0007]*\u0007/g, "");
}

function buildOpencodeEnv(rootDir: string): NodeJS.ProcessEnv & {
  XDG_DATA_HOME: string;
  XDG_CONFIG_HOME: string;
  XDG_STATE_HOME: string;
} {
  const base = { ...process.env };
  const dataHome = base.XDG_DATA_HOME ?? path.join(rootDir, ".opencode", "data");
  const configHome = base.XDG_CONFIG_HOME ?? path.join(rootDir, ".opencode", "config");
  const stateHome = base.XDG_STATE_HOME ?? path.join(rootDir, ".opencode", "state");
  return {
    ...base,
    XDG_DATA_HOME: dataHome,
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: stateHome,
  };
}

function buildRunMessage(request: {
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  prompt: string;
  selectedText: string;
}): string {
  return [
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

function isOpencodeAvailable(): boolean {
  const probe = spawnSync("opencode", ["--version"], { encoding: "utf8" });
  return probe.status === 0;
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

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = extractText(value, 0);
    if (text) return text;
  }
  return undefined;
}

function extractText(value: unknown, depth: number): string | undefined {
  if (depth > 4 || value === null || value === undefined) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractText(item, depth + 1);
      if (text) return text;
    }
    return undefined;
  }

  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const prioritizedKeys = [
    "text",
    "message",
    "content",
    "delta",
    "response",
    "output",
    "completion",
    "value",
  ];

  for (const key of prioritizedKeys) {
    const text = extractText(record[key], depth + 1);
    if (text) return text;
  }

  for (const nestedKey of ["data", "result", "item", "payload"]) {
    const text = extractText(record[nestedKey], depth + 1);
    if (text) return text;
  }

  return undefined;
}
