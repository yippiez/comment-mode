/**
 * File-entry loading utilities for the TUI.
 * Discovers and normalizes workspace `CodeFileEntry` records for rendering.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getIgnoredDirs, loadCodeFileEntries as loadWorkspaceCodeFileEntries } from "../workspace";
import type { CodeFileEntry } from "../types";
import { countLogicalLines } from "./text";
import { isMissingCodeFileError } from "./validation";

export { isMissingCodeFileError };

/**
 * Loads workspace code-file entries for the current repository.
 *
 * This discovers code files via `listGitWorkspaceFiles` / filesystem walk,
 * eagerly loads content for smaller workspaces, and hydrates bookkeeping
 * (uncommitted line sets) for each entry.
 *
 * @param rootDir - Root directory used for discovery and for reading files.
 * @returns Array of normalized `CodeFileEntry` records.
 *
 * @example
 * const entries = await loadCodeFileEntries(process.cwd());
 */
export async function loadCodeFileEntries(rootDir = process.cwd()): Promise<CodeFileEntry[]> {
    const ignoredDirs = await getIgnoredDirs(rootDir);
    const entries = await loadWorkspaceCodeFileEntries(rootDir, ignoredDirs);

    return entries.map((entry) => ({
        ...entry,
        uncommittedLines: new Set(entry.uncommittedLines),
    }));
}

/**
 * Hydrates an existing `CodeFileEntry` by loading its file content from disk.
 *
 * If `entry.isContentLoaded` is already `true`, this function is a no-op.
 *
 * @param entry - Code file entry to hydrate.
 * @param rootDir - Root directory used for resolving the entry's `relativePath`.
 * @returns Promise that resolves after content/line counts are populated.
 */
export async function hydrateCodeFileEntry(
    entry: CodeFileEntry,
    rootDir = process.cwd(),
): Promise<void> {
    if (entry.isContentLoaded) return;

    const absolutePath = path.join(rootDir, entry.relativePath);
    const content = await readFile(absolutePath, "utf8");

    entry.content = content;
    entry.lineCount = countLogicalLines(content);
    entry.isContentLoaded = true;
}

export type FileType =
    | "css"
    | "go"
    | "html"
    | "java"
    | "javascript"
    | "json"
    | "markdown"
    | "python"
    | "ruby"
    | "rust"
    | "shell"
    | "svelte"
    | "tcss"
    | "toml"
    | "typescript"
    | "yaml";

export enum FileTypePriority {
    HIGH = 0,
    MEDIUM = 1,
    LOW = 2,
    LOWEST = 3,
}

const ALL_EXTENSIONS = new Set([
    "c",
    "cpp",
    "cs",
    "go",
    "h",
    "hpp",
    "java",
    "js",
    "jsx",
    "kt",
    "php",
    "py",
    "rb",
    "rs",
    "scala",
    "svelte",
    "swift",
    "ts",
    "tsx",
    "vue",
    "config",
    "conf",
    "env",
    "ini",
    "json",
    "properties",
    "toml",
    "tcss",
    "xml",
    "yaml",
    "yml",
    "log",
    "md",
    "rst",
    "txt",
    ".c",
    ".cpp",
    ".cs",
    ".css",
    ".tcss",
    ".go",
    ".h",
    ".hpp",
    ".html",
    ".java",
    ".jsx",
    ".php",
    ".rb",
    ".scala",
    ".sh",
    ".swift",
    ".vue",
    ".xml",
]);

const FILE_TYPE_BY_EXTENSION: Record<string, FileType> = {
    ".css": "css",
    ".tcss": "tcss",
    ".go": "go",
    ".html": "html",
    ".java": "java",
    ".js": "javascript",
    ".jsx": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".sh": "shell",
    ".svelte": "svelte",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".yaml": "yaml",
    ".yml": "yaml",
};

const FILE_TYPE_EXTENSIONS = new Set<string>(Object.keys(FILE_TYPE_BY_EXTENSION));

const PRIORITY_EXTENSIONS: Record<string, FileTypePriority> = {
    c: FileTypePriority.HIGH,
    cpp: FileTypePriority.HIGH,
    cs: FileTypePriority.HIGH,
    go: FileTypePriority.HIGH,
    h: FileTypePriority.HIGH,
    hpp: FileTypePriority.HIGH,
    java: FileTypePriority.HIGH,
    js: FileTypePriority.HIGH,
    jsx: FileTypePriority.HIGH,
    kt: FileTypePriority.HIGH,
    php: FileTypePriority.HIGH,
    py: FileTypePriority.HIGH,
    rb: FileTypePriority.HIGH,
    rs: FileTypePriority.HIGH,
    scala: FileTypePriority.HIGH,
    svelte: FileTypePriority.HIGH,
    swift: FileTypePriority.HIGH,
    ts: FileTypePriority.HIGH,
    tsx: FileTypePriority.HIGH,
    vue: FileTypePriority.HIGH,
    config: FileTypePriority.MEDIUM,
    conf: FileTypePriority.MEDIUM,
    env: FileTypePriority.MEDIUM,
    ini: FileTypePriority.MEDIUM,
    json: FileTypePriority.MEDIUM,
    properties: FileTypePriority.MEDIUM,
    toml: FileTypePriority.MEDIUM,
    tcss: FileTypePriority.MEDIUM,
    xml: FileTypePriority.MEDIUM,
    yaml: FileTypePriority.MEDIUM,
    yml: FileTypePriority.MEDIUM,
    log: FileTypePriority.LOWEST,
    md: FileTypePriority.LOWEST,
    rst: FileTypePriority.LOWEST,
    txt: FileTypePriority.LOWEST,
};

/**
 * Resolves a canonical `FileType` from a normalized file extension.
 *
 * @param ext - File extension including its dot (for example `.ts`).
 * @returns Resolved `FileType`, or `undefined` when unknown/unmapped.
 */
function resolveFileTypeByExtension(ext: string): FileType | undefined {
    return FILE_TYPE_BY_EXTENSION[ext];
}

/**
 * Checks whether an extension exists in the configured file-type mapping.
 *
 * @param ext - File extension including its dot (for example `.ts`).
 * @returns True if the extension is recognized, false otherwise.
 */
function isFileTypeExtension(ext: string): boolean {
    return FILE_TYPE_EXTENSIONS.has(ext);
}

/**
 * Resolve a canonical file type name from a file path extension.
 *
 * @param relativePath - Relative file path whose extension should be inspected.
 * @returns Resolved `FileType`, or `undefined` if the extension is not a code type.
 *
 * @example
 * resolveFileType("src/app.ts") // "typescript"
 */
export function resolveFileType(relativePath: string): FileType | undefined {
    const ext = path.extname(relativePath).toLowerCase();
    if (!isFileTypeExtension(ext)) return undefined;
    return resolveFileTypeByExtension(ext);
}

/**
 * Resolve an uppercase type label from a file path extension.
 *
 * @param relativePath - Relative file path whose extension should be inspected.
 * @returns Uppercase type label for the file extension (for example `TS`),
 *   or `NOEXT` when there is no extension.
 *
 * @example
 * resolveTypeLabel("src/app.ts") // "TS"
 * resolveTypeLabel("README")     // "NOEXT"
 */
export function resolveTypeLabel(relativePath: string): string {
    const ext = path.extname(relativePath);
    if (!ext) return "NOEXT";
    return ext.slice(1).toUpperCase();
}

/**
 * Resolve sorting priority for a type label.
 *
 * @param typeLabel - Uppercase or mixed-case type label (for example `TS` or `ts`).
 * @returns Sorting priority for the label, defaulting to `FileTypePriority.LOW`.
 *
 * @example
 * resolveTypePriority("TS") // FileTypePriority.HIGH
 */
export function resolveTypePriority(typeLabel: string): FileTypePriority {
    const lower = typeLabel.toLowerCase();
    const priority = PRIORITY_EXTENSIONS[lower];
    if (priority !== undefined) return priority;
    return FileTypePriority.LOW;
}

/**
 * Check whether an extension is included in code file discovery.
 *
 * @param ext - File extension (with or without a leading dot).
 * @returns True when extension is considered a supported code file type.
 *
 * @example
 * isCodeExtension(".ts") // true
 * isCodeExtension("ts")  // true
 */
export function isCodeExtension(ext: string): boolean {
    const normalized = ext.startsWith(".") ? ext.slice(1) : ext;
    return ALL_EXTENSIONS.has(ext) || ALL_EXTENSIONS.has(normalized);
}

