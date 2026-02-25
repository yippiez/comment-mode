import path from "node:path";

export type ProgrammingExtension =
  | "c"
  | "cpp"
  | "cs"
  | "go"
  | "h"
  | "hpp"
  | "java"
  | "js"
  | "jsx"
  | "kt"
  | "php"
  | "py"
  | "rb"
  | "rs"
  | "scala"
  | "svelte"
  | "swift"
  | "ts"
  | "tsx"
  | "vue";

export type ConfigExtension =
  | "config"
  | "conf"
  | "env"
  | "ini"
  | "json"
  | "properties"
  | "toml"
  | "xml"
  | "yaml"
  | "yml";

export type TextExtension = "log" | "md" | "rst" | "txt";

export type CodeExtension =
  | ".c"
  | ".cpp"
  | ".cs"
  | ".css"
  | ".go"
  | ".h"
  | ".hpp"
  | ".html"
  | ".java"
  | ".js"
  | ".jsx"
  | ".json"
  | ".md"
  | ".php"
  | ".py"
  | ".rb"
  | ".rs"
  | ".scala"
  | ".sh"
  | ".svelte"
  | ".swift"
  | ".toml"
  | ".ts"
  | ".tsx"
  | ".vue"
  | ".xml"
  | ".yaml"
  | ".yml";

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
  | "toml"
  | "typescript"
  | "yaml";

type FileTypeExtension =
  | ".css"
  | ".go"
  | ".html"
  | ".java"
  | ".js"
  | ".jsx"
  | ".json"
  | ".md"
  | ".py"
  | ".rb"
  | ".rs"
  | ".sh"
  | ".toml"
  | ".ts"
  | ".tsx"
  | ".yaml"
  | ".yml";

const PROGRAMMING_EXTENSIONS = new Set<ProgrammingExtension>([
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
]);

const CONFIG_EXTENSIONS = new Set<ConfigExtension>([
  "config",
  "conf",
  "env",
  "ini",
  "json",
  "properties",
  "toml",
  "xml",
  "yaml",
  "yml",
]);

const TEXT_EXTENSIONS = new Set<TextExtension>(["log", "md", "rst", "txt"]);

const FILE_TYPE_BY_EXTENSION: Record<FileTypeExtension, FileType> = {
  ".css": "css",
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
  ".toml": "toml",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".yaml": "yaml",
  ".yml": "yaml",
};

const FILE_TYPE_EXTENSIONS = new Set<string>(Object.keys(FILE_TYPE_BY_EXTENSION));

const CODE_EXTENSIONS = new Set<CodeExtension>([
  ".c",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".svelte",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

function isProgrammingExtension(extension: string): extension is ProgrammingExtension {
  return PROGRAMMING_EXTENSIONS.has(extension as ProgrammingExtension);
}

function isConfigExtension(extension: string): extension is ConfigExtension {
  return CONFIG_EXTENSIONS.has(extension as ConfigExtension);
}

function isTextExtension(extension: string): extension is TextExtension {
  return TEXT_EXTENSIONS.has(extension as TextExtension);
}

function resolveFileTypeByExtension(ext: FileTypeExtension): FileType {
  return FILE_TYPE_BY_EXTENSION[ext];
}

function isFileTypeExtension(ext: string): ext is FileTypeExtension {
  return FILE_TYPE_EXTENSIONS.has(ext);
}

/**
 * Resolve a canonical file type name from a file path extension.
 */
export function resolveFileType(relativePath: string): FileType | undefined {
  const ext = path.extname(relativePath).toLowerCase();
  if (!isFileTypeExtension(ext)) return undefined;
  return resolveFileTypeByExtension(ext);
}

/**
 * Resolve an uppercase type label from a file path extension.
 */
export function resolveTypeLabel(relativePath: string): string {
  const ext = path.extname(relativePath);
  if (!ext) return "NOEXT";
  return ext.slice(1).toUpperCase();
}

export enum FileTypePriority {
  HIGH = 0,
  MEDIUM = 1,
  LOW = 2,
  LOWEST = 3,
}

/**
 * Resolve sorting priority for a type label.
 */
export function resolveTypePriority(typeLabel: string): FileTypePriority {
  const lower = typeLabel.toLowerCase();
  if (isProgrammingExtension(lower)) return FileTypePriority.HIGH;
  if (isConfigExtension(lower)) return FileTypePriority.MEDIUM;
  if (isTextExtension(lower)) return FileTypePriority.LOWEST;
  return FileTypePriority.LOW;
}

/**
 * Check whether an extension is included in code file discovery.
 */
export function isCodeExtension(ext: string): ext is CodeExtension {
  return CODE_EXTENSIONS.has(ext as CodeExtension);
}
