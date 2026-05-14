#!/usr/bin/env bun
/**
 * CLI entrypoint for the terminal code browser.
 * Boots the TUI renderer, loads workspace entries, and starts the app.
 */
import { createCliRenderer } from "@opentui/core";
import { CodeBrowserApp } from "./app";
import { loadCodeFileEntries } from "./utils/files";
import { registerTreeSitterParsers } from "./integrations/treesitter";
import { SIGNALS } from "./signals";
import { getIgnoredDirs, watchWorkspace } from "./workspace";

registerTreeSitterParsers();

const renderer = await createCliRenderer({ exitOnCtrlC: true });
const rootDir = process.cwd();
const entries = await loadCodeFileEntries(rootDir);

const app = new CodeBrowserApp(renderer, entries, {
    workspaceRootDir: rootDir,
});
await app.start();

let refreshRunning = false;
let refreshPending = false;
let refreshRetryTimer: ReturnType<typeof setTimeout> | undefined;
let refreshRetryArmed = true;

const clearRefreshRetryTimer = () => {
    if (!refreshRetryTimer) { return; }
    clearTimeout(refreshRetryTimer);
    refreshRetryTimer = undefined;
};

const scheduleRefreshRetry = () => {
    if (!refreshRetryArmed || refreshRetryTimer) { return; }

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
            await app.refreshEntries(nextEntries);
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
    clearRefreshRetryTimer();
    app.shutdown();
    workspaceChangeUnsub();
    focusUnsub();
    watcher.close();
});
