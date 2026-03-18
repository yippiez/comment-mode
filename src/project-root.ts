import { spawnSync } from "node:child_process";
import path from "node:path";

export function resolveWorkspaceRoot(launchDirectory = process.cwd()): string {
  const probe = spawnSync("git", ["-C", launchDirectory, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  });

  if (probe.status === 0) {
    const gitRoot = probe.stdout.trim();
    if (gitRoot.length > 0) {
      return path.resolve(gitRoot);
    }
  }

  return path.resolve(launchDirectory);
}
