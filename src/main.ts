import { createCliRenderer } from "@opentui/core";
import { CodeBrowserApp } from "./app";
import { loadCodeFileEntries } from "./files";
import { loadPersistedGroups, savePersistedGroups, type PersistedUiGroup } from "./groups";
import { registerTreeSitterParsers } from "./integrations/treesitter";
import { loadPersistedUiState, PersistedUiStateWriter } from "./persistence";
import { resolveWorkspaceRoot } from "./project-root";
import { emit, register, deregister, SIGNALS } from "./signals";
import { getIgnoredDirs, watchWorkspace } from "./workspace";

registerTreeSitterParsers();

const renderer = await createCliRenderer({ exitOnCtrlC: true });
const rootDir = resolveWorkspaceRoot();
const persistedUiState = await loadPersistedUiState(rootDir);
const persistedGroups = await loadPersistedGroups(rootDir);
const entries = await loadCodeFileEntries(rootDir);

let groupsWriteQueue = Promise.resolve();

const schedulePersistedGroupsWrite = (groups: PersistedUiGroup[]): void => {
  groupsWriteQueue = groupsWriteQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        await savePersistedGroups(rootDir, groups);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[groups] failed to write groups: ${message}`);
      }
    });
};

const app = new CodeBrowserApp(renderer, entries, {
  workspaceRootDir: rootDir,
  initialPersistedUiState: persistedUiState,
  initialPersistedGroups: persistedGroups,
  onPersistedGroupsChanged: (groups) => {
    schedulePersistedGroupsWrite(groups);
  },
});
app.start();

const persistedStateWriter = new PersistedUiStateWriter(rootDir);
persistedStateWriter.seed(persistedUiState);

const persistenceInterval = setInterval(() => {
  persistedStateWriter.schedule(app.getPersistenceSnapshot());
}, 250);

let refreshRunning = false;
let refreshPending = false;
let refreshRetryTimer: ReturnType<typeof setTimeout> | undefined;
let refreshRetryArmed = true;

const clearRefreshRetryTimer = () => {
  if (!refreshRetryTimer) return;
  clearTimeout(refreshRetryTimer);
  refreshRetryTimer = undefined;
};

const scheduleRefreshRetry = () => {
  if (!refreshRetryArmed || refreshRetryTimer) return;

  refreshRetryArmed = false;
  refreshRetryTimer = setTimeout(() => {
    refreshRetryTimer = undefined;
    void refreshEntries();
  }, 180);
};

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
      refreshRetryArmed = true;
      clearRefreshRetryTimer();
    } catch {
      scheduleRefreshRetry();
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

const ignoredDirs = await getIgnoredDirs(rootDir);
const watcher = await watchWorkspace(rootDir, ignoredDirs, () => {
  emit(SIGNALS.workspaceChanged);
});

renderer.on("destroy", () => {
  clearInterval(persistenceInterval);
  clearRefreshRetryTimer();
  persistedStateWriter.flushNowSync(app.getPersistenceSnapshot());
  persistedStateWriter.dispose();
  app.shutdown();
  deregister(workspaceChangeRegistrationId);
  deregister(focusRegistrationId);
  watcher.close();
});
