import { spawn, spawnSync } from "node:child_process";
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

  const result = spawnSync("opencode", ["models"], {
    cwd: rootDir,
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

  const child = spawn(
    "opencode",
    ["run", message, "--format", "json", "--model", request.model],
    {
      cwd: request.rootDir,
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
