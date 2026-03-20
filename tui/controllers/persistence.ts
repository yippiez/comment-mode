/**
 * Persistence controller: versioned read/write of UI state and groups
 * under the `.comment/` directory in the workspace.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const PERSISTED_STATE_VERSION = 1;

export type PersistedChipsState = {
    selectedChipIndex: number;
    chipWindowStartIndex: number;
    enabledTypeLabels: Record<string, boolean>;
};

export type PersistedFilesState = {
    collapsedPaths: string[];
    fileBlockCollapsed: boolean;
    directoryPath: string;
};

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
    chips: PersistedChipsState;
    files: PersistedFilesState;
    cursor: PersistedCursorState;
    prompt: PersistedPromptState;
};

export type PersistedUiGroup = {
    id: string;
    name: string;
    snapshot: PersistedUiState;
    createdAt: string;
    updatedAt: string;
};

export type PersistedState = {
    version: typeof PERSISTED_STATE_VERSION;
    ui: PersistedUiState | null;
    groups: PersistedUiGroup[];
};

const PERSISTENCE_DIRNAME = ".comment";
const PERSISTENCE_FILENAME = "persistence.json";

export class PersistenceController {
    private rootDir: string | null = null;
    private state: PersistedState = {
        version: PERSISTED_STATE_VERSION,
        ui: null,
        groups: [],
    };
    private writeQueue: Promise<void> = Promise.resolve();

    // ------------------------------------------
    // Actions
    // ------------------------------------------

    public async load(rootDir: string): Promise<void> {
        this.rootDir = rootDir;
        const loaded = await this.readState(rootDir);
        this.state = loaded ?? {
            version: PERSISTED_STATE_VERSION,
            ui: null,
            groups: [],
        };
    }

    public save(rootDir?: string): Promise<void> {
        const targetRootDir = rootDir ?? this.rootDir;
        if (!targetRootDir) { return Promise.resolve(); }

        this.rootDir = targetRootDir;
        const snapshot = structuredClone(this.state);
        this.writeQueue = this.writeQueue
            .catch(() => undefined)
            .then(() => this.writeState(targetRootDir, snapshot));
        return this.writeQueue;
    }

    public saveSync(rootDir?: string): void {
        const targetRootDir = rootDir ?? this.rootDir;
        if (!targetRootDir) { return; }

        this.rootDir = targetRootDir;
        const filePath = getPersistenceFilePath(targetRootDir);
        const directoryPath = path.dirname(filePath);
        const tempPath = `${filePath}.${process.pid}.tmp`;
        const serialized = `${JSON.stringify(this.state, null, 2)}\n`;

        mkdirSync(directoryPath, { recursive: true });
        writeFileSync(tempPath, serialized, "utf8");
        renameSync(tempPath, filePath);
    }

    // ------------------------------------------
    // Setters
    // ------------------------------------------

    public setUiState(state: PersistedUiState | null): void {
        this.state.ui = state ? structuredClone(state) : null;
    }

    public setGroups(groups: readonly PersistedUiGroup[]): void {
        this.state.groups = structuredClone([...groups]);
    }

    // ------------------------------------------
    // Getters
    // ------------------------------------------

    public getState(): PersistedState {
        return structuredClone(this.state);
    }

    public getUiState(): PersistedUiState | null {
        return this.state.ui ? structuredClone(this.state.ui) : null;
    }

    public getGroups(): readonly PersistedUiGroup[] {
        return structuredClone(this.state.groups);
    }

    public getChipsState(): PersistedChipsState | null {
        return this.state.ui ? structuredClone(this.state.ui.chips) : null;
    }

    public getFilesState(): PersistedFilesState | null {
        return this.state.ui ? structuredClone(this.state.ui.files) : null;
    }

    public getCursorState(): PersistedCursorState | null {
        return this.state.ui ? structuredClone(this.state.ui.cursor) : null;
    }

    public getPromptState(): PersistedPromptState | null {
        return this.state.ui ? structuredClone(this.state.ui.prompt) : null;
    }

    // ------------------------------------------
    // Private Helpers
    // ------------------------------------------

    private async readState(rootDir: string): Promise<PersistedState | null> {
        const filePath = getPersistenceFilePath(rootDir);
        try {
            const raw = await readFile(filePath, "utf8");
            const parsed = JSON.parse(raw) as unknown;
            return parsePersistedState(parsed);
        } catch {
            return null;
        }
    }

    private async writeState(rootDir: string, state: PersistedState): Promise<void> {
        const filePath = getPersistenceFilePath(rootDir);
        const directoryPath = path.dirname(filePath);
        const tempPath = `${filePath}.${process.pid}.tmp`;
        const serialized = `${JSON.stringify(state, null, 2)}\n`;
        await mkdir(directoryPath, { recursive: true });
        await writeFile(tempPath, serialized, "utf8");
        await rename(tempPath, filePath);
    }
}

function getPersistenceFilePath(rootDir: string): string {
    return path.join(rootDir, PERSISTENCE_DIRNAME, PERSISTENCE_FILENAME);
}

function parsePersistedState(value: unknown): PersistedState | null {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return null;
    }

    const record = value as {
        version?: unknown;
        ui?: unknown;
        groups?: unknown;
    };

    if (record.version !== PERSISTED_STATE_VERSION) {
        return null;
    }

    const ui = record.ui === null ? null : parsePersistedUiState(record.ui);
    if (record.ui !== null && ui === null) {
        return null;
    }

    const groups = parsePersistedGroups(record.groups);
    if (groups === null) {
        return null;
    }

    return {
        version: PERSISTED_STATE_VERSION,
        ui,
        groups,
    };
}

function parsePersistedUiState(value: unknown): PersistedUiState | null {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return null;
    }

    const record = value as {
        chips?: unknown;
        files?: unknown;
        cursor?: unknown;
        prompt?: unknown;
    };

    const chips = parsePersistedChipsState(record.chips);
    if (!chips) { return null; }
    const files = parsePersistedFilesState(record.files);
    if (!files) { return null; }
    const cursor = parsePersistedCursorState(record.cursor);
    if (!cursor) { return null; }
    const prompt = parsePersistedPromptState(record.prompt);
    if (!prompt) { return null; }

    return {
        chips,
        files,
        cursor,
        prompt,
    };
}

function parsePersistedChipsState(value: unknown): PersistedChipsState | null {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return null;
    }

    const record = value as {
        selectedChipIndex?: unknown;
        chipWindowStartIndex?: unknown;
        enabledTypeLabels?: unknown;
    };

    if (!isNonNegativeInteger(record.selectedChipIndex)) {
        return null;
    }
    if (!isNonNegativeInteger(record.chipWindowStartIndex)) {
        return null;
    }

    const enabledTypeLabels = parseEnabledTypeLabels(record.enabledTypeLabels);
    if (!enabledTypeLabels) {
        return null;
    }

    return {
        selectedChipIndex: record.selectedChipIndex,
        chipWindowStartIndex: record.chipWindowStartIndex,
        enabledTypeLabels,
    };
}

function parseEnabledTypeLabels(value: unknown): Record<string, boolean> | null {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return null;
    }

    const record = value as Record<string, unknown>;
    const labels: Record<string, boolean> = {};

    for (const [label, enabled] of Object.entries(record)) {
        if (typeof enabled !== "boolean") {
            return null;
        }
        labels[label] = enabled;
    }

    return labels;
}

function parsePersistedFilesState(value: unknown): PersistedFilesState | null {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return null;
    }

    const record = value as {
        collapsedPaths?: unknown;
        fileBlockCollapsed?: unknown;
        directoryPath?: unknown;
    };

    if (!Array.isArray(record.collapsedPaths)) {
        return null;
    }
    if (!record.collapsedPaths.every((entry) => typeof entry === "string")) {
        return null;
    }
    if (typeof record.fileBlockCollapsed !== "boolean") {
        return null;
    }
    if (typeof record.directoryPath !== "string") {
        return null;
    }

    return {
        collapsedPaths: [...record.collapsedPaths],
        fileBlockCollapsed: record.fileBlockCollapsed,
        directoryPath: record.directoryPath,
    };
}

function parsePersistedCursorState(value: unknown): PersistedCursorState | null {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return null;
    }

    const record = value as {
        globalLine?: unknown;
        filePath?: unknown;
        fileLine?: unknown;
        lineText?: unknown;
    };

    if (!isPositiveInteger(record.globalLine)) {
        return null;
    }

    if (record.filePath !== null && typeof record.filePath !== "string") {
        return null;
    }

    if (record.fileLine !== null && !isPositiveInteger(record.fileLine)) {
        return null;
    }

    if (record.lineText !== null && typeof record.lineText !== "string") {
        return null;
    }

    return {
        globalLine: record.globalLine,
        filePath: record.filePath,
        fileLine: record.fileLine,
        lineText: record.lineText,
    };
}

function parsePersistedPromptState(value: unknown): PersistedPromptState | null {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return null;
    }

    const record = value as {
        model?: unknown;
        thinkingLevel?: unknown;
    };

    if (typeof record.model !== "string") {
        return null;
    }
    if (typeof record.thinkingLevel !== "string") {
        return null;
    }

    return {
        model: record.model,
        thinkingLevel: record.thinkingLevel,
    };
}

function parsePersistedGroups(value: unknown): PersistedUiGroup[] | null {
    if (!Array.isArray(value)) {
        return null;
    }

    const groups: PersistedUiGroup[] = [];
    for (const groupValue of value) {
        const group = parsePersistedUiGroup(groupValue);
        if (!group) {
            return null;
        }
        groups.push(group);
    }

    return groups;
}

function parsePersistedUiGroup(value: unknown): PersistedUiGroup | null {
    if (Object.prototype.toString.call(value) !== "[object Object]") {
        return null;
    }

    const record = value as {
        id?: unknown;
        name?: unknown;
        snapshot?: unknown;
        createdAt?: unknown;
        updatedAt?: unknown;
    };

    if (typeof record.id !== "string" || record.id.length === 0) {
        return null;
    }
    if (typeof record.name !== "string" || record.name.length === 0) {
        return null;
    }
    if (typeof record.createdAt !== "string" || !isIsoTimestamp(record.createdAt)) {
        return null;
    }
    if (typeof record.updatedAt !== "string" || !isIsoTimestamp(record.updatedAt)) {
        return null;
    }

    const snapshot = parsePersistedUiState(record.snapshot);
    if (!snapshot) {
        return null;
    }

    return {
        id: record.id,
        name: record.name,
        snapshot,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isIsoTimestamp(value: string): boolean {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) {
        return false;
    }
    return new Date(parsed).toISOString() === value;
}
