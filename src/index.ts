import { createCliRenderer } from "@opentui/core";
import { CodeBrowserApp } from "./app";
import { loadCodeFileEntries } from "./files";
import { watchWorkspace } from "./live-reload";
import { ensurePatchedTreeSitterWorkerPath } from "./worker";

await ensurePatchedTreeSitterWorkerPath();

const rootDir = process.cwd();
const renderer = await createCliRenderer({ exitOnCtrlC: true });
const entries = await loadCodeFileEntries(rootDir);

const app = new CodeBrowserApp(renderer, entries, { rootDir });
app.start();

let refreshRunning = false;
let refreshPending = false;

const refreshEntries = async () => {
  if (refreshRunning) {
    refreshPending = true;
    return;
  }

  refreshRunning = true;
  do {
    refreshPending = false;
    try {
      const nextEntries = await loadCodeFileEntries(rootDir);
      app.refreshEntries(nextEntries);
    } catch {
      // File updates may race with writes; next watch event will re-trigger refresh.
    }
  } while (refreshPending);
  refreshRunning = false;
};

const watcher = await watchWorkspace(rootDir, () => {
  void refreshEntries();
});

renderer.on("destroy", () => {
  app.shutdown();
  watcher.close();
});
