import { getIgnoredDirs, loadCodeFileEntries as loadWorkspaceCodeFileEntries } from "./workspace";
import type { CodeFileEntry } from "./types";

export async function loadCodeFileEntries(): Promise<CodeFileEntry[]> {
  const rootDir = process.cwd();
  const ignoredDirs = await getIgnoredDirs(rootDir);
  const entries = await loadWorkspaceCodeFileEntries(rootDir, ignoredDirs);

  return entries.map((entry) => ({
    ...entry,
    uncommittedLines: new Set(entry.uncommittedLines),
  }));
}
