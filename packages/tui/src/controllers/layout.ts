import type { AgentUpdate } from "../types";

export class Layout {
  /** Returns updates for one file in stable render order. */
  public static getUpdatesForFile(
    updates: readonly AgentUpdate[],
    filePath: string,
  ): AgentUpdate[] {
    return updates
      .filter((update) => update.filePath === filePath)
      .sort((a, b) => {
        if (a.selectionEndFileLine !== b.selectionEndFileLine) {
          return a.selectionEndFileLine - b.selectionEndFileLine;
        }
        return a.id.localeCompare(b.id);
      });
  }
}
