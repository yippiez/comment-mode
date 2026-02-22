import type { AgentUpdate, CodeFileEntry } from "../types";

export type DiffSegment =
  | { kind: "collapsed"; fileLineStart: number; lineCount: number }
  | { kind: "code"; fileLineStart: number; lineCount: number; content: string };

export class ContentLayoutBuilder {
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

  /** Builds diff/collapsed segments from uncommitted-line markers for one file. */
  public static buildDiffSegments(entry: CodeFileEntry): DiffSegment[] {
    if (entry.lineCount <= 0) return [];
    if (entry.uncommittedLines.size === 0) {
      return [{ kind: "collapsed", fileLineStart: 1, lineCount: entry.lineCount }];
    }

    const lines = entry.content.split("\n");
    const segments: DiffSegment[] = [];
    let line = 1;

    while (line <= entry.lineCount) {
      const changed = entry.uncommittedLines.has(line);
      const rangeStart = line;
      while (line <= entry.lineCount && entry.uncommittedLines.has(line) === changed) {
        line += 1;
      }
      const rangeEnd = line - 1;
      const rangeCount = rangeEnd - rangeStart + 1;

      if (!changed) {
        segments.push({ kind: "collapsed", fileLineStart: rangeStart, lineCount: rangeCount });
        continue;
      }

      segments.push({
        kind: "code",
        fileLineStart: rangeStart,
        lineCount: rangeCount,
        content: lines.slice(rangeStart - 1, rangeEnd).join("\n"),
      });
    }

    return segments;
  }
}
