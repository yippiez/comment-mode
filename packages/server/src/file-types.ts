import path from "node:path";

const PROGRAMMING_EXTENSIONS: readonly string[] = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "cs",
  "rb",
  "php",
  "swift",
  "kt",
  "scala",
  "vue",
  "svelte",
];

const CONFIG_EXTENSIONS: readonly string[] = [
    "json",
    "yaml",
    "yml",
    "toml",
    "xml",
    "ini",
    "conf",
    "config",
    "env",
    "properties",
];

const TEXT_EXTENSIONS: readonly string[] = [
    "md",
    "txt",
    "rst",
    "log",
];

const CODE_EXTENSIONS: readonly string[] = [
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
];

const PROGRAMMING_EXTENSIONS_SET: ReadonlySet<string> = new Set(PROGRAMMING_EXTENSIONS);
const CONFIG_EXTENSIONS_SET: ReadonlySet<string> = new Set(CONFIG_EXTENSIONS);
const TEXT_EXTENSIONS_SET: ReadonlySet<string> = new Set(TEXT_EXTENSIONS);
const CODE_EXTENSIONS_SET: ReadonlySet<string> = new Set(CODE_EXTENSIONS);

const FILE_TYPE_BY_EXTENSION = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".css": "css",
  ".html": "html",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".sh": "shell",
  ".toml": "toml",
  ".yaml": "yaml",
  ".yml": "yaml",
} as const;

/**
 * Resolve a canonical file type name from a file path extension.
 */
export function resolveFileType(relativePath: string): string | undefined {
  const ext = path.extname(relativePath).toLowerCase();
  return FILE_TYPE_BY_EXTENSION[ext as keyof typeof FILE_TYPE_BY_EXTENSION];
}

/**
 * Resolve an uppercase type label from a file path extension.
 */
export function resolveTypeLabel(relativePath: string): string {
  const ext = path.extname(relativePath);
  if (!ext) return "NOEXT";
  return ext.slice(1).toUpperCase();
}

/**
 * Resolve sorting priority for a type label.
 */
export function resolveTypePriority(typeLabel: string): number {
  const lower = typeLabel.toLowerCase();
  switch (true) {
    case PROGRAMMING_EXTENSIONS_SET.has(lower):
      return 0;
    case CONFIG_EXTENSIONS_SET.has(lower):
      return 1;
    case TEXT_EXTENSIONS_SET.has(lower):
      return 3;
    default:
      return 2;
  }
}

/**
 * Check whether an extension is included in code file discovery.
 */
export function isCodeExtension(ext: string): boolean {
  return CODE_EXTENSIONS_SET.has(ext.toLowerCase());
}
