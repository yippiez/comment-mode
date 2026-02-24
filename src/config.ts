import fs from "node:fs";
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

function getIgnoredDirs(): Set<string> {
  const ignored = new Set<string>();
  const gitignorePath = path.join(process.cwd(), ".gitignore");

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const parts = trimmed.split("/");
        const first = parts[0];
        if (first && !first.includes("*")) {
          ignored.add(first);
        }
      }
    }
  }

  return ignored;
}

export const IGNORE_DIRS = getIgnoredDirs();

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
