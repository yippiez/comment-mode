/**
 * Filetype definitions and extension-based inference used for code discovery
 * (type labels and priorities for display/chip ordering).
 */
import path from "node:path";

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

function resolveFileTypeByExtension(ext: string): FileType | undefined {
    return FILE_TYPE_BY_EXTENSION[ext];
}

function isFileTypeExtension(ext: string): boolean {
    return FILE_TYPE_EXTENSIONS.has(ext);
}

/**
 * Resolve a canonical file type name from a file path extension.
 */
export function resolveFileType(relativePath: string): FileType | undefined {
    const ext = path.extname(relativePath).toLowerCase();
    if (!isFileTypeExtension(ext)) { return undefined; }
    return resolveFileTypeByExtension(ext);
}

/**
 * Resolve an uppercase type label from a file path extension.
 */
export function resolveTypeLabel(relativePath: string): string {
    const ext = path.extname(relativePath);
    if (!ext) { return "NOEXT"; }
    return ext.slice(1).toUpperCase();
}

/**
 * Resolve sorting priority for a type label.
 */
export function resolveTypePriority(typeLabel: string): FileTypePriority {
    const lower = typeLabel.toLowerCase();
    const priority = PRIORITY_EXTENSIONS[lower];
    if (priority !== undefined) { return priority; }
    return FileTypePriority.LOW;
}

/**
 * Check whether an extension is included in code file discovery.
 */
export function isCodeExtension(ext: string): boolean {
    const normalized = ext.startsWith(".") ? ext.slice(1) : ext;
    return ALL_EXTENSIONS.has(ext) || ALL_EXTENSIONS.has(normalized);
}
