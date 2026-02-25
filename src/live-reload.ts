import { emit, SIGNALS } from "./signals";
import { getIgnoredDirs, watchWorkspace as watchWorkspaceFs } from "./workspace";

type WorkspaceWatcher = {
  close: () => void;
};

export async function watchWorkspace(): Promise<WorkspaceWatcher> {
  const rootDir = process.cwd();
  const ignoredDirs = await getIgnoredDirs(rootDir);
  const watcher = await watchWorkspaceFs(rootDir, ignoredDirs, () => {
    emit(SIGNALS.workspaceChanged);
  });
  return watcher;
}
