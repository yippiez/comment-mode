import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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
    ignoredPaths: string[];
    collapsedPaths: string[];
    fileBlockCollapsed: boolean;
    directoryPath: string;
  };
  cursor: PersistedCursorState;
  prompt: PersistedPromptState;
};

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
      ignoredPaths: normalizePathList(state.files.ignoredPaths),
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
      model: toTrimmedString(state.prompt.model),
      thinkingLevel: toTrimmedString(
        state.prompt.thinkingLevel,
        DEFAULT_PERSISTED_THINKING_LEVEL,
      ),
    },
  };
}

export function parsePersistedUiState(value: unknown): PersistedUiState | null {
  if (!isRecord(value)) return null;
  if (value.version !== PERSISTED_UI_STATE_VERSION) return null;

  const chipsValue = isRecord(value.chips) ? value.chips : {};
  const filesValue = isRecord(value.files) ? value.files : {};
  const cursorValue = isRecord(value.cursor) ? value.cursor : {};
  const promptValue = isRecord(value.prompt) ? value.prompt : {};

  const enabledTypeLabels: Record<string, boolean> = {};
  const enabledSource = isRecord(chipsValue.enabledTypeLabels) ? chipsValue.enabledTypeLabels : {};
  for (const [typeLabel, enabled] of Object.entries(enabledSource)) {
    if (typeof typeLabel !== "string" || typeLabel.length === 0) continue;
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
      ignoredPaths: toStringArray(filesValue.ignoredPaths),
      collapsedPaths: toStringArray(filesValue.collapsedPaths),
      fileBlockCollapsed: Boolean(filesValue.fileBlockCollapsed),
      directoryPath: typeof filesValue.directoryPath === "string" ? filesValue.directoryPath : "",
    },
    cursor: {
      globalLine: Math.max(1, toNonNegativeInteger(cursorValue.globalLine)),
      filePath: typeof cursorValue.filePath === "string" && cursorValue.filePath.length > 0
        ? cursorValue.filePath
        : null,
      fileLine: Number.isFinite(cursorValue.fileLine)
        ? Math.max(1, Math.floor(cursorValue.fileLine as number))
        : null,
      lineText: typeof cursorValue.lineText === "string" ? cursorValue.lineText : null,
    },
    prompt: {
      model: toTrimmedString(promptValue.model),
      thinkingLevel: toTrimmedString(
        promptValue.thinkingLevel,
        DEFAULT_PERSISTED_THINKING_LEVEL,
      ),
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

function toTrimmedString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
