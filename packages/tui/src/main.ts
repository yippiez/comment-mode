import { createCliRenderer } from "@opentui/core";
import { CodeBrowserApp } from "./app";
import { loadCodeFileEntries } from "./files";
import { watchWorkspace } from "./live-reload";
import { deregister, register, SIGNALS } from "./signals";
import { ensurePatchedTreeSitterWorkerPath } from "./worker";

await ensurePatchedTreeSitterWorkerPath();

const renderer = await createCliRenderer({ exitOnCtrlC: true });
const entries = await loadCodeFileEntries();

const app = new CodeBrowserApp(renderer, entries);
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
      const nextEntries = await loadCodeFileEntries();
      app.refreshEntries(nextEntries);
    } catch {
      // File updates may race with writes; next watch event will re-trigger refresh.
    }
  } while (refreshPending);
  refreshRunning = false;
};

const workspaceChangeRegistrationId = register(SIGNALS.workspaceChanged, () => {
  void refreshEntries();
});

const watcher = await watchWorkspace();

renderer.on("destroy", () => {
  app.shutdown();
  deregister(workspaceChangeRegistrationId);
  watcher.close();
});
