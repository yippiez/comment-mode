import { watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { IGNORE_DIRS } from "./config";

type WatcherOptions = {
  changeDebounceMs?: number;
  rebuildDebounceMs?: number;
};

type WorkspaceWatcher = {
  close: () => void;
};

export async function watchWorkspace(
  root: string,
  onChange: () => void,
  options: WatcherOptions = {},
): Promise<WorkspaceWatcher> {
  const changeDebounceMs = options.changeDebounceMs ?? 80;
  const rebuildDebounceMs = options.rebuildDebounceMs ?? 160;

  const watchers = new Map<string, FSWatcher>();
  let isClosed = false;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

  const emitChange = () => {
    if (isClosed) return;
    onChange();
  };

  const scheduleChange = () => {
    if (isClosed) return;
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      changeTimer = undefined;
      emitChange();
    }, changeDebounceMs);
  };

  const scheduleRebuild = () => {
    if (isClosed) return;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = undefined;
      void rebuildWatchers();
    }, rebuildDebounceMs);
  };

  const createWatcher = (dir: string) => {
    if (watchers.has(dir) || isClosed) return;

    try {
      const watcher = watch(dir, (eventType) => {
        scheduleChange();
        if (eventType === "rename") {
          scheduleRebuild();
        }
      });

      watcher.on("error", () => {
        scheduleRebuild();
        scheduleChange();
      });

      watchers.set(dir, watcher);
    } catch {
      // Directory may disappear between traversal and watch attach; rebuild shortly.
      scheduleRebuild();
    }
  };

  const rebuildWatchers = async () => {
    if (isClosed) return;

    const watchedDirs = await listWatchableDirs(root);
    if (isClosed) return;

    const nextSet = new Set(watchedDirs);

    for (const [dir, watcher] of watchers.entries()) {
      if (nextSet.has(dir)) continue;
      watcher.close();
      watchers.delete(dir);
    }

    for (const dir of watchedDirs) {
      createWatcher(dir);
    }
  };

  await rebuildWatchers();

  return {
    close: () => {
      isClosed = true;
      if (changeTimer) clearTimeout(changeTimer);
      if (rebuildTimer) clearTimeout(rebuildTimer);
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
    },
  };
}

async function listWatchableDirs(root: string): Promise<string[]> {
  const dirs: string[] = [];

  async function walk(dir: string): Promise<void> {
    dirs.push(dir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      await walk(path.join(dir, entry.name));
    }
  }

  await walk(root);
  return dirs;
}
