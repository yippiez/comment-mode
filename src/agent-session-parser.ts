export type ParsedOpencodeEvent = { messages: string[]; isError: boolean };
export type SseState = { eventType: string | undefined; dataLines: string[] };

export function parseOpencodeJsonPayload(line: string): ParsedOpencodeEvent | null {
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

export function flushSseState(state: SseState): ParsedOpencodeEvent | null {
  const eventType = state.eventType;
  const rawData = state.dataLines.join("\n");
  state.eventType = undefined;
  state.dataLines = [];

  if (!eventType && rawData.trim().length === 0) return null;
  if (rawData.trim() === "[DONE]") return null;

  if (rawData.trim().startsWith("{") || rawData.trim().startsWith("[")) {
    try {
      const payload = JSON.parse(rawData);
      return parseOpencodePayload(payload, eventType);
    } catch {
      // fall through to direct text handling.
    }
  }

  const directText = sanitizeText(rawData);
  if (!directText) return null;

  if (!eventType || eventType === "text") {
    return { messages: [directText], isError: false };
  }

  if (isStructuralEvent(eventType)) {
    return null;
  }

  return {
    messages: [`${humanizeEventType(eventType)}: ${directText}`],
    isError: isErrorEvent(eventType),
  };
}

export function consumeBufferedLines(
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

export function sanitizeLine(line: string): string {
  return stripAnsi(line).trim();
}

export function shouldIgnoreStdoutLine(line: string): boolean {
  return line.startsWith("event:") || line.startsWith("data:");
}

export function looksJsonLike(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function looksLikeError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.startsWith("error") ||
    lower.includes(" failed") ||
    lower.includes("unexpected error") ||
    lower.includes("readonly database")
  );
}

export function normalizeStderrMessage(message: string): string | null {
  const cleaned = sanitizeLine(message);
  if (!cleaned) return null;

  if (/^(INFO|DEBUG|TRACE)\b/.test(cleaned)) {
    return null;
  }
  if (/^\s*at\s+/.test(cleaned)) {
    return null;
  }
  if (cleaned === "fatal") {
    return null;
  }

  const messageField = /\bmessage=([^\r\n]+?)\s+stack=/i.exec(cleaned)?.[1]?.trim();
  if (messageField && messageField.length > 0) {
    return messageField;
  }

  const extracted = /\berror=(.+)$/i.exec(cleaned)?.[1]?.trim();
  if (extracted && extracted.length > 0) {
    return extracted;
  }

  return cleaned;
}

function parseOpencodePayload(payload: unknown, fallbackType: string | undefined): ParsedOpencodeEvent | null {
  if (Array.isArray(payload)) {
    const messages: string[] = [];
    let isError = false;

    for (const item of payload) {
      const parsed = parseOpencodePayload(item, fallbackType);
      if (!parsed) continue;
      messages.push(...parsed.messages);
      isError = isError || parsed.isError;
    }

    if (messages.length === 0) return null;
    return {
      messages: dedupeMessages(messages).slice(-3),
      isError,
    };
  }

  if (typeof payload !== "object" || payload === null) return null;

  const record = payload as Record<string, unknown>;
  const eventType =
    toString(record.type) ?? toString(record.event) ?? toString(record.kind) ?? fallbackType ?? "json";
  const part = asRecord(record.part);
  const data = asRecord(record.data);
  const result = asRecord(record.result);

  const errorMessage = extractErrorMessage(record, data, result);
  if (errorMessage) {
    const withType = shouldPrefixType(eventType)
      ? `${humanizeEventType(eventType)}: ${errorMessage}`
      : errorMessage;
    return { messages: [withType], isError: true };
  }

  if (part) {
    const parsedPart = parsePart(eventType, part);
    if (parsedPart) return parsedPart;
  }

  const primaryTexts = collectPrimaryTexts(record, data, result);
  if (primaryTexts.length > 0) {
    const messages = primaryTexts.map((text) =>
      shouldPrefixType(eventType) ? `${humanizeEventType(eventType)}: ${text}` : text,
    );
    return {
      messages: dedupeMessages(messages).slice(-3),
      isError: isErrorEvent(eventType),
    };
  }

  const summary = summarizeJsonEvent(eventType, record, data, result);
  if (!summary) return null;
  if (isStructuralEvent(eventType) && summary === eventType) return null;

  return {
    messages: [summary],
    isError: isErrorEvent(eventType),
  };
}

function parsePart(eventType: string, part: Record<string, unknown>): ParsedOpencodeEvent | null {
  const partType = toString(part.type)?.toLowerCase();
  if (!partType) return null;

  if (partType === "text") {
    const text = sanitizeText(toString(part.text));
    if (!text) return null;
    return { messages: [text], isError: false };
  }

  if (partType === "tool") {
    const parsedTool = parseToolPart(part);
    if (parsedTool) return parsedTool;
  }

  if (partType === "step-start") {
    return null;
  }

  if (partType === "step-finish") {
    const reason = sanitizeText(firstString(part.reason, asRecord(part.state)?.status));
    const tokens = asRecord(part.tokens);
    const tokenSummary = summarizeTokens(tokens);

    const messages: string[] = [];
    if (reason && reason !== "stop") {
      messages.push(`step: ${reason}`);
    }
    if (tokenSummary) {
      messages.push(tokenSummary);
    }

    if (messages.length > 0) {
      return { messages, isError: false };
    }
    return null;
  }

  const text = sanitizeText(firstText(part));
  if (!text) return null;

  const withType = shouldPrefixType(eventType)
    ? `${humanizeEventType(eventType)}: ${text}`
    : text;

  return {
    messages: [withType],
    isError: isErrorEvent(eventType),
  };
}

function parseToolPart(part: Record<string, unknown>): ParsedOpencodeEvent | null {
  const toolName = sanitizeText(firstString(part.tool, part.name)) ?? "tool";
  const state = asRecord(part.state);
  const status = sanitizeText(firstString(state?.status));
  const input = asRecord(state?.input);
  const metadata = asRecord(state?.metadata);

  const targetPath = sanitizeText(
    firstString(
      input?.filePath,
      input?.path,
      input?.target,
      part.title,
      asRecord(part.target)?.path,
    ),
  );

  const compactTarget = targetPath ? compactPath(targetPath) : undefined;

  const messages: string[] = [];
  const main = [
    `tool ${toolName}`,
    status ?? undefined,
    compactTarget ? `(${compactTarget})` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  messages.push(main);

  if (toolName === "read") {
    const offset = firstNumber(input?.offset);
    const limit = firstNumber(input?.limit);
    if (offset !== undefined || limit !== undefined) {
      const start = offset !== undefined ? Math.max(1, offset) : 1;
      const end = limit !== undefined ? start + Math.max(1, limit) - 1 : undefined;
      messages.push(
        end !== undefined ? `read lines ${String(start)}-${String(end)}` : `read from line ${String(start)}`,
      );
    }

    const preview = sanitizeText(toString(metadata?.preview));
    if (preview) {
      messages.push(shorten(preview, 120));
    }
  }

  const errorMessage = sanitizeText(
    firstString(
      asRecord(state?.error)?.message,
      state?.error,
      asRecord(part.error)?.message,
      part.error,
    ),
  );
  if (errorMessage) {
    messages.push(`error: ${errorMessage}`);
  }

  return {
    messages: dedupeMessages(messages).slice(0, 3),
    isError: Boolean(errorMessage) || status === "failed",
  };
}

function collectPrimaryTexts(...values: Array<unknown>): string[] {
  const collected: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    extractTexts(value, 0, collected, seen);
    if (collected.length >= 6) break;
  }

  return collected;
}

function extractTexts(
  value: unknown,
  depth: number,
  output: string[],
  seen: Set<string>,
): void {
  if (depth > 5 || output.length >= 6 || value === null || value === undefined) return;

  if (typeof value === "string") {
    const text = sanitizeText(value);
    if (!text) return;
    if (looksLikeJson(text)) return;
    if (seen.has(text)) return;
    seen.add(text);
    output.push(shorten(text, 220));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractTexts(item, depth + 1, output, seen);
      if (output.length >= 6) break;
    }
    return;
  }

  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const role = toString(record.role)?.toLowerCase();
  if (role === "user" || role === "system") return;

  const type = toString(record.type)?.toLowerCase();
  if (type === "tool_call" || type === "input_text") return;

  for (const key of [
    "text",
    "message",
    "msg",
    "detail",
    "reason",
    "answer",
    "assistant",
    "final",
    "final_text",
    "output_text",
    "content",
    "delta",
    "response",
    "output",
    "completion",
    "value",
  ]) {
    extractTexts(record[key], depth + 1, output, seen);
    if (output.length >= 6) return;
  }

  for (const key of [
    "choices",
    "messages",
    "parts",
    "chunks",
    "items",
    "data",
    "result",
    "item",
    "payload",
  ]) {
    extractTexts(record[key], depth + 1, output, seen);
    if (output.length >= 6) return;
  }
}

function extractErrorMessage(
  record: Record<string, unknown>,
  data: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
): string | undefined {
  const rootError = asRecord(record.error);
  const dataError = asRecord(data?.error);
  const resultError = asRecord(result?.error);

  return sanitizeText(
    firstString(
      asRecord(rootError?.data)?.message,
      asRecord(dataError?.data)?.message,
      asRecord(resultError?.data)?.message,
      rootError?.message,
      dataError?.message,
      resultError?.message,
      record.error,
      data?.error,
      result?.error,
      record.message,
      data?.message,
      result?.message,
    ),
  );
}

function summarizeJsonEvent(
  eventType: string,
  record: Record<string, unknown>,
  data: Record<string, unknown> | undefined,
  result: Record<string, unknown> | undefined,
): string | undefined {
  const fields: string[] = [];

  const status = sanitizeText(
    firstString(
      record.status,
      data?.status,
      result?.status,
      record.state,
      data?.state,
      result?.state,
      record.phase,
      data?.phase,
      result?.phase,
    ),
  );
  if (status) fields.push(status);

  const reason = sanitizeText(firstString(record.reason, data?.reason, result?.reason));
  if (reason && reason !== status) fields.push(reason);

  const model = sanitizeText(firstString(record.model, data?.model, result?.model));
  if (model) fields.push(`model=${model}`);

  const compactFile = sanitizeText(
    firstString(record.filePath, data?.filePath, result?.filePath, record.path, data?.path, result?.path),
  );
  if (compactFile) fields.push(compactPath(compactFile));

  const tokenSummary = summarizeTokens(
    asRecord(record.tokens) ?? asRecord(data?.tokens) ?? asRecord(result?.tokens) ?? asRecord(record.usage),
  );
  if (tokenSummary) fields.push(tokenSummary);

  if (fields.length === 0) {
    return isStructuralEvent(eventType) ? undefined : humanizeEventType(eventType);
  }

  return `${humanizeEventType(eventType)}: ${fields.join(" · ")}`;
}

function summarizeTokens(tokens: Record<string, unknown> | undefined): string | undefined {
  if (!tokens) return undefined;

  const input = firstNumber(tokens.input, tokens.input_tokens, tokens.prompt_tokens);
  const output = firstNumber(tokens.output, tokens.output_tokens, tokens.completion_tokens);
  const total = firstNumber(tokens.total, tokens.total_tokens);

  const parts = [
    input !== undefined ? `in ${String(input)}` : undefined,
    output !== undefined ? `out ${String(output)}` : undefined,
    total !== undefined ? `total ${String(total)}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? `tokens ${parts.join(" ")}` : undefined;
}

function dedupeMessages(messages: string[]): string[] {
  const result: string[] = [];
  for (const message of messages) {
    const text = sanitizeText(message);
    if (!text) continue;
    if (result[result.length - 1] === text) continue;
    result.push(text);
  }
  return result;
}

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length === 0) return undefined;
  return compact;
}

function shorten(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function compactPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  const base = trimmed.replace(/\\/g, "/");
  if (!base.includes("/")) return base;
  const normalized = base.replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 3) return normalized;
  return parts.slice(-3).join("/");
}

function shouldPrefixType(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return lower !== "text";
}

function humanizeEventType(eventType: string): string {
  return eventType.replace(/[._-]+/g, " ").trim();
}

function isStructuralEvent(eventType: string): boolean {
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

function isErrorEvent(eventType: string): boolean {
  const lower = eventType.toLowerCase();
  return lower === "error" || lower.endsWith("_error") || lower.includes("failed");
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*[A-Za-z]/g, "").replace(/\u001B\][^\u0007]*\u0007/g, "");
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = toString(value);
    if (text) return text;
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = extractFirstText(value, 0);
    if (text) return text;
  }
  return undefined;
}

function extractFirstText(value: unknown, depth: number): string | undefined {
  if (depth > 4 || value === null || value === undefined) return undefined;

  if (typeof value === "string") {
    const text = sanitizeText(value);
    if (!text || looksLikeJson(text)) return undefined;
    return text;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractFirstText(item, depth + 1);
      if (text) return text;
    }
    return undefined;
  }

  if (typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;

  for (const key of [
    "message",
    "text",
    "detail",
    "reason",
    "output_text",
    "content",
    "delta",
    "response",
    "output",
    "completion",
    "value",
    "data",
  ]) {
    const text = extractFirstText(record[key], depth + 1);
    if (text) return text;
  }

  return undefined;
}
