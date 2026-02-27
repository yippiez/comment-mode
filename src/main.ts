import { createCliRenderer } from "@opentui/core";
import { CodeBrowserApp } from "./app";
import { loadCodeFileEntries } from "./files";
import { registerTreeSitterParsers } from "./integrations/treesitter";
import { watchWorkspace } from "./live-reload";
import { loadPersistedUiState, PersistedUiStateWriter } from "./persistence";
import { resolveWorkspaceRoot } from "./project-root";
import { deregister, register, SIGNALS } from "./signals";

registerTreeSitterParsers();

const renderer = await createCliRenderer({ exitOnCtrlC: true });
const rootDir = resolveWorkspaceRoot();
const persistedUiState = await loadPersistedUiState(rootDir);
const entries = await loadCodeFileEntries(rootDir);

const app = new CodeBrowserApp(renderer, entries, {
  workspaceRootDir: rootDir,
  initialPersistedUiState: persistedUiState,
});
app.start();

const persistedStateWriter = new PersistedUiStateWriter(rootDir);
persistedStateWriter.seed(persistedUiState);

const persistenceInterval = setInterval(() => {
  persistedStateWriter.schedule(app.getPersistenceSnapshot());
}, 250);

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

const workspaceChangeRegistrationId = register(SIGNALS.workspaceChanged, () => {
  void refreshEntries();
});

const focusRegistrationId = register(SIGNALS.onFocus, () => {
  void refreshEntries();
});

const watcher = await watchWorkspace(rootDir);

renderer.on("destroy", () => {
  clearInterval(persistenceInterval);
  persistedStateWriter.flushNowSync(app.getPersistenceSnapshot());
  persistedStateWriter.dispose();
  app.shutdown();
  deregister(workspaceChangeRegistrationId);
  deregister(focusRegistrationId);
  watcher.close();
});
