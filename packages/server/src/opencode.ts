import { spawn } from "node:child_process";
import type {
  OpencodeModelCatalogItem,
  OpencodeRunRequest,
  OpencodeRunResult,
  JsonRecord,
} from "./types";

type ParsedLineEvent = {
  messages: string[];
  isError: boolean;
};

const JSON_PARSE_FAILED = Symbol("json-parse-failed");

export async function listOpencodeModelCatalog(rootDir: string): Promise<OpencodeModelCatalogItem[]> {
  const verboseResult = await runProcessCapture("opencode", ["models", "--verbose"], rootDir);
  if (!verboseResult.error) {
    const verboseCatalog = parseVerboseModelCatalog(`${verboseResult.stdout ?? ""}\n${verboseResult.stderr ?? ""}`);
    if (verboseCatalog.length > 0) {
      return verboseCatalog;
    }
  }

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

export async function startHeadlessOpencodeRun(request: OpencodeRunRequest): Promise<OpencodeRunResult> {
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
  let lastErrorMessage: string | undefined;

  const emitExit = (result: { success: boolean; error?: string }) => {
    if (handledExit) return;
    handledExit = true;
    request.onExit(result);
  };

  const consumeLine = (rawLine: string, fromStderr: boolean) => {
    const line = fromStderr ? normalizeStderrLine(rawLine) : sanitizeLine(rawLine);
    if (!line) return;

    const parsed = parseOpencodeLine(line);
    if (!parsed || parsed.messages.length === 0) return;

    for (const messageText of parsed.messages) {
      request.onMessage(messageText);
      if (parsed.isError || looksLikeError(messageText)) {
        lastErrorMessage = messageText;
      }
    }
  };

  let stdoutBuffer = "";
  let stderrBuffer = "";

  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutBuffer = consumeBufferedLines(stdoutBuffer, String(chunk), (line) => {
      consumeLine(line, false);
    });
  });

  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrBuffer = consumeBufferedLines(stderrBuffer, String(chunk), (line) => {
      consumeLine(line, true);
    });
  });

  child.on("error", (error) => {
    emitExit({ success: false, error: `Failed to run opencode: ${error.message}` });
  });

  child.on("close", (code) => {
    if (stdoutBuffer.trim().length > 0) {
      consumeLine(stdoutBuffer, false);
    }
    if (stderrBuffer.trim().length > 0) {
      consumeLine(stderrBuffer, true);
    }

    if (code === 0 && !lastErrorMessage) {
      emitExit({ success: true });
      return;
    }
    if (lastErrorMessage) {
      emitExit({ success: false, error: lastErrorMessage });
      return;
    }
    emitExit({ success: false, error: `opencode exited with status ${String(code ?? 1)}` });
  });

  return {
    ok: true,
    runId: request.runId,
    stop: () => {
      if (child.killed) return;
      child.kill("SIGTERM");
    },
  };
}

function parseVerboseModelCatalog(output: string): OpencodeModelCatalogItem[] {
  const lines = output.split(/\r?\n/);
  const catalog = new Map<string, OpencodeModelCatalogItem>();

  for (let index = 0; index < lines.length; index += 1) {
    const model = sanitizeLine(lines[index] ?? "");
    if (!isModelIdentifier(model)) continue;

    const parsedObject = parseJsonObjectAfterLine(lines, index + 1);
    const variants = parsedObject ? extractVariantNames(parsedObject.value) : [];
    catalog.set(model, {
      model,
      variants,
    });

    if (parsedObject) {
      index = Math.max(index, parsedObject.endLine);
    }
  }

  return [...catalog.values()].sort((a, b) => a.model.localeCompare(b.model));
}

function parseJsonObjectAfterLine(
  lines: readonly string[],
  startLine: number,
): { value: unknown; endLine: number } | null {
  let started = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let jsonText = "";

  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
    const line = stripAnsi(lines[lineIndex] ?? "");
    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const char = line[charIndex] ?? "";

      if (!started) {
        if (char.trim().length === 0) continue;
        if (char !== "{") {
          return null;
        }
        started = true;
      }

      jsonText += char;

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const parsed = parseJson(jsonText);
          if (parsed === JSON_PARSE_FAILED) {
            return null;
          }
          return { value: parsed, endLine: lineIndex };
        }
      }
    }

    if (started) {
      jsonText += "\n";
    }
  }

  return null;
}

function extractVariantNames(value: unknown): string[] {
  const variantsRecord = asRecord(asRecord(value)?.variants);
  if (!variantsRecord) return [];

  return Object.keys(variantsRecord)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function parseOpencodeLine(line: string): ParsedLineEvent | null {
  if (line.startsWith("event:")) return null;

  const payloadText = line.startsWith("data:") ? line.slice("data:".length).trim() : line;
  if (!payloadText || payloadText === "[DONE]") return null;

  const parsed = parseJson(payloadText);
  if (parsed === JSON_PARSE_FAILED) {
    return {
      messages: [payloadText],
      isError: looksLikeError(payloadText),
    };
  }

  return parseJsonPayload(parsed);
}

function parseJsonPayload(payload: unknown): ParsedLineEvent | null {
  if (typeof payload === "string") {
    const text = sanitizeLine(payload);
    if (!text) return null;
    return {
      messages: [text],
      isError: looksLikeError(text),
    };
  }

  if (Array.isArray(payload)) {
    const messages: string[] = [];
    let isError = false;
    for (const item of payload) {
      const parsedItem = parseJsonPayload(item);
      if (!parsedItem) continue;
      messages.push(...parsedItem.messages);
      isError = isError || parsedItem.isError;
    }
    if (messages.length === 0) return null;
    return {
      messages: dedupeMessages(messages),
      isError,
    };
  }

  const record = asRecord(payload);
  if (!record) return null;

  const eventType =
    toText(record.type) ?? toText(record.event) ?? toText(record.kind) ?? "message";

  const data = asRecord(record.data);
  const result = asRecord(record.result);
  const part = asRecord(record.part);

  const errorMessage = firstText(
    asRecord(record.error)?.message,
    asRecord(data?.error)?.message,
    asRecord(result?.error)?.message,
    record.error,
    data?.error,
    result?.error,
  );
  if (errorMessage) {
    return {
      messages: [errorMessage],
      isError: true,
    };
  }

  if (part && toText(part.type)?.toLowerCase() === "text") {
    const partText = firstText(part.text, part.message);
    if (partText) {
      return {
        messages: [partText],
        isError: false,
      };
    }
  }

  const primaryText = firstText(
    record.text,
    record.message,
    record.detail,
    record.reason,
    record.output,
    record.response,
    data?.text,
    data?.message,
    data?.detail,
    data?.output,
    result?.text,
    result?.message,
    result?.detail,
    result?.output,
    extractContentText(record.content),
    extractContentText(data?.content),
    extractContentText(result?.content),
  );
  if (primaryText) {
    return {
      messages: [primaryText],
      isError: isErrorEventType(eventType),
    };
  }

  if (part && toText(part.type)?.toLowerCase() === "tool") {
    const toolName = firstText(part.tool, part.name) ?? "tool";
    const state = asRecord(part.state);
    const input = asRecord(state?.input);
    const status = firstText(state?.status);
    const target = firstText(
      input?.filePath,
      input?.path,
      state?.path,
      asRecord(part.target)?.path,
      part.title,
    );
    const toolParts = [
      `tool ${toolName}`,
      status,
      target ? `(${compactPath(target)})` : undefined,
    ].filter((entry): entry is string => Boolean(entry));
    if (toolParts.length > 0) {
      return {
        messages: [toolParts.join(" ")],
        isError: status === "failed",
      };
    }
  }

  if (isStructuralEventType(eventType)) {
    return null;
  }

  return {
    messages: [humanizeEventType(eventType)],
    isError: isErrorEventType(eventType),
  };
}

function extractContentText(value: unknown): string | undefined {
  if (typeof value === "string") return sanitizeLine(value);
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (typeof item === "string") {
      const text = sanitizeLine(item);
      if (text) return text;
      continue;
    }
    const record = asRecord(item);
    if (!record) continue;
    const text = firstText(record.text, record.message, record.content);
    if (text) return text;
  }
  return undefined;
}

function consumeBufferedLines(
  buffer: string,
  nextChunk: string,
  onLine: (line: string) => void,
): string {
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

function normalizeStderrLine(rawLine: string): string | null {
  const cleaned = sanitizeLine(rawLine);
  if (!cleaned) return null;
  if (/^(INFO|DEBUG|TRACE)\b/.test(cleaned)) return null;
  if (/^\s*at\s+/.test(cleaned)) return null;
  if (cleaned === "fatal") return null;

  const messageField = /\bmessage=([^\r\n]+?)\s+stack=/i.exec(cleaned)?.[1]?.trim();
  if (messageField && messageField.length > 0) {
    return messageField;
  }

  const extractedError = /\berror=(.+)$/i.exec(cleaned)?.[1]?.trim();
  if (extractedError && extractedError.length > 0) {
    return extractedError;
  }

  return cleaned;
}

function looksLikeError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.startsWith("error") ||
    lower.includes(" failed") ||
    lower.includes("unexpected error") ||
    lower.includes("readonly database")
  );
}

function parseJson(text: string): unknown | typeof JSON_PARSE_FAILED {
  try {
    return JSON.parse(text);
  } catch {
    return JSON_PARSE_FAILED;
  }
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }
  return undefined;
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : undefined;
}

function dedupeMessages(messages: string[]): string[] {
  const result: string[] = [];
  for (const message of messages) {
    const text = sanitizeLine(message);
    if (!text) continue;
    if (result[result.length - 1] === text) continue;
    result.push(text);
  }
  return result;
}

function isStructuralEventType(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return (
    lower === "start" ||
    lower === "done" ||
    lower === "end" ||
    lower === "session" ||
    lower === "meta" ||
    lower === "status" ||
    lower === "progress" ||
    lower === "log" ||
    lower === "info" ||
    lower === "step" ||
    lower === "step_start" ||
    lower === "step_finish" ||
    lower === "session.updated" ||
    lower === "session.status" ||
    lower === "session.diff" ||
    lower === "message.updated" ||
    lower === "message.part.updated" ||
    lower === "message.part.removed"
  );
}

function isErrorEventType(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return lower === "error" || lower.endsWith("_error") || lower.includes("failed");
}

function humanizeEventType(eventType: string): string {
  return eventType.replace(/[._-]+/g, " ").trim();
}

function compactPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized.includes("/")) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 3) return normalized;
  return parts.slice(-3).join("/");
}

function buildRunMessage(request: {
  contextMode?: "code" | "files";
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

function isModelIdentifier(line: string): boolean {
  return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(line);
}

function stripAnsi(text: string): string {
  return text
    .replace(/\u001B\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\u001B\][^\u0007]*\u0007/g, "");
}
