/**
 * Persistence helper for cursor state: captures the last visible code location
 * and restores it across renders by mapping between file lines and global lines.
 */
import type { CliRenderer } from "@opentui/core";
import { Cursor } from "../controllers/cursor";
import { LineModel } from "../line_model";
import type { PersistedCursorState } from "./persistence";
import type { CodeFileEntry } from "../types";
import { normalizePersistedLineText } from "../utils/text";
import { FileExplorer } from "../app/components/file_explorer";

type LastCodeCursorSnapshot = {
  filePath: string;
  fileLine: number;
  lineText: string | null;
};

type PersistedCursorControllerOptions = {
  cursor: Cursor;
  lineModel: LineModel;
  fileExplorer: FileExplorer;
  getEntries: () => readonly CodeFileEntry[];
};

export class PersistedCursorController {
    private readonly options: PersistedCursorControllerOptions;
    private pendingPersistedCursorState: PersistedCursorState | null = null;
    private lastCodeCursorSnapshot: LastCodeCursorSnapshot | null = null;

    constructor(options: PersistedCursorControllerOptions) {
        this.options = options;
    }

    // ------------------------------------------
    // Actions
    // ------------------------------------------

    public updateLastCodeCursorSnapshot(): void {
        const lineInfo = this.options.lineModel.getVisibleLineInfo(this.options.cursor.cursorLine);
        if (!lineInfo || lineInfo.blockKind !== "code") { return; }
        if (!isPersistableFilePath(lineInfo.filePath)) { return; }
        if (typeof lineInfo.fileLine !== "number") { return; }

        this.lastCodeCursorSnapshot = {
            filePath: lineInfo.filePath,
            fileLine: lineInfo.fileLine,
            lineText: lineInfo.text,
        };
    }

    public resolveCursorForPersistence(): PersistedCursorState {
        this.updateLastCodeCursorSnapshot();

        const currentLineInfo = this.options.lineModel.getVisibleLineInfo(this.options.cursor.cursorLine);
        if (
            currentLineInfo?.blockKind === "collapsed" &&
      this.lastCodeCursorSnapshot &&
      this.options.getEntries().some((entry) => entry.relativePath === this.lastCodeCursorSnapshot?.filePath)
        ) {
            const mappedGlobalLine = this.options.lineModel.findGlobalLineForFileLine(
                this.lastCodeCursorSnapshot.filePath,
                this.lastCodeCursorSnapshot.fileLine,
            );
            return {
                globalLine: mappedGlobalLine ?? this.options.cursor.cursorLine,
                filePath: this.lastCodeCursorSnapshot.filePath,
                fileLine: this.lastCodeCursorSnapshot.fileLine,
                lineText: this.lastCodeCursorSnapshot.lineText,
            };
        }

        return {
            globalLine: this.options.cursor.cursorLine,
            filePath: currentLineInfo?.filePath ?? null,
            fileLine: currentLineInfo?.fileLine ?? null,
            lineText: currentLineInfo?.text ?? null,
        };
    }

    public applyPersistedState(cursor: PersistedCursorState): void {
        this.ensurePersistedCursorVisibility(cursor);

        if (isPersistableFilePath(cursor.filePath ?? "") && typeof cursor.fileLine === "number") {
            this.lastCodeCursorSnapshot = {
                filePath: cursor.filePath ?? "",
                fileLine: cursor.fileLine,
                lineText: cursor.lineText,
            };
        }

        this.pendingPersistedCursorState = cursor;
    }

    public async restoreAfterRender(renderer: Pick<CliRenderer, "idle" | "isDestroyed">): Promise<void> {
        try {
            await renderer.idle();
        } catch {
            return;
        }
        if (renderer.isDestroyed) { return; }
        this.restore();
    }

    public restore(): void {
        const persistedCursorState = this.pendingPersistedCursorState;
        if (!persistedCursorState) { return; }
        if (this.options.lineModel.totalLines <= 0) { return; }

        const restoreTarget = this.resolvePersistedCursorLine(persistedCursorState);
        this.options.cursor.goToLine(restoreTarget.line, "auto");
        if (!restoreTarget.shouldRetry) {
            this.pendingPersistedCursorState = null;
        }
    }

    // ------------------------------------------
    // Private Helpers
    // ------------------------------------------

    private ensurePersistedCursorVisibility(cursor: PersistedCursorState): void {
        const filePath = cursor.filePath;
        if (!filePath) { return; }

        if (filePath === "." || filePath.startsWith(FileExplorer.FILE_PAGE_ANCHOR_PATH)) {
            this.options.fileExplorer.setFilePageCollapsed(false);
            return;
        }

        if (filePath.startsWith("virtual://")) {
            return;
        }

        this.options.fileExplorer.expandFile(filePath);
    }

    private resolvePersistedCursorLine(cursor: PersistedCursorState): {
    line: number;
    shouldRetry: boolean;
  } {
        const filePath = cursor.filePath;
        if (!filePath) {
            return { line: 1, shouldRetry: false };
        }

        if (filePath === "." || filePath.startsWith("virtual://")) {
            const mappedVirtualLine = this.options.lineModel.findFirstGlobalLineForFilePath(filePath);
            return {
                line: mappedVirtualLine ?? 1,
                shouldRetry: false,
            };
        }

        const targetEntry = this.options.getEntries().find((entry) => entry.relativePath === filePath);
        if (!targetEntry) {
            return { line: 1, shouldRetry: false };
        }

        const persistedText = normalizePersistedLineText(cursor.lineText);
        if (typeof cursor.fileLine === "number") {
            const mappedByLine = this.options.lineModel.findGlobalLineForFileLine(filePath, cursor.fileLine);
            if (typeof mappedByLine === "number") {
                if (persistedText === null) {
                    return {
                        line: mappedByLine,
                        shouldRetry: !targetEntry.isContentLoaded && cursor.fileLine > 1,
                    };
                }

                const mappedText = normalizePersistedLineText(
                    this.options.lineModel.getVisibleLineInfo(mappedByLine)?.text ?? null,
                );
                if (mappedText === persistedText) {
                    return {
                        line: mappedByLine,
                        shouldRetry: false,
                    };
                }
            }
        }

        if (persistedText !== null) {
            const matchedByText = this.findClosestLineByPersistedText(filePath, persistedText, cursor.fileLine);
            if (typeof matchedByText === "number") {
                return {
                    line: matchedByText,
                    shouldRetry: false,
                };
            }
        }

        if (typeof cursor.fileLine === "number") {
            const closestByLine = this.findClosestLineByPersistedFileLine(filePath, cursor.fileLine);
            if (typeof closestByLine === "number") {
                return {
                    line: closestByLine,
                    shouldRetry: false,
                };
            }
        }

        const firstLineInFile = this.options.lineModel.findFirstGlobalLineForFilePath(filePath);
        if (typeof firstLineInFile === "number") {
            return {
                line: firstLineInFile,
                shouldRetry: !targetEntry.isContentLoaded,
            };
        }

        return {
            line: 1,
            shouldRetry: false,
        };
    }

    // ------------------------------------------
    // Finders
    // ------------------------------------------

    private findClosestLineByPersistedText(
        filePath: string,
        persistedText: string,
        preferredFileLine: number | null,
    ): number | undefined {
        let bestLine: number | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const block of this.options.lineModel.blocks) {
            if (block.filePath !== filePath || block.blockKind !== "code") { continue; }
            if (block.fileLineStart === null) { continue; }

            for (let offset = 0; offset < block.renderedLines.length; offset += 1) {
                const candidateText = normalizePersistedLineText(block.renderedLines[offset] ?? null);
                if (candidateText !== persistedText) { continue; }

                const candidateGlobalLine = block.lineStart + offset;
                const candidateFileLine = block.fileLineStart + offset;
                const distance = typeof preferredFileLine === "number"
                    ? Math.abs(candidateFileLine - preferredFileLine)
                    : 0;

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestLine = candidateGlobalLine;
                    continue;
                }

                if (distance === bestDistance && (bestLine === undefined || candidateGlobalLine < bestLine)) {
                    bestLine = candidateGlobalLine;
                }
            }
        }

        return bestLine;
    }

    private findClosestLineByPersistedFileLine(filePath: string, preferredFileLine: number): number | undefined {
        let bestLine: number | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const block of this.options.lineModel.blocks) {
            if (block.filePath !== filePath || block.blockKind !== "code") { continue; }
            if (block.fileLineStart === null) { continue; }

            const blockLength = Math.max(1, block.lineEnd - block.lineStart + 1);
            for (let offset = 0; offset < blockLength; offset += 1) {
                const candidateGlobalLine = block.lineStart + offset;
                const candidateFileLine = block.fileLineStart + offset;
                const distance = Math.abs(candidateFileLine - preferredFileLine);

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestLine = candidateGlobalLine;
                    continue;
                }

                if (distance === bestDistance && (bestLine === undefined || candidateGlobalLine < bestLine)) {
                    bestLine = candidateGlobalLine;
                }
            }
        }

        return bestLine;
    }
}

function isPersistableFilePath(filePath: string): boolean {
    return filePath.length > 0 && filePath !== "." && !filePath.startsWith("virtual://");
}
