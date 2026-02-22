import type { LineNumberRenderable } from "@opentui/core";
import type { RenderedLineBlock } from "./types";
import { clamp } from "./ui-utils";

export type FileAnchor = {
  line: number;
  dividerRow: number;
  filePath: string;
};

type AddBlockParams = {
  lineView: LineNumberRenderable;
  filePath: string;
  lineStart: number;
  lineCount: number;
  displayRowStart: number;
};

export class LineModel {
  private renderedLineBlocks: RenderedLineBlock[] = [];
  private fileAnchors: FileAnchor[] = [];
  private lineToDisplayRow: number[] = [0];
  private displayRowToLine: Array<number | undefined> = [];
  private totalVisibleLines = 0;

  public reset(): void {
    this.renderedLineBlocks = [];
    this.fileAnchors = [];
    this.lineToDisplayRow = [0];
    this.displayRowToLine = [];
    this.totalVisibleLines = 0;
  }

  public get blocks(): readonly RenderedLineBlock[] {
    return this.renderedLineBlocks;
  }

  public get totalLines(): number {
    return this.totalVisibleLines;
  }

  public setTotalLines(total: number): void {
    this.totalVisibleLines = Math.max(0, total);
  }

  public get mappedDisplayRowCount(): number {
    return this.displayRowToLine.length;
  }

  public markDivider(displayRow: number): void {
    this.displayRowToLine[Math.max(0, displayRow)] = undefined;
  }

  public addFileAnchor(anchor: FileAnchor): void {
    this.fileAnchors.push(anchor);
  }

  public getFileAnchor(index: number): FileAnchor | undefined {
    return this.fileAnchors[index];
  }

  public addBlock(params: AddBlockParams): void {
    const { lineView, filePath, lineStart, lineCount, displayRowStart } = params;
    const safeLineCount = Math.max(1, lineCount);
    const lineEnd = lineStart + safeLineCount - 1;

    this.renderedLineBlocks.push({
      lineView,
      lineStart,
      lineEnd,
      filePath,
    });

    for (let lineOffset = 0; lineOffset < safeLineCount; lineOffset += 1) {
      const globalLine = lineStart + lineOffset;
      const displayRow = displayRowStart + lineOffset;
      this.lineToDisplayRow[globalLine] = displayRow;
      this.displayRowToLine[displayRow] = globalLine;
    }
  }

  public getDisplayRowForLine(globalLine: number): number {
    const directHit = this.lineToDisplayRow[globalLine];
    if (directHit !== undefined) return directHit;
    if (globalLine <= 1) return 0;
    return Math.max(0, this.displayRowToLine.length - 1);
  }

  public findLineForDisplayRow(targetRow: number, movementDelta: number): number | undefined {
    if (this.displayRowToLine.length === 0) return undefined;

    const clampedRow = clamp(Math.round(targetRow), 0, this.displayRowToLine.length - 1);
    const exactLine = this.displayRowToLine[clampedRow];
    if (exactLine !== undefined) return exactLine;

    if (movementDelta >= 0) {
      return this.findLineAtOrBelow(clampedRow) ?? this.findLineAtOrAbove(clampedRow);
    }

    return this.findLineAtOrAbove(clampedRow) ?? this.findLineAtOrBelow(clampedRow);
  }

  public getCurrentFilePath(cursorLine: number): string | undefined {
    if (cursorLine <= 0) return undefined;
    let lastSeenFilePath: string | undefined;
    for (const block of this.renderedLineBlocks) {
      if (cursorLine < block.lineStart) {
        return lastSeenFilePath ?? block.filePath;
      }
      if (cursorLine <= block.lineEnd) return block.filePath;
      lastSeenFilePath = block.filePath;
    }
    return lastSeenFilePath;
  }

  public findCurrentFileAnchorIndex(cursorLine: number): number {
    if (this.fileAnchors.length === 0) return -1;

    const currentFilePath = this.getCurrentFilePath(cursorLine);
    if (currentFilePath) {
      const byPath = this.fileAnchors.findIndex((anchor) => anchor.filePath === currentFilePath);
      if (byPath >= 0) return byPath;
    }

    return this.findFileAnchorIndexByLine(cursorLine);
  }

  private findLineAtOrBelow(startRow: number): number | undefined {
    for (let row = startRow; row < this.displayRowToLine.length; row += 1) {
      const line = this.displayRowToLine[row];
      if (line !== undefined) return line;
    }
    return undefined;
  }

  private findLineAtOrAbove(startRow: number): number | undefined {
    for (let row = startRow; row >= 0; row -= 1) {
      const line = this.displayRowToLine[row];
      if (line !== undefined) return line;
    }
    return undefined;
  }

  private findFileAnchorIndexByLine(cursorLine: number): number {
    let left = 0;
    let right = this.fileAnchors.length - 1;
    let best = -1;

    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      const midLine = this.fileAnchors[mid]?.line ?? 1;
      if (midLine <= cursorLine) {
        best = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return best;
  }
}
