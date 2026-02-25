import { addDefaultParsers, type FiletypeParserOptions } from "@opentui/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CORE_WORKER_PATH = path.join(process.cwd(), "node_modules", "@opentui", "core", "parser.worker.js");
const PATCHED_WORKER_PATH = path.join(process.cwd(), ".opentui-cache", "parser.worker.patched.js");

const CUSTOM_TREE_SITTER_PARSERS: FiletypeParserOptions[] = [
  {
    filetype: "html",
    wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-html.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-html/master/queries/highlights.scm"],
      injections: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-html/master/queries/injections.scm"],
    },
  },
  {
    filetype: "css",
    wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-css.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-css/master/queries/highlights.scm"],
    },
  },
  {
    filetype: "json",
    wasm: "https://unpkg.com/tree-sitter-wasms@0.1.13/out/tree-sitter-json.wasm",
    queries: {
      highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-json/master/queries/highlights.scm"],
    },
  },
];

let registeredCustomParsers = false;

export function registerTreeSitterParsers(): void {
  if (registeredCustomParsers) return;
  addDefaultParsers(CUSTOM_TREE_SITTER_PARSERS);
  registeredCustomParsers = true;
}

export async function ensurePatchedTreeSitterWorkerPath(): Promise<void> {
  try {
    const source = await readFile(CORE_WORKER_PATH, "utf8");
    const patchedSource = source.replaceAll(
      "web-tree-sitter/tree-sitter.wasm",
      "web-tree-sitter/web-tree-sitter.wasm",
    );

    await mkdir(path.dirname(PATCHED_WORKER_PATH), { recursive: true });

    let currentPatched = "";
    try {
      currentPatched = await readFile(PATCHED_WORKER_PATH, "utf8");
    } catch {
      currentPatched = "";
    }

    if (currentPatched !== patchedSource) {
      await writeFile(PATCHED_WORKER_PATH, patchedSource, "utf8");
    }

    process.env.OTUI_TREE_SITTER_WORKER_PATH = PATCHED_WORKER_PATH;
  } catch {
    // fallback to OpenTUI default worker
  }
}
