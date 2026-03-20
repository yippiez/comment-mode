/**
 * OpenCode integration: launches OpenCode/headless runs, parses streaming
 * JSON line events, and updates the agent timeline via `SIGNALS`.
 */
import { spawn } from "node:child_process";
import { SIGNALS } from "../signals";
import type { AgentModel, AgentUpdate, ViewMode } from "../types";

type JsonRecord = Record<string, unknown>;

export type OpenCodeModelCatalogItem = {
  model: string;
  variants: string[];
};

export type OpenCodeSubmission = {
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

export type OpenCodeRunRequest = {
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

export type OpenCodeRunHandle =
  | {
      ok: true;
      runId: string;
      stop: () => void;
    }
  | {
      ok: false;
      error: string;
    };

export type OpenCodeOptions = {
  rootDir?: string;
  initialUpdates: AgentUpdate[];
  onUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

type OpenCodeInternalRunRequest = {
  rootDir: string;
  runId: string;
  model: AgentModel;
  variant?: string;
  contextMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  prompt: string;
  selectedText: string;
  onMessage: (message: string) => void;
  onExit: (result: { success: boolean; error?: string }) => void;
};

type ParsedLineEvent = {
  messages: string[];
  isError: boolean;
};

const JSON_PARSE_FAILED = Symbol("json-parse-failed");

export class OpenCode {
    private readonly onUpdatesChanged?: (updates: AgentUpdate[]) => void;
    private readonly rootDir: string;

    private updates: AgentUpdate[];
    private runningStops = new Map<string, () => void>();
    private renderTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(options: OpenCodeOptions) {
        this.onUpdatesChanged = options.onUpdatesChanged;
        this.rootDir = options.rootDir ?? process.cwd();
        this.updates = options.initialUpdates.map((update) => ({
            ...update,
            messages: [...(update.messages ?? [])],
        }));
    }

    public static async listModels(rootDir = process.cwd()): Promise<OpenCodeModelCatalogItem[]> {
        try {
            return await listOpencodeModelCatalogInternal(rootDir);
        } catch {
            return [];
        }
    }

    public static async run(request: OpenCodeRunRequest): Promise<OpenCodeRunHandle> {
        const rootDir = request.rootDir ?? process.cwd();
        const runId = request.runId ?? createRunId(request.filePath);
        const onMessage = request.onMessage ?? (() => {});
        const onExit = request.onExit ?? (() => {});

        let finished = false;
        const finalize = (result: { success: boolean; error?: string }): void => {
            if (finished) { return; }
            finished = true;
            onExit(result);
        };

        const startResult = await startHeadlessOpencodeRunInternal({
            runId,
            rootDir,
            onExit: finalize,
            onMessage,
            model: request.model,
            variant: request.variant,
            contextMode: request.contextMode,
            filePath: request.filePath,
            selectionStartFileLine: request.selectionStartFileLine,
            selectionEndFileLine: request.selectionEndFileLine,
            prompt: request.prompt,
            selectedText: request.selectedText,
        });

        if (!startResult.ok) {
            return {
                ok: false,
                error: startResult.error,
            };
        }

        return {
            ok: true,
            runId: startResult.runId,
            stop: () => {
                if (finished) { return; }
                startResult.stop();
                finalize({ success: false, error: "opencode run was cancelled." });
            },
        };
    }

    public shutdown(): void {
        for (const stop of this.runningStops.values()) {
            stop();
        }
        this.runningStops.clear();
        if (!this.renderTimer) { return; }
        clearTimeout(this.renderTimer);
        this.renderTimer = null;
    }

    // ------------------------------------------
    // Getters
    // ------------------------------------------

    public getUpdates(): AgentUpdate[] {
        return this.updates.map((update) => ({ ...update, messages: [...update.messages] }));
    }

    public getMutableUpdates(): AgentUpdate[] {
        return this.updates;
    }

    // ------------------------------------------
    // Updaters
    // ------------------------------------------

    public upsertFromSubmission(submission: OpenCodeSubmission): AgentUpdate {
        let update = submission.updateId
            ? this.updates.find((entry) => entry.id === submission.updateId)
            : undefined;

        if (!update) {
            update = {
                id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                contextMode: submission.viewMode,
                filePath: submission.filePath,
                selectionStartFileLine: submission.selectionStartFileLine,
                selectionEndFileLine: submission.selectionEndFileLine,
                selectedText: submission.selectedText,
                prompt: submission.prompt,
                harness: "opencode",
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
            update.harness = "opencode";
            update.model = submission.model;
            update.variant = submission.thinkingLevel;
        }

        this.notifyUpdatesChanged();
        return update;
    }

    // ------------------------------------------
    // Finders
    // ------------------------------------------

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

    // ------------------------------------------
    // Removers
    // ------------------------------------------

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
        SIGNALS.agentRenderRequested();
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
        SIGNALS.agentRenderRequested();

        let result: OpenCodeRunHandle;
        try {
            result = await OpenCode.run({
                rootDir: this.rootDir,
                runId: createRunId(update.filePath),
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
                    update.error = success ? undefined : error ?? "opencode run failed.";
                    if (update.error) {
                        this.pushMessage(update, update.error);
                    }
                    this.notifyUpdatesChanged();
                    SIGNALS.agentRenderRequested();
                },
            });
        } catch (error) {
            result = { ok: false, error: error instanceof Error ? error.message : "Failed to start run." };
        }

        if (!result.ok) {
            update.status = "failed";
            update.error = result.error;
            this.pushMessage(update, result.error);
            this.notifyUpdatesChanged();
            SIGNALS.agentRenderRequested();
            return;
        }

        update.runId = result.runId;
        this.runningStops.set(update.id, result.stop);
        this.notifyUpdatesChanged();
        SIGNALS.agentRenderRequested();
    }

    // ------------------------------------------
    // Private Helpers
    // ------------------------------------------

    private pushMessage(update: AgentUpdate, message: string): void {
        const trimmed = message.replace(/\s+/g, " ").trim();
        if (trimmed.length === 0) { return; }
        const previous = update.messages[update.messages.length - 1];
        if (previous === trimmed) { return; }
        update.messages.push(trimmed);
        if (update.messages.length > 64) {
            update.messages.splice(0, update.messages.length - 64);
        }
    }

    private scheduleRender(): void {
        if (this.renderTimer) { return; }
        this.renderTimer = setTimeout(() => {
            this.renderTimer = null;
            this.notifyUpdatesChanged();
            SIGNALS.agentRenderRequested();
        }, 60);
    }

    private notifyUpdatesChanged(): void {
        this.onUpdatesChanged?.(this.getUpdates());
    }
}

async function listOpencodeModelCatalogInternal(rootDir: string): Promise<OpenCodeModelCatalogItem[]> {
    const verboseResult = await runProcessCapture("opencode", ["models", "--verbose"], rootDir);
    if (!verboseResult.error) {
        const verboseCatalog = parseVerboseModelCatalog(`${verboseResult.stdout ?? ""}\n${verboseResult.stderr ?? ""}`);
        if (verboseCatalog.length > 0) {
            return verboseCatalog;
        }
    }

    const result = await runProcessCapture("opencode", ["models"], rootDir);
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

async function startHeadlessOpencodeRunInternal(
    request: OpenCodeInternalRunRequest,
): Promise<OpenCodeRunHandle> {
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
        if (handledExit) { return; }
        handledExit = true;
        request.onExit(result);
    };

    const consumeLine = (rawLine: string, fromStderr: boolean) => {
        const line = fromStderr ? normalizeStderrLine(rawLine) : sanitizeLine(rawLine);
        if (!line) { return; }

        const parsed = parseOpencodeLine(line);
        if (!parsed || parsed.messages.length === 0) { return; }

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
            if (child.killed) { return; }
            child.kill("SIGTERM");
        },
    };
}

function parseVerboseModelCatalog(output: string): OpenCodeModelCatalogItem[] {
    const lines = output.split(/\r?\n/);
    const catalog = new Map<string, OpenCodeModelCatalogItem>();

    for (let index = 0; index < lines.length; index += 1) {
        const model = sanitizeLine(lines[index] ?? "");
        if (!isModelIdentifier(model)) { continue; }

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
                if (char.trim().length === 0) { continue; }
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
    const variantsRecord = asJsonRecord(asJsonRecord(value)?.variants);
    if (!variantsRecord) { return []; }

    return Object.keys(variantsRecord)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .sort((a, b) => a.localeCompare(b));
}

function parseOpencodeLine(line: string): ParsedLineEvent | null {
    if (line.startsWith("event:")) { return null; }

    const payloadText = line.startsWith("data:") ? line.slice("data:".length).trim() : line;
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

function parseJsonPayload(payload: unknown): ParsedLineEvent | null {
    if (typeof payload === "string") {
        const text = sanitizeLine(payload);
        if (!text) { return null; }
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
            if (!parsedItem) { continue; }
            messages.push(...parsedItem.messages);
            isError = isError || parsedItem.isError;
        }
        if (messages.length === 0) { return null; }
        return {
            messages: dedupeMessages(messages),
            isError,
        };
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
        const state = asJsonRecord(part.state);
        const input = asJsonRecord(state?.input);
        const status = firstText(state?.status);
        const target = firstText(
            input?.filePath,
            input?.path,
            state?.path,
            asJsonRecord(part.target)?.path,
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
        if (text) { return text; }
    }
    return undefined;
}

function toText(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asJsonRecord(value: unknown): JsonRecord | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : undefined;
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
    if (!normalized.includes("/")) { return normalized; }
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length <= 3) { return normalized; }
    return parts.slice(-3).join("/");
}

function buildRunMessage(request: {
  contextMode?: ViewMode;
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
            if (settled) { return; }
            settled = true;
            resolve({ stdout, stderr, code: null, error });
        });

        child.on("close", (code) => {
            if (settled) { return; }
            settled = true;
            resolve({ stdout, stderr, code });
        });
    });
}

function isModelIdentifier(line: string): boolean {
    return /^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(line);
}

function createRunId(filePath: string): string {
    const safeStem = (filePath.split(/[\\/]/).pop() ?? "task")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24);
    return `run-${safeStem || "task"}-${Date.now().toString(36)}`;
}

function stripAnsi(text: string): string {
    return text
        .replace(/\u001B\[[0-9;]*[A-Za-z]/g, "")
        .replace(/\u001B\][^\u0007]*\u0007/g, "");
}
