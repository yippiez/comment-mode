import path from "node:path";

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
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

export const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "dist",
  "node_modules",
  "out",
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
