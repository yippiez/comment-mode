/**
 * Shared harness interface and streaming utilities for agent integrations.
 * Provides types, process management, and JSON line parsing shared across
 * all agent backends (opencode, pi, codex, claude_code).
 */
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import type { AgentModel, AgentUpdate, ViewMode } from "../../types";

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export type JsonRecord = Record<string, unknown>;

const JSON_PARSE_FAILED = Symbol("json-parse-failed");

export function parseJson(text: string): unknown | typeof JSON_PARSE_FAILED {
    try {
        return JSON.parse(text);
    } catch {
        return JSON_PARSE_FAILED;
    }
}

export function toText(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function asJsonRecord(value: unknown): JsonRecord | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as JsonRecord)
        : undefined;
}

export function firstText(...values: unknown[]): string | undefined {
    for (const value of values) {
        const text = toText(value);
        if (text) { return text; }
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

export function sanitizeLine(line: string): string {
    return stripAnsi(line).trim();
}

export function stripAnsi(text: string): string {
    return text
        .replace(/\u001B\[[0-9;]*[A-Za-z]/g, "")
        .replace(/\u001B\][^\u0007]*\u0007/g, "");
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

export function compactPath(value: string): string {
    const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized.includes("/")) { return normalized; }
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= 3) { return normalized; }
    return parts.slice(-3).join("/");
}

export function dedupeMessages(messages: string[]): string[] {
    const result: string[] = [];
    for (const message of messages) {
        const text = sanitizeLine(message);
        if (!text) { continue; }
        if (result[result.length - 1] === text) { continue; }
        result.push(text);
    }
    return result;
}

export function isModelIdentifier(line: string): boolean {
    return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(line);
}

// ---------------------------------------------------------------------------
// Buffer / streaming helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

export type ProcessCaptureResult = {
    stdout: string;
    stderr: string;
    code: number | null;
    error?: Error;
};

export async function runProcessCapture(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs?: number,
): Promise<ProcessCaptureResult> {
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const child = spawn(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });

        const finish = (result: ProcessCaptureResult): void => {
            if (settled) { return; }
            settled = true;
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            resolve(result);
        };

        if (typeof timeoutMs === "number" && timeoutMs > 0) {
            timeout = setTimeout(() => {
                child.kill("SIGTERM");
                finish({ stdout, stderr, code: null, error: new Error(`${command} timed out`) });
            }, timeoutMs);
        }

        child.stdout?.on("data", (chunk: Buffer | string) => {
            stdout += String(chunk);
        });

        child.stderr?.on("data", (chunk: Buffer | string) => {
            stderr += String(chunk);
        });

        child.on("error", (error) => {
            finish({ stdout, stderr, code: null, error });
        });

        child.on("close", (code) => {
            finish({ stdout, stderr, code });
        });
    });
}

export type SpawnStreamResult = {
    ok: true;
    child: ChildProcess;
} | {
    ok: false;
    error: string;
};

export function spawnStream(
    command: string,
    args: string[],
    cwd: string,
): SpawnStreamResult {
    try {
        const child = spawn(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });
        return { ok: true, child };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : `Failed to spawn ${command}`,
        };
    }
}

// ---------------------------------------------------------------------------
// Common types for all harnesses
// ---------------------------------------------------------------------------

export type ModelCatalogItem = {
    model: string;
    variants: string[];
};

export type RunRequest = {
    rootDir?: string;
    runId?: string;
    model: AgentModel;
    variant?: string;
    contextMode?: ViewMode;
    filePath: string;
    selectionStartFileLine: number;
    selectionEndFileLine: number;
    prompt: string;
    selectedText: string;
    onMessage?: (message: string) => void;
    onExit?: (result: { success: boolean; error?: string }) => void;
};

export type RunHandle =
    | { ok: true; runId: string; stop: () => void }
    | { ok: false; error: string };

export type Submission = {
    updateId?: string;
    viewMode?: ViewMode;
    filePath: string;
    selectionStartFileLine: number;
    selectionEndFileLine: number;
    selectedText: string;
    prompt: string;
    model: AgentModel;
    thinkingLevel?: string;
};

export type HarnessOptions = {
    rootDir?: string;
    initialUpdates: AgentUpdate[];
    onUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

export type ParsedLineEvent = {
    messages: string[];
    isError: boolean;
};

// ---------------------------------------------------------------------------
// Base harness class that all integrations extend
// ---------------------------------------------------------------------------

export abstract class BaseHarness {
    protected readonly onUpdatesChanged?: (updates: AgentUpdate[]) => void;
    protected readonly rootDir: string;

    protected updates: AgentUpdate[];
    protected runningStops = new Map<string, () => void>();
    protected renderTimer: ReturnType<typeof setTimeout> | null = null;

    /** CLI command name (e.g. "opencode", "pi", "codex", "claude"). */
    abstract readonly command: string;

    /** Harness identifier stored on every AgentUpdate. */
    abstract readonly harnessId: string;

    constructor(options: HarnessOptions) {
        this.onUpdatesChanged = options.onUpdatesChanged;
        this.rootDir = options.rootDir ?? process.cwd();
        this.updates = options.initialUpdates.map((update) => ({
            ...update,
            messages: [...(update.messages ?? [])],
        }));
    }

    // ------------------------------------------------------------------
    // Abstract / overridable
    // ------------------------------------------------------------------

    /** Parse a line of stdout/stderr into messages. */
    protected abstract parseLine(line: string): ParsedLineEvent | null;

    /** List available models by parsing CLI output. */
    abstract listModels(): Promise<ModelCatalogItem[]>;

    /** Build CLI arguments for a model listing command. */
    protected abstract listModelsArgs(): string[];

    /** Build CLI arguments for a run command. */
    protected abstract buildRunArgs(request: RunRequest): string[];

    /** Build the message content sent as the prompt. */
    protected buildRunMessage(request: RunRequest): string {
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

    // ------------------------------------------------------------------
    // Static method for standalone runs
    // ------------------------------------------------------------------

    static async run(harness: BaseHarness, request: RunRequest): Promise<RunHandle> {
        const rootDir = request.rootDir ?? process.cwd();
        const runId = request.runId ?? harness.createRunId(request.filePath);
        const onMessage = request.onMessage ?? (() => {});
        const onExit = request.onExit ?? (() => {});

        let finished = false;
        const finalize = (result: { success: boolean; error?: string }): void => {
            if (finished) { return; }
            finished = true;
            onExit(result);
        };

        const args = harness.buildRunArgs(request);
        const spawnResult = spawnStream(harness.command, args, rootDir);

        if (!spawnResult.ok) {
            return { ok: false, error: spawnResult.error };
        }

        const child = spawnResult.child;
        let handledExit = false;
        let lastErrorMessage: string | undefined;

        const emitExit = (result: { success: boolean; error?: string }) => {
            if (handledExit) { return; }
            handledExit = true;
            onExit(result);
        };

        const consumeLine = (rawLine: string, fromStderr: boolean) => {
            const line = fromStderr ? harness.normalizeStderrLine(rawLine) : sanitizeLine(rawLine);
            if (!line) { return; }

            const parsed = harness.parseLine(line);
            if (!parsed || parsed.messages.length === 0) { return; }

            for (const messageText of parsed.messages) {
                onMessage(messageText);
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
            emitExit({
                success: false,
                error: `Failed to run ${harness.command}: ${error.message}`,
            });
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
            emitExit({
                success: false,
                error: `${harness.command} exited with status ${String(code ?? 1)}`,
            });
        });

        return {
            ok: true,
            runId,
            stop: () => {
                if (child.killed) { return; }
                child.kill("SIGTERM");
            },
        };
    }

    // ------------------------------------------------------------------
    // Instance methods
    // ------------------------------------------------------------------

    public shutdown(): void {
        for (const stop of this.runningStops.values()) {
            stop();
        }
        this.runningStops.clear();
        if (!this.renderTimer) { return; }
        clearTimeout(this.renderTimer);
        this.renderTimer = null;
    }

    public getUpdates(): AgentUpdate[] {
        return this.updates.map((update) => ({ ...update, messages: [...update.messages] }));
    }

    public getMutableUpdates(): AgentUpdate[] {
        return this.updates;
    }

    public upsertFromSubmission(submission: Submission): AgentUpdate {
        let update = submission.updateId
            ? this.updates.find((entry) => entry.id === submission.updateId)
            : undefined;

        if (!update) {
            update = {
                id: `agent-${randomUUID().slice(0, 8)}`,
                contextMode: submission.viewMode,
                filePath: submission.filePath,
                selectionStartFileLine: submission.selectionStartFileLine,
                selectionEndFileLine: submission.selectionEndFileLine,
                selectedText: submission.selectedText,
                prompt: submission.prompt,
                harness: this.harnessId as AgentUpdate["harness"],
                model: submission.model,
                variant: submission.thinkingLevel,
                status: "draft",
                messages: [],
            };
            this.updates.push(update);
        } else {
            update.contextMode = submission.viewMode;
            update.filePath = submission.filePath;
            update.selectionStartFileLine = submission.selectionStartFileLine;
            update.selectionEndFileLine = submission.selectionEndFileLine;
            update.selectedText = submission.selectedText;
            update.prompt = submission.prompt;
            update.harness = this.harnessId as AgentUpdate["harness"];
            update.model = submission.model;
            update.variant = submission.thinkingLevel;
        }

        this.notifyUpdatesChanged();
        return update;
    }

    public findById(id: string): AgentUpdate | undefined {
        return this.updates.find((update) => update.id === id);
    }

    public findByRenderedLine(
        cursorLine: number,
        updateIdByAgentLine: ReadonlyMap<number, string>,
    ): AgentUpdate | undefined {
        const updateId = updateIdByAgentLine.get(cursorLine);
        if (!updateId) { return undefined; }
        return this.findById(updateId);
    }

    public remove(updateId: string): boolean {
        const stop = this.runningStops.get(updateId);
        if (stop) {
            stop();
            this.runningStops.delete(updateId);
        }

        const previousLength = this.updates.length;
        this.updates = this.updates.filter((entry) => entry.id !== updateId);
        if (this.updates.length === previousLength) { return false; }

        this.notifyUpdatesChanged();
        return true;
    }

    public pruneForEntries(relativePaths: ReadonlySet<string>): void {
        const removedIds = new Set<string>();
        for (const update of this.updates) {
            if (relativePaths.has(update.filePath)) { continue; }
            removedIds.add(update.id);
        }

        for (const updateId of removedIds) {
            const stop = this.runningStops.get(updateId);
            if (!stop) { continue; }
            stop();
            this.runningStops.delete(updateId);
        }

        const previousLength = this.updates.length;
        this.updates = this.updates.filter((update) => relativePaths.has(update.filePath));
        if (this.updates.length === previousLength) { return; }

        this.notifyUpdatesChanged();
    }

    public async launch(update: AgentUpdate): Promise<void> {
        const existingStop = this.runningStops.get(update.id);
        if (existingStop) {
            existingStop();
            this.runningStops.delete(update.id);
        }

        update.status = "running";
        update.error = undefined;
        update.runId = undefined;
        update.messages = [];
        this.notifyUpdatesChanged();

        const request: RunRequest = {
            rootDir: this.rootDir,
            runId: this.createRunId(update.filePath),
            model: update.model,
            variant: update.variant,
            contextMode: update.contextMode,
            filePath: update.filePath,
            selectionStartFileLine: update.selectionStartFileLine,
            selectionEndFileLine: update.selectionEndFileLine,
            prompt: update.prompt,
            selectedText: update.selectedText,
            onMessage: (message) => {
                this.pushMessage(update, message);
                this.scheduleRender();
            },
            onExit: ({ success, error }) => {
                this.runningStops.delete(update.id);
                update.status = success ? "completed" : "failed";
                update.error = success ? undefined : (error ?? `${this.command} run failed.`);
                if (update.error) {
                    this.pushMessage(update, update.error);
                }
                this.notifyUpdatesChanged();
            },
        };

        let result: RunHandle;
        try {
            result = await BaseHarness.run(this, request);
        } catch (error) {
            result = { ok: false, error: error instanceof Error ? error.message : "Failed to start run." };
        }

        if (!result.ok) {
            update.status = "failed";
            update.error = result.error;
            this.pushMessage(update, result.error);
            this.notifyUpdatesChanged();
            return;
        }

        update.runId = result.runId;
        this.runningStops.set(update.id, result.stop);
        this.notifyUpdatesChanged();
    }

    // ------------------------------------------------------------------
    // Protected helpers
    // ------------------------------------------------------------------

    protected pushMessage(update: AgentUpdate, message: string): void {
        const trimmed = message.replace(/\s+/g, " ").trim();
        if (trimmed.length === 0) { return; }
        const previous = update.messages[update.messages.length - 1];
        if (previous === trimmed) { return; }
        update.messages.push(trimmed);
        if (update.messages.length > 64) {
            update.messages.splice(0, update.messages.length - 64);
        }
    }

    protected scheduleRender(): void {
        if (this.renderTimer) { return; }
        this.renderTimer = setTimeout(() => {
            this.renderTimer = null;
            this.notifyUpdatesChanged();
        }, 60);
    }

    protected notifyUpdatesChanged(): void {
        this.onUpdatesChanged?.(this.getUpdates());
    }

    protected normalizeStderrLine(rawLine: string): string | null {
        const cleaned = sanitizeLine(rawLine);
        if (!cleaned) { return null; }
        if (/^(INFO|DEBUG|TRACE)\b/.test(cleaned)) { return null; }
        if (/^\s*at\s+/.test(cleaned)) { return null; }
        if (cleaned === "fatal") { return null; }

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

    protected createRunId(filePath: string): string {
        const safeStem = (filePath.split(/[\\/]/).pop() ?? "task")
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 24);
        return `run-${safeStem || "task"}-${Date.now().toString(36)}`;
    }
}
