#!/usr/bin/env bun

/**
 * CLI entrypoint for the terminal code browser.
 * Boots the TUI renderer, loads persisted state and workspace entries, and starts the app.
 */
import { createCliRenderer } from "@opentui/core";
import { CodeBrowserApp } from "./app";
import { PersistenceController } from "./controllers/persistence";
import { loadCodeFileEntries } from "./utils/files";
import { registerTreeSitterParsers } from "./integrations/treesitter";
import { SIGNALS } from "./signals";
import { getIgnoredDirs, watchWorkspace } from "./workspace";

registerTreeSitterParsers();

const renderer = await createCliRenderer({ exitOnCtrlC: true });
const rootDir = process.cwd();
const persistence = new PersistenceController();
await persistence.load(rootDir);
const persistedUiState = persistence.getUiState();
const persistedGroups = [...persistence.getGroups()];
const entries = await loadCodeFileEntries(rootDir);

const savePersistence = (): void => {
    void persistence.save().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[persistence] failed to write state: ${message}`);
    });
};

const app = new CodeBrowserApp(renderer, entries, {
    workspaceRootDir: rootDir,
    initialPersistedUiState: persistedUiState,
    initialPersistedGroups: persistedGroups,
    onPersistedGroupsChanged: (groups) => {
        persistence.setGroups(groups);
        persistence.setUiState(app.getPersistenceSnapshot());
        savePersistence();
    },
});
app.start();

const persistenceInterval = setInterval(() => {
    persistence.setUiState(app.getPersistenceSnapshot());
    savePersistence();
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

const workspaceChangeUnsub = SIGNALS.workspaceChanged(() => {
    void refreshEntries();
});

const focusUnsub = SIGNALS.onFocus(() => {
    void refreshEntries();
});

const ignoredDirs = await getIgnoredDirs(rootDir);
const watcher = await watchWorkspace(rootDir, ignoredDirs, () => {
    SIGNALS.workspaceChanged();
});

renderer.on("destroy", () => {
    clearInterval(persistenceInterval);
    clearRefreshRetryTimer();
    persistence.setUiState(app.getPersistenceSnapshot());
    try {
        persistence.saveSync();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[persistence] failed to write state: ${message}`);
    }
    app.shutdown();
    workspaceChangeUnsub();
    focusUnsub();
    watcher.close();
});
