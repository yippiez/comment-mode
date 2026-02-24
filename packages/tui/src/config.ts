import path from "node:path";

export const COMMON_FILE_NAMES = new Set([
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

export const COMMON_FILE_EXTENSIONS = new Set([
  "c", "cc", "cpp", "cs", "css", "env",
  "go", "h", "hpp", "html", "ini", "java",
  "js", "json", "jsx", "kt", "kts", "less",
  "lock", "md", "php", "py", "rb", "rs",
  "sass", "scala", "scss", "sh", "sql", "swift",
  "toml", "ts", "tsx", "txt", "xml", "yaml",
  "yml", "zsh",
]);

export const CORE_WORKER_PATH = path.join(
  process.cwd(),
  "node_modules",
  "@opentui",
  "core",
  "parser.worker.js",
);

export const PATCHED_WORKER_PATH = path.join(
  process.cwd(),
  ".opentui-cache",
  "parser.worker.patched.js",
);
