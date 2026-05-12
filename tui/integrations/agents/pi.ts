/**
 * Pi agent integration: launches pi in JSON streaming mode, parses
 * AgentSessionEvent lines, and surfaces text/tool events as messages.
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
} from "./interface";

const JSON_PARSE_FAILED = Symbol("json-parse-failed");

// ---------------------------------------------------------------------------
// Pi harness
// ---------------------------------------------------------------------------

export class Pi extends BaseHarness {
    readonly command = "pi";
    readonly harnessId = "pi";

    constructor(options: HarnessOptions) {
        super(options);
    }

    // ------------------------------------------------------------------
    // Abstract implementations
    // ------------------------------------------------------------------

    protected parseLine(line: string): ParsedLineEvent | null {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("{")) { return null; }

        const parsed = parseJson(trimmed);
        if (parsed === JSON_PARSE_FAILED) {
            return {
                messages: [trimmed],
                isError: looksLikeError(trimmed),
            };
        }

        return parsePiEvent(parsed);
    }

    async listModels(): Promise<ModelCatalogItem[]> {
        try {
            const result = await runProcessCapture("pi", ["--models", "list"], this.rootDir);
            const merged = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
            const models = new Set<string>();
            for (const rawLine of merged.split(/\r?\n/)) {
                const line = sanitizeLine(rawLine);
                if (!line || !isModelIdentifier(line)) { continue; }
                models.add(line);
            }

            if (models.size === 0) { return []; }

            return [...models]
                .sort((a, b) => a.localeCompare(b))
                .map((model) => ({ model, variants: [] }));
        } catch {
            return [];
        }
    }

    protected listModelsArgs(): string[] {
        return ["--models", "list"];
    }

    protected buildRunArgs(request: RunRequest): string[] {
        const message = this.buildRunMessage(request);
        return [
            "--mode", "json",
            "--print",
            "--no-session",
            "--model", request.model,
            message,
        ];
    }
}

// ---------------------------------------------------------------------------
// Pi event parsing
//
// Pi JSON events (from docs/json.md):
//   {"type":"session","version":3,"id":"uuid","timestamp":"...","cwd":"/path"}
//   {"type":"agent_start"}
//   {"type":"turn_start"}
//   {"type":"message_start","message":{"role":"assistant","content":[],...}}
//   {"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","delta":"Hello",...}}
//   {"type":"message_end","message":{...}}
//   {"type":"turn_end","message":{...},"toolResults":[]}
//   {"type":"agent_end","messages":[...]}
//   {"type":"tool_execution_start","toolCallId":"...","toolName":"bash","args":{...}}
//   {"type":"tool_execution_end","toolCallId":"...","toolName":"bash","result":{...},"isError":false}
// ---------------------------------------------------------------------------

function parsePiEvent(parsed: unknown): ParsedLineEvent | null {
    const record = asJsonRecord(parsed);
    if (!record) { return null; }

    const eventType = toText(record.type);
    if (!eventType) { return null; }

    switch (eventType) {
        case "session":
        case "agent_start":
        case "turn_start":
        case "compaction_start":
        case "compaction_end":
        case "auto_retry_start":
        case "auto_retry_end":
        case "queue_update":
            // Structural events — no user-visible text
            return null;

        case "message_start": {
            const role = toText(asJsonRecord(record.message)?.role);
            if (role === "user") { return null; }
            const contentText = extractMessageContentText(record.message);
            if (contentText) {
                return { messages: [contentText], isError: false };
            }
            return null;
        }

        case "message_update": {
            const deltaEvent = asJsonRecord(record.assistantMessageEvent);
            const deltaType = toText(deltaEvent?.type);

            if (deltaType === "text_delta") {
                const delta = toText(deltaEvent?.delta) ?? toText(deltaEvent?.text);
                if (delta) {
                    return { messages: [delta], isError: false };
                }
            }

            if (deltaType === "tool_call_delta" || deltaType === "tool_use") {
                const toolName = firstText(
                    deltaEvent?.toolName,
                    deltaEvent?.name,
                    record.toolName,
                );
                if (toolName) {
                    return {
                        messages: [`tool ${toolName} ...`],
                        isError: false,
                    };
                }
            }

            // Fallback: extract any content from the updated message
            const contentText = extractMessageContentText(record.message);
            if (contentText) {
                return { messages: [contentText], isError: false };
            }
            return null;
        }

        case "message_end": {
            // Emit a summary of the completed message
            const role = toText(asJsonRecord(record.message)?.role);
            if (role === "assistant") {
                return { messages: [""], isError: false };
            }
            return null;
        }

        case "tool_execution_start": {
            const toolName = toText(record.toolName) ?? "tool";
            const args = asJsonRecord(record.args);
            const filePath = firstText(args?.filePath, args?.path, args?.file_path, args?.target, args?.file);
            const parts = [
                `running ${toolName}`,
                filePath ? `(${filePath.split("/").pop() ?? filePath})` : undefined,
            ].filter((entry): entry is string => entry != null);
            return { messages: [parts.join(" ")], isError: false };
        }

        case "tool_execution_end": {
            const toolName = toText(record.toolName) ?? "tool";
            const isError = record.isError === true;
            const result = asJsonRecord(record.result);
            const statusText = isError
                ? "failed"
                : toText(result?.status) ?? "completed";
            return {
                messages: [`${toolName} ${statusText}`],
                isError,
            };
        }

        case "turn_end": {
            return null;
        }

        case "agent_end": {
            return { messages: [""], isError: false };
        }

        default: {
            // Unknown event — try to extract any text fields
            const text = firstText(
                record.text,
                record.message,
                record.content,
                record.output,
                record.error,
            );
            if (text) {
                return {
                    messages: [text],
                    isError: eventType.includes("error"),
                };
            }
            return null;
        }
    }
}

function extractMessageContentText(message: unknown): string | undefined {
    const record = asJsonRecord(message);
    if (!record) { return undefined; }

    // content can be a string or an array of content blocks
    const content = record.content;
    if (typeof content === "string") {
        const text = sanitizeLine(stripAnsi(content));
        return text || undefined;
    }

    if (Array.isArray(content)) {
        const texts: string[] = [];
        for (const block of content) {
            const blockRecord = asJsonRecord(block);
            if (!blockRecord) { continue; }
            const blockType = toText(blockRecord.type);
            if (blockType === "text" || blockType === "tool_use" || blockType === "tool_result") {
                const blockText = firstText(
                    blockRecord.text,
                    blockRecord.content,
                    blockRecord.name,
                );
                if (blockText) {
                    texts.push(blockText);
                }
            }
        }
        if (texts.length > 0) {
            return texts.join(" ");
        }
    }

    return undefined;
}
