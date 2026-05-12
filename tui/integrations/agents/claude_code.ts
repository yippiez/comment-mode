/**
 * Claude Code agent integration: launches claude in stream-json mode.
 * NOTE: Parse functions are stubs — the claude stream-json output format
 * is not yet known / login is not configured. Fill in parseClaudeEvent()
 * once the output schema is available.
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
    isModelIdentifier,
    looksLikeError,
} from "./interface";

const JSON_PARSE_FAILED = Symbol("json-parse-failed");

// ---------------------------------------------------------------------------
// Claude Code harness
// ---------------------------------------------------------------------------

export class ClaudeCode extends BaseHarness {
    readonly command = "claude";
    readonly harnessId = "claude_code";

    constructor(options: HarnessOptions) {
        super(options);
    }

    // ------------------------------------------------------------------
    // Abstract implementations
    // ------------------------------------------------------------------

    /**
     * Stub: claude stream-json event format is not yet known.
     * TODO: implement parseClaudeEvent() once the schema is available.
     */
    protected parseLine(line: string): ParsedLineEvent | null {
        const trimmed = line.trim();
        if (!trimmed) { return null; }

        // If it looks like JSON, try to parse it
        if (trimmed.startsWith("{")) {
            const parsed = parseJson(trimmed);
            if (parsed === JSON_PARSE_FAILED) {
                return {
                    messages: [trimmed],
                    isError: looksLikeError(trimmed),
                };
            }
            // TODO: implement parseClaudeEvent(parsed)
            return null;
        }

        // Plain text output
        return {
            messages: [trimmed],
            isError: looksLikeError(trimmed),
        };
    }

    async listModels(): Promise<ModelCatalogItem[]> {
        try {
            // claude doesn't have a clean model listing CLI; return empty
            return [];
        } catch {
            return [];
        }
    }

    protected listModelsArgs(): string[] {
        return ["--help"]; // placeholder
    }

    protected buildRunArgs(request: RunRequest): string[] {
        const message = this.buildRunMessage(request);
        return [
            "-p",
            "--output-format", "stream-json",
            "--model", request.model,
            "--no-session-persistence",
            message,
        ];
    }
}

// TODO: implement once claude stream-json output format is known
// function parseClaudeEvent(parsed: unknown): ParsedLineEvent | null { ... }
