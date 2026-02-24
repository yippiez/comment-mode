export type FileReference = {
  path: string;
  line?: number;
  column?: number;
};

const COMMON_FILE_NAMES = new Set([
  "dockerfile",
  "makefile",
  "readme",
  "license",
  "changelog",
  "package.json",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "vite.config.ts",
]);

const COMMON_FILE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "env",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "kts",
  "less",
  "lock",
  "md",
  "php",
  "py",
  "rb",
  "rs",
  "sass",
  "scala",
  "scss",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

export function looksLikeFilePath(value: string): boolean {
  return detectFileReference(value) !== undefined;
}

export function detectFileReference(value: string): FileReference | undefined {
  const unwrapped = unwrapPathText(value);
  if (!unwrapped || /\s/.test(unwrapped)) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(unwrapped)) return undefined;

  const hashLocation = /#L(\d+)(?:C(\d+))?$/i.exec(unwrapped);
  let candidate = unwrapped;
  let line: number | undefined;
  let column: number | undefined;
  if (hashLocation) {
    const [, lineText, columnText] = hashLocation;
    line = Number(lineText);
    column = columnText ? Number(columnText) : undefined;
    candidate = unwrapped.slice(0, hashLocation.index);
  }

  const lineLocation = /:(\d+)(?::(\d+))?$/.exec(candidate);
  if (lineLocation) {
    const base = candidate.slice(0, lineLocation.index);
    if (base.includes("/") || base.includes("\\") || /\.[A-Za-z0-9_-]{1,16}$/.test(base)) {
      const [, lineText, columnText] = lineLocation;
      line = Number(lineText);
      column = columnText ? Number(columnText) : column;
      candidate = base;
    }
  }

  if (!isLikelyPath(candidate)) return undefined;

  if (line !== undefined && !Number.isFinite(line)) return undefined;
  if (column !== undefined && !Number.isFinite(column)) return undefined;

  return { path: candidate, line, column };
}

function unwrapPathText(value: string): string {
  const trimmed = value.trim().replace(/[),.;!?]+$/, "");
  if (trimmed.length < 1) return "";

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const matchingQuotes =
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === "`" && last === "`");

  return matchingQuotes ? trimmed.slice(1, -1).trim() : trimmed;
}

function isLikelyPath(value: string): boolean {
  if (value.length === 0 || value.length > 512) return false;
  if (/[<>|"?*\u0000]/.test(value)) return false;

  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return false;

  const basename = parts[parts.length - 1] ?? "";
  const lowerBasename = basename.toLowerCase();
  const extension = lowerBasename.includes(".") ? lowerBasename.slice(lowerBasename.lastIndexOf(".") + 1) : undefined;
  const hasKnownExtension = extension ? COMMON_FILE_EXTENSIONS.has(extension) : false;
  const hasSeparator = normalized.includes("/");
  const hasPrefix =
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.startsWith("~/") ||
    /^[A-Za-z]:\//.test(normalized);

  if (!hasSeparator && !hasPrefix && !COMMON_FILE_NAMES.has(lowerBasename) && !hasKnownExtension) {
    return false;
  }

  for (const part of parts) {
    if (part === "." || part === "..") continue;
    if (part.length === 0) return false;
  }

  return true;
}
