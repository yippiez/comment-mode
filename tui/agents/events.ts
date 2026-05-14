/**
 * Agent Run Event normalization: decodes Pi/OpenCode streaming JSON lines into
 * one small event vocabulary for the TUI and CLI.
 */

export type AgentId = "opencode" | "pi";

export type AgentRunEventKind =
  | "status"
  | "assistant_text"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "usage"
  | "error";

export type AgentRunEvent = {
  readonly kind: AgentRunEventKind;
  readonly text: string;
  readonly rawType: string;
  readonly toolName?: string;
  readonly isError?: boolean;
};

type JsonRecord = Record<string, unknown>;

/**
 * Parses a single stream line from an Agent Adapter into normalized events.
 * @param agent - Agent Adapter identifier
 * @param rawLine - Raw stdout/stderr line
 * @returns Zero or more Agent Run Events
 */
export function parseAgentStreamLine(agent: AgentId, rawLine: string): readonly AgentRunEvent[] {
    const line = normalizeStreamLine(rawLine);
    if (!line) { return []; }

    const parsed = parseJsonObject(line);
    if (!parsed) {
        return [{ kind: "status", text: line, rawType: "text" }];
    }

    if (agent === "opencode") {
        return parseOpenCodeEvent(parsed);
    }
    return parsePiEvent(parsed);
}

/**
 * Formats an Agent Run Event for compact terminal display.
 * @param event - Event to render
 * @returns Human-readable one-line display text
 */
export function formatAgentRunEvent(event: AgentRunEvent): string {
    switch (event.kind) {
        case "assistant_text": return event.text;
        case "thinking": return `thinking: ${event.text}`;
        case "tool_call": return `tool: ${event.text}`;
        case "tool_result": return `tool result: ${event.text}`;
        case "usage": return `usage: ${event.text}`;
        case "error": return `error: ${event.text}`;
        case "status": return event.text;
    }
}

/** Normalizes SSE-ish and ANSI-wrapped stream lines. */
function normalizeStreamLine(rawLine: string): string {
    const stripped = stripAnsi(rawLine).trim();
    if (!stripped || stripped === "[DONE]") { return ""; }
    if (stripped.startsWith("event:")) { return ""; }
    if (stripped.startsWith("data:")) { return stripped.slice("data:".length).trim(); }
    return stripped;
}

/** Parses a JSON object and rejects non-object values. */
function parseJsonObject(text: string): JsonRecord | null {
    try {
        const parsed: unknown = JSON.parse(text);
        return asRecord(parsed);
    } catch {
        return null;
    }
}

/** Parses OpenCode raw JSON events. */
function parseOpenCodeEvent(record: JsonRecord): readonly AgentRunEvent[] {
    const rawType = readText(record.type) ?? "message";
    const part = asRecord(record.part);

    if (rawType === "step_start") {
        return [{ kind: "status", text: "step started", rawType }];
    }

    if (rawType === "step_finish") {
        const tokens = asRecord(part?.tokens);
        const total = readNumber(tokens?.total);
        const suffix = typeof total === "number" ? ` (${total} tokens)` : "";
        return [{ kind: "usage", text: `step finished${suffix}`, rawType }];
    }

    if (rawType === "text") {
        const text = readText(part?.text) ?? readText(record.text);
        return text ? [{ kind: "assistant_text", text, rawType }] : [];
    }

    if (rawType === "tool_use") {
        const toolName = readText(part?.tool) ?? readText(part?.name) ?? "tool";
        const state = asRecord(part?.state);
        const status = readText(state?.status) ?? "running";
        const input = stringifyShort(state?.input);
        const text = input ? `${toolName} ${status} ${input}` : `${toolName} ${status}`;
        return [{ kind: "tool_call", text, rawType, toolName }];
    }

    const errorText = readText(record.error) ?? readText(asRecord(record.error)?.message);
    if (errorText) {
        return [{ kind: "error", text: errorText, rawType, isError: true }];
    }

    return [];
}

/** Parses Pi AgentSessionEvent JSON records. */
function parsePiEvent(record: JsonRecord): readonly AgentRunEvent[] {
    const rawType = readText(record.type);
    if (!rawType) { return []; }

    if (rawType === "agent_start" || rawType === "turn_start") {
        return [{ kind: "status", text: rawType.replace("_", " "), rawType }];
    }

    if (rawType === "agent_end" || rawType === "turn_end") {
        return [{ kind: "status", text: rawType.replace("_", " "), rawType }];
    }

    if (rawType === "tool_execution_start") {
        const toolName = readText(record.toolName) ?? "tool";
        const args = stringifyShort(record.args);
        const text = args ? `${toolName} ${args}` : toolName;
        return [{ kind: "tool_call", text, rawType, toolName }];
    }

    if (rawType === "tool_execution_end") {
        const toolName = readText(record.toolName) ?? "tool";
        const isError = record.isError === true;
        const result = stringifyShort(record.result);
        const text = result ? `${toolName} ${result}` : `${toolName} completed`;
        return [{ kind: "tool_result", text, rawType, toolName, isError }];
    }

    if (rawType !== "message_update") {
        return [];
    }

    const event = asRecord(record.assistantMessageEvent);
    const eventType = readText(event?.type);
    if (!eventType) { return []; }

    if (eventType === "text_delta") {
        const text = readText(event?.delta) ?? readText(event?.text);
        return text ? [{ kind: "assistant_text", text, rawType: eventType }] : [];
    }

    if (eventType === "thinking_delta") {
        const text = readText(event?.delta) ?? readText(event?.text);
        return text ? [{ kind: "thinking", text, rawType: eventType }] : [];
    }

    if (eventType === "toolcall_start" || eventType === "toolcall_delta" || eventType === "tool_call_delta") {
        const partial = asRecord(event?.partial);
        const content = Array.isArray(partial?.content) ? partial.content : [];
        const tool = findLastToolCall(content);
        if (!tool) { return []; }
        const toolName = readText(tool.name) ?? "tool";
        const args = stringifyShort(tool.arguments ?? tool.partialArgs);
        const text = args ? `${toolName} ${args}` : toolName;
        return [{ kind: "tool_call", text, rawType: eventType, toolName }];
    }

    if (eventType === "text_end" || eventType === "thinking_end") {
        return [];
    }

    return [];
}

/** Finds the last tool call content block in a Pi partial message. */
function findLastToolCall(content: readonly unknown[]): JsonRecord | null {
    for (const item of [...content].reverse()) {
        const record = asRecord(item);
        if (readText(record?.type) === "toolCall") { return record; }
    }
    return null;
}

/** Converts unknown JSON to a record when valid. */
function asRecord(value: unknown): JsonRecord | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) { return null; }
    return value as JsonRecord;
}

/** Reads a non-empty string field. */
function readText(value: unknown): string | null {
    if (typeof value !== "string") { return null; }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/** Reads a number field. */
function readNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Creates a compact JSON-ish value preview. */
function stringifyShort(value: unknown): string | null {
    if (value === null || value === undefined) { return null; }
    if (typeof value === "string") { return value.length > 80 ? `${value.slice(0, 77)}...` : value; }
    if (typeof value === "number" || typeof value === "boolean") { return String(value); }
    try {
        const text = JSON.stringify(value);
        if (!text || text === "{}") { return null; }
        return text.length > 80 ? `${text.slice(0, 77)}...` : text;
    } catch {
        return null;
    }
}

/** Removes common ANSI escape sequences from agent output. */
function stripAnsi(text: string): string {
    return text
        .replace(/\u001B\[[0-9;]*[A-Za-z]/g, "")
        .replace(/\u001B\][^\u0007]*\u0007/g, "");
}
