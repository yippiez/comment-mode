import path from "node:path";

const PROGRAMMING_LANGS = new Set([
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
]);

const CONFIG_FILES = new Set([
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
]);

const TEXT_FILES = new Set(["md", "txt", "rst", "log"]);

const FILETYPE_BY_EXTENSION = new Map<string, string>([
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".json", "json"],
  [".md", "markdown"],
  [".css", "css"],
  [".html", "html"],
  [".py", "python"],
  [".rb", "ruby"],
  [".go", "go"],
  [".rs", "rust"],
  [".java", "java"],
  [".sh", "shell"],
  [".toml", "toml"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
]);

export const CODE_EXTENSIONS = new Set([
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

export function resolveFiletype(relativePath: string): string | undefined {
  const ext = path.extname(relativePath).toLowerCase();
  return FILETYPE_BY_EXTENSION.get(ext);
}

export function resolveTypeLabel(relativePath: string): string {
  const ext = path.extname(relativePath);
  if (!ext) return "NOEXT";
  return ext.slice(1).toUpperCase();
}

export function resolveTypePriority(typeLabel: string): number {
  const lower = typeLabel.toLowerCase();
  if (PROGRAMMING_LANGS.has(lower)) return 0;
  if (CONFIG_FILES.has(lower)) return 1;
  if (TEXT_FILES.has(lower)) return 3;
  return 2;
}
