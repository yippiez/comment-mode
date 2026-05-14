/**
 * OpenCode integration: launches OpenCode/headless runs, parses streaming
 * JSON line events, and updates the agent timeline via `SIGNALS`.
 */
import {
    BaseHarness,
    type HarnessOptions,
    type ModelCatalogItem,
    type ParsedLineEvent,
    type RunRequest,
    parseJson,
    runProcessCapture,
    sanitizeLine,
    firstText,
    toText,
    asJsonRecord,
    isModelIdentifier,
    stripAnsi,
    looksLikeError,
    compactPath,
} from "./interface";

export type OpenCodeModelCatalogItem = ModelCatalogItem;

export type OpenCodeSubmission = {
  updateId?: string;
  viewMode?: import("../../types").ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  selectedText: string;
  prompt: string;
  model: string;
  thinkingLevel?: string;
};

const JSON_PARSE_FAILED = Symbol("json-parse-failed");

// ---------------------------------------------------------------------------
// OpenCode harness
// ---------------------------------------------------------------------------

export class OpenCode extends BaseHarness {
    readonly command = "opencode";
    readonly harnessId = "opencode";

    constructor(options: HarnessOptions) {
        super(options);
    }

    // ------------------------------------------------------------------
    // Abstract implementations
    // ------------------------------------------------------------------

    protected parseLine(line: string): ParsedLineEvent | null {
        if (line.startsWith("event:")) { return null; }

        const payloadText = line.startsWith("data:")
            ? line.slice("data:".length).trim()
            : line;
        if (!payloadText || payloadText === "[DONE]") { return null; }

        const parsed = parseJson(payloadText);
        if (parsed === JSON_PARSE_FAILED) {
            return {
                messages: [payloadText],
                isError: looksLikeError(payloadText),
            };
        }

        return parseJsonPayload(parsed);
    }

    async listModels(): Promise<ModelCatalogItem[]> {
        try {
            return await listOpencodeModelCatalogInternal(this.rootDir);
        } catch {
            return [];
        }
    }

    protected listModelsArgs(): string[] {
        return ["models", "--verbose"];
    }

    protected buildRunArgs(request: RunRequest): string[] {
        const message = this.buildRunMessage(request);
        const runArgs: string[] = [
            "run",
            message,
            "--format", "json",
            "--model", request.model,
        ];
        if (request.variant && request.variant !== "auto") {
            runArgs.push("--variant", request.variant);
        }
        return runArgs;
    }
}

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

async function listOpencodeModelCatalogInternal(rootDir: string): Promise<ModelCatalogItem[]> {
    const verboseResult = await runProcessCapture("opencode", ["models", "--verbose"], rootDir, 1800);
    if (!verboseResult.error) {
        const verboseCatalog = parseVerboseModelCatalog(
            `${verboseResult.stdout ?? ""}\n${verboseResult.stderr ?? ""}`,
        );
        if (verboseCatalog.length > 0) {
            return verboseCatalog;
        }
    }

    const result = await runProcessCapture("opencode", ["models"], rootDir, 1800);
    if (result.error) { return []; }

    const merged = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    const models = new Set<string>();
    for (const rawLine of merged.split(/\r?\n/)) {
        const line = sanitizeLine(rawLine);
        if (!line) { continue; }
        if (!isModelIdentifier(line)) { continue; }
        models.add(line);
    }

    return [...models]
        .sort((a, b) => a.localeCompare(b))
        .map((model) => ({ model, variants: [] }));
}

function parseVerboseModelCatalog(output: string): ModelCatalogItem[] {
    const lines = output.split(/\r?\n/);
    const catalog = new Map<string, ModelCatalogItem>();

    for (let index = 0; index < lines.length; index += 1) {
        const model = sanitizeLine(lines[index] ?? "");
        if (!isModelIdentifier(model)) { continue; }

        const parsedObject = parseJsonObjectAfterLine(lines, index + 1);
        const variants = parsedObject ? extractVariantNames(parsedObject.value) : [];
        catalog.set(model, { model, variants });

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
                if (char.trim().length === 0) { continue; }
                if (char !== "{") { return null; }
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
                    if (parsed === JSON_PARSE_FAILED) { return null; }
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
    const variantsRecord = asJsonRecord(asJsonRecord(value)?.variants);
    if (!variantsRecord) { return []; }

    return Object.keys(variantsRecord)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Event parsing (opencode-specific)
// ---------------------------------------------------------------------------

function parseJsonPayload(payload: unknown): ParsedLineEvent | null {
    if (typeof payload === "string") {
        const text = sanitizeLine(payload);
        if (!text) { return null; }
        return { messages: [text], isError: looksLikeError(text) };
    }

    if (Array.isArray(payload)) {
        const messages: string[] = [];
        let isError = false;
        for (const item of payload) {
            const parsedItem = parseJsonPayload(item);
            if (!parsedItem) { continue; }
            messages.push(...parsedItem.messages);
            isError = isError || parsedItem.isError;
        }
        if (messages.length === 0) { return null; }
        return { messages: dedupeMessages(messages), isError };
    }

    const record = asJsonRecord(payload);
    if (!record) { return null; }

    const eventType =
        toText(record.type) ?? toText(record.event) ?? toText(record.kind) ?? "message";

    const data = asJsonRecord(record.data);
    const result = asJsonRecord(record.result);
    const part = asJsonRecord(record.part);

    const errorMessage = firstText(
        asJsonRecord(record.error)?.message,
        asJsonRecord(data?.error)?.message,
        asJsonRecord(result?.error)?.message,
        record.error,
        data?.error,
        result?.error,
    );
    if (errorMessage) {
        return { messages: [errorMessage], isError: true };
    }

    if (part && toText(part.type)?.toLowerCase() === "text") {
        const partText = firstText(part.text, part.message);
        if (partText) {
            return { messages: [partText], isError: false };
        }
    }

    const primaryText = firstText(
        record.text, record.message, record.detail, record.reason,
        record.output, record.response,
        data?.text, data?.message, data?.detail, data?.output,
        result?.text, result?.message, result?.detail, result?.output,
        extractContentText(record.content),
        extractContentText(data?.content),
        extractContentText(result?.content),
    );
    if (primaryText) {
        return { messages: [primaryText], isError: isErrorEventType(eventType) };
    }

    if (part && toText(part.type)?.toLowerCase() === "tool") {
        const toolName = firstText(part.tool, part.name) ?? "tool";
        const state = asJsonRecord(part.state);
        const input = asJsonRecord(state?.input);
        const status = firstText(state?.status);
        const target = firstText(
            input?.filePath, input?.path, state?.path,
            asJsonRecord(part.target)?.path, part.title,
        );
        const toolParts = [
            `tool ${toolName}`,
            status,
            target ? `(${compactPath(target)})` : undefined,
        ].filter((entry): entry is string => Boolean(entry));
        if (toolParts.length > 0) {
            return { messages: [toolParts.join(" ")], isError: status === "failed" };
        }
    }

    if (isStructuralEventType(eventType)) { return null; }

    return { messages: [humanizeEventType(eventType)], isError: isErrorEventType(eventType) };
}

function extractContentText(value: unknown): string | undefined {
    if (typeof value === "string") { return sanitizeLine(value); }
    if (!Array.isArray(value)) { return undefined; }
    for (const item of value) {
        if (typeof item === "string") {
            const text = sanitizeLine(item);
            if (text) { return text; }
            continue;
        }
        const record = asJsonRecord(item);
        if (!record) { continue; }
        const text = firstText(record.text, record.message, record.content);
        if (text) { return text; }
    }
    return undefined;
}

function dedupeMessages(messages: string[]): string[] {
    const result: string[] = [];
    for (const message of messages) {
        const text = sanitizeLine(message);
        if (!text) { continue; }
        if (result[result.length - 1] === text) { continue; }
        result.push(text);
    }
    return result;
}

function isStructuralEventType(eventType: string): boolean {
    const lower = eventType.toLowerCase();
    return (
        lower === "start" ||
        lower === "done" || lower === "end" ||
        lower === "session" || lower === "meta" ||
        lower === "status" || lower === "progress" ||
        lower === "log" || lower === "info" ||
        lower === "step" || lower === "step_start" || lower === "step_finish" ||
        lower === "session.updated" || lower === "session.status" ||
        lower === "session.diff" ||
        lower === "message.updated" ||
        lower === "message.part.updated" || lower === "message.part.removed"
    );
}

function isErrorEventType(eventType: string): boolean {
    const lower = eventType.toLowerCase();
    return lower === "error" || lower.endsWith("_error") || lower.includes("failed");
}

function humanizeEventType(eventType: string): string {
    return eventType.replace(/[._-]+/g, " ").trim();
}
