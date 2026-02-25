import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CORE_WORKER_PATH = path.join(process.cwd(), "node_modules", "@opentui", "core", "parser.worker.js");
const PATCHED_WORKER_PATH = path.join(process.cwd(), ".opentui-cache", "parser.worker.patched.js");

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
