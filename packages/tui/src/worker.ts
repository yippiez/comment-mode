/**
 * Patches the OpenTUI tree-sitter parser worker to use the correct WASM file path.
 *
 * This worker is used during initialization in packages/tui/src/main.ts to ensure the
 * tree-sitter parser can locate its WASM files. The core OpenTUI worker
 * references "tree-sitter.wasm" but we need it to use "web-tree-sitter.wasm".
 * This module patches the worker file and sets the OTUI_TREE_SITTER_WORKER_PATH
 * environment variable to point to the patched version.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CORE_WORKER_PATH, PATCHED_WORKER_PATH } from "./config";

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
    // Fall back to the default OpenTUI worker path if patching fails.
  }
}
