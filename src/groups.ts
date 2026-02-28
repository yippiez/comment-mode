import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { parsePersistedUiState, type PersistedUiState } from "./persistence";

export const PERSISTED_GROUPS_VERSION = 1;

export type PersistedUiGroup = {
  id: string;
  name: string;
  snapshot: PersistedUiState;
  createdAt: string;
  updatedAt: string;
};

type PersistedUiGroupsFile = {
  version: typeof PERSISTED_GROUPS_VERSION;
  groups: PersistedUiGroup[];
};

const PERSISTENCE_DIRNAME = ".comment";
const PERSISTENCE_FILENAME = "groups.json";

export async function loadPersistedGroups(rootDir: string): Promise<PersistedUiGroup[]> {
  const filePath = getPersistedGroupsFilePath(rootDir);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const normalized = parsePersistedGroupsFile(parsed);
    return normalized?.groups ?? [];
  } catch {
    return [];
  }
}

export async function savePersistedGroups(rootDir: string, groups: readonly PersistedUiGroup[]): Promise<void> {
  const filePath = getPersistedGroupsFilePath(rootDir);
  const directoryPath = path.dirname(filePath);
  const serialized = serializePersistedGroups(groups);
  await mkdir(directoryPath, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, serialized, "utf8");
  await rename(tempPath, filePath);
}

function getPersistedGroupsFilePath(rootDir: string): string {
  return path.join(rootDir, PERSISTENCE_DIRNAME, PERSISTENCE_FILENAME);
}

function serializePersistedGroups(groups: readonly PersistedUiGroup[]): string {
  const normalized = normalizePersistedGroups(groups);
  return `${JSON.stringify(
    {
      version: PERSISTED_GROUPS_VERSION,
      groups: normalized,
    },
    null,
    2,
  )}\n`;
}

function normalizePersistedGroups(groups: readonly PersistedUiGroup[]): PersistedUiGroup[] {
  const normalized = parsePersistedGroupsFile({
    version: PERSISTED_GROUPS_VERSION,
    groups,
  });
  return normalized?.groups ?? [];
}

function parsePersistedGroupsFile(value: unknown): PersistedUiGroupsFile | null {
  if (!isRecord(value)) return null;
  if (value.version !== PERSISTED_GROUPS_VERSION) return null;

  const sourceGroups = Array.isArray(value.groups) ? value.groups : [];
  const groups: PersistedUiGroup[] = [];
  const seenIds = new Set<string>();

  for (let index = 0; index < sourceGroups.length; index += 1) {
    const parsedGroup = parsePersistedGroup(sourceGroups[index], index, seenIds);
    if (!parsedGroup) continue;
    groups.push(parsedGroup);
  }

  return {
    version: PERSISTED_GROUPS_VERSION,
    groups,
  };
}

function parsePersistedGroup(
  value: unknown,
  index: number,
  seenIds: Set<string>,
): PersistedUiGroup | null {
  if (!isRecord(value)) return null;

  let id = typeof value.id === "string" ? value.id.trim() : "";
  if (id.length === 0 || seenIds.has(id)) {
    id = crypto.randomUUID();
  }
  seenIds.add(id);

  const rawName = typeof value.name === "string" ? value.name.trim() : "";
  const name = rawName.length > 0 ? rawName : `group-${index + 1}`;

  const snapshot = parsePersistedUiState(value.snapshot);
  if (!snapshot) return null;

  const nowIso = new Date().toISOString();
  const createdAt = normalizeIsoTimestamp(value.createdAt, nowIso);
  const updatedAt = normalizeIsoTimestamp(value.updatedAt, createdAt);

  return {
    id,
    name,
    snapshot,
    createdAt,
    updatedAt,
  };
}

function normalizeIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;
  return new Date(timestamp).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
