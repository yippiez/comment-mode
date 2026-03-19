import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { toNonEmptyTrimmedString } from "./utils/text";

export const PERSISTED_UI_STATE_VERSION = 1;
const DEFAULT_PERSISTED_THINKING_LEVEL = "auto";

export type PersistedCursorState = {
  globalLine: number;
  filePath: string | null;
  fileLine: number | null;
  lineText: string | null;
};

export type PersistedPromptState = {
  model: string;
  thinkingLevel: string;
};

export type PersistedUiState = {
  version: typeof PERSISTED_UI_STATE_VERSION;
  chips: {
    selectedChipIndex: number;
    chipWindowStartIndex: number;
    enabledTypeLabels: Record<string, boolean>;
  };
  files: {
    collapsedPaths: string[];
    fileBlockCollapsed: boolean;
    directoryPath: string;
  };
  cursor: PersistedCursorState;
  prompt: PersistedPromptState;
};

type PersistedUiStateWire = PersistedUiState;
type PersistedChipsWire = PersistedUiState["chips"];
type PersistedFilesWire = PersistedUiState["files"];
type PersistedCursorWire = PersistedUiState["cursor"];
type PersistedPromptWire = PersistedUiState["prompt"];

const PERSISTENCE_DIRNAME = ".comment";
const PERSISTENCE_FILENAME = "state.json";

export async function loadPersistedUiState(rootDir: string): Promise<PersistedUiState | null> {
    const filePath = getPersistedUiStateFilePath(rootDir);
    try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        return parsePersistedUiState(parsed);
    } catch {
        return null;
    }
}

export class PersistedUiStateWriter {
    private readonly filePath: string;
    private readonly directoryPath: string;
    private lastSavedSerialized: string | null = null;
    private pendingSerialized: string | null = null;
    private flushTimer: ReturnType<typeof setTimeout> | undefined;
    private isWriting = false;

    constructor(rootDir: string) {
        this.filePath = getPersistedUiStateFilePath(rootDir);
        this.directoryPath = path.dirname(this.filePath);
    }

    public seed(state: PersistedUiState | null): void {
        if (!state) return;
        this.lastSavedSerialized = serializePersistedUiState(state);
    }

    public schedule(state: PersistedUiState): void {
        const serialized = serializePersistedUiState(state);
        if (serialized === this.lastSavedSerialized || serialized === this.pendingSerialized) {
            return;
        }

        this.pendingSerialized = serialized;
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
        }

        this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            void this.flushPending();
        }, 120);
    }

    public async flushNow(state?: PersistedUiState): Promise<void> {
        if (state) {
            this.pendingSerialized = serializePersistedUiState(state);
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
        await this.flushPending();
    }

    public flushNowSync(state?: PersistedUiState): void {
        if (state) {
            this.pendingSerialized = serializePersistedUiState(state);
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }

        const nextSerialized = this.pendingSerialized;
        if (!nextSerialized || nextSerialized === this.lastSavedSerialized) {
            return;
        }

        this.pendingSerialized = null;
        try {
            mkdirSync(this.directoryPath, { recursive: true });
            const tempPath = `${this.filePath}.${process.pid}.tmp`;
            writeFileSync(tempPath, nextSerialized, "utf8");
            renameSync(tempPath, this.filePath);
            this.lastSavedSerialized = nextSerialized;
        } catch (error) {
            this.pendingSerialized = nextSerialized;
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[persistence] failed to write UI state: ${message}`);
        }
    }

    public dispose(): void {
        if (!this.flushTimer) return;
        clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
    }

    private async flushPending(): Promise<void> {
        if (this.isWriting) return;

        const nextSerialized = this.pendingSerialized;
        if (!nextSerialized || nextSerialized === this.lastSavedSerialized) {
            return;
        }

        this.pendingSerialized = null;
        this.isWriting = true;

        try {
            await mkdir(this.directoryPath, { recursive: true });
            const tempPath = `${this.filePath}.${process.pid}.tmp`;
            await writeFile(tempPath, nextSerialized, "utf8");
            await rename(tempPath, this.filePath);
            this.lastSavedSerialized = nextSerialized;
        } catch (error) {
            this.pendingSerialized = nextSerialized;
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[persistence] failed to write UI state: ${message}`);
        } finally {
            this.isWriting = false;
            if (this.pendingSerialized && this.pendingSerialized !== this.lastSavedSerialized) {
                void this.flushPending();
            }
        }
    }
}

function getPersistedUiStateFilePath(rootDir: string): string {
    return path.join(rootDir, PERSISTENCE_DIRNAME, PERSISTENCE_FILENAME);
}

function serializePersistedUiState(state: PersistedUiState): string {
    return `${JSON.stringify(normalizePersistedUiState(state), null, 2)}\n`;
}

export function normalizePersistedUiState(state: PersistedUiState): PersistedUiState {
    const enabledTypeEntries = Object.entries(state.chips.enabledTypeLabels).sort(([a], [b]) =>
        a.localeCompare(b),
    );
    const enabledTypeLabels: Record<string, boolean> = {};
    for (const [label, enabled] of enabledTypeEntries) {
        enabledTypeLabels[label] = Boolean(enabled);
    }

    return {
        version: PERSISTED_UI_STATE_VERSION,
        chips: {
            selectedChipIndex: toNonNegativeInteger(state.chips.selectedChipIndex),
            chipWindowStartIndex: toNonNegativeInteger(state.chips.chipWindowStartIndex),
            enabledTypeLabels,
        },
        files: {
            collapsedPaths: normalizePathList(state.files.collapsedPaths),
            fileBlockCollapsed: Boolean(state.files.fileBlockCollapsed),
            directoryPath: typeof state.files.directoryPath === "string" ? state.files.directoryPath : "",
        },
        cursor: {
            globalLine: Math.max(1, toNonNegativeInteger(state.cursor.globalLine)),
            filePath: typeof state.cursor.filePath === "string" && state.cursor.filePath.length > 0
                ? state.cursor.filePath
                : null,
            fileLine: Number.isFinite(state.cursor.fileLine)
                ? Math.max(1, Math.floor(state.cursor.fileLine as number))
                : null,
            lineText: typeof state.cursor.lineText === "string" ? state.cursor.lineText : null,
        },
        prompt: {
            model: toNonEmptyTrimmedString(state.prompt.model) ?? "",
            thinkingLevel:
        toNonEmptyTrimmedString(state.prompt.thinkingLevel) ?? DEFAULT_PERSISTED_THINKING_LEVEL,
        },
    };
}

export function parsePersistedUiState(value: unknown): PersistedUiState | null {
    if (!isPersistedUiStateWire(value)) return null;

    const chipsValue = value.chips;
    const filesValue = value.files;
    const cursorValue = value.cursor;
    const promptValue = value.prompt;
    const collapsedPaths = toStringArray(filesValue.collapsedPaths);

    const enabledTypeLabels: Record<string, boolean> = {};
    for (const [typeLabel, enabled] of Object.entries(chipsValue.enabledTypeLabels)) {
        enabledTypeLabels[typeLabel] = Boolean(enabled);
    }

    return normalizePersistedUiState({
        version: PERSISTED_UI_STATE_VERSION,
        chips: {
            selectedChipIndex: toNonNegativeInteger(chipsValue.selectedChipIndex),
            chipWindowStartIndex: toNonNegativeInteger(chipsValue.chipWindowStartIndex),
            enabledTypeLabels,
        },
        files: {
            collapsedPaths,
            fileBlockCollapsed: Boolean(filesValue.fileBlockCollapsed),
            directoryPath: filesValue.directoryPath,
        },
        cursor: {
            globalLine: Math.max(1, toNonNegativeInteger(cursorValue.globalLine)),
            filePath: cursorValue.filePath,
            fileLine: Number.isFinite(cursorValue.fileLine)
                ? Math.max(1, Math.floor(cursorValue.fileLine as number))
                : null,
            lineText: cursorValue.lineText,
        },
        prompt: {
            model: promptValue.model,
            thinkingLevel: promptValue.thinkingLevel,
        },
    });
}

function normalizePathList(value: readonly string[]): string[] {
    return [...new Set(value.filter((entry) => typeof entry === "string" && entry.length > 0))].sort((a, b) =>
        a.localeCompare(b),
    );
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string");
}

function toNonNegativeInteger(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
}

function isPersistedUiStateWire(value: unknown): value is PersistedUiStateWire {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
        record.version === PERSISTED_UI_STATE_VERSION &&
    isPersistedChipsWire(record.chips) &&
    isPersistedFilesWire(record.files) &&
    isPersistedCursorWire(record.cursor) &&
    isPersistedPromptWire(record.prompt)
    );
}

function isPersistedChipsWire(value: unknown): value is PersistedChipsWire {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.selectedChipIndex === "number" &&
    typeof record.chipWindowStartIndex === "number" &&
    record.enabledTypeLabels !== null &&
    typeof record.enabledTypeLabels === "object" &&
    !Array.isArray(record.enabledTypeLabels)
    );
}

function isPersistedFilesWire(value: unknown): value is PersistedFilesWire {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
        Array.isArray(record.collapsedPaths) &&
    typeof record.fileBlockCollapsed === "boolean" &&
    typeof record.directoryPath === "string"
    );
}

function isPersistedCursorWire(value: unknown): value is PersistedCursorWire {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.globalLine === "number" &&
    (record.filePath === null || typeof record.filePath === "string") &&
    (record.fileLine === null || typeof record.fileLine === "number") &&
    (record.lineText === null || typeof record.lineText === "string")
    );
}

function isPersistedPromptWire(value: unknown): value is PersistedPromptWire {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return typeof record.model === "string" && typeof record.thinkingLevel === "string";
}
