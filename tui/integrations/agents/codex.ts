/**
 * Codex agent integration: launches codex in JSON streaming mode.
 * NOTE: Parse functions are stubs — the codex JSON output format is not
 * yet known / login is not configured. Fill in parseCodexEvent() once
 * the output schema is available.
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
// Codex harness
// ---------------------------------------------------------------------------

export class Codex extends BaseHarness {
    readonly command = "codex";
    readonly harnessId = "codex";

    constructor(options: HarnessOptions) {
        super(options);
    }

    // ------------------------------------------------------------------
    // Abstract implementations
    // ------------------------------------------------------------------

    /**
     * Stub: codex JSON event format is not yet known.
     * TODO: implement parseCodexEvent() once the schema is available.
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
            // TODO: implement parseCodexEvent(parsed)
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
            // codex doesn't have a direct model listing CLI command yet;
            // return an empty list for now.
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
            "exec",
            "--json",
            "--model", request.model,
            message,
        ];
    }
}

// TODO: implement once codex JSON output format is known
// function parseCodexEvent(parsed: unknown): ParsedLineEvent | null { ... }
