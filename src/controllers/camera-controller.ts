import { clamp } from "../utils/ui";

type CameraBindings = {
  getViewportHeight: () => number;
  getMaxScrollTop: () => number;
  getScrollTop: () => number;
  setScrollTop: (top: number) => void;
  getDisplayRowForLine: (line: number) => number;
  getLineForDisplayRow: (row: number, movementDelta: number) => number | undefined;
};

export class CameraController {
  private static readonly PROGRAMMATIC_SCROLL_TTL_MS = 400;
  private static readonly MAX_PROGRAMMATIC_SCROLL_EVENTS = 64;

  private readonly bindings: CameraBindings;

  private preferredViewportOffset = 0;
  private lastKnownScrollTop = 0;
  private internalScrollUpdate = false;
  private pendingProgrammaticScrolls: Array<{ top: number; at: number }> = [];

  constructor(bindings: CameraBindings) {
    this.bindings = bindings;
  }

  public pageStep(): number {
    return Math.max(1, this.bindings.getViewportHeight() - 1);
  }

  public configure(cursorLine: number, totalLines: number): void {
    if (totalLines <= 0) {
      this.preferredViewportOffset = 0;
      this.lastKnownScrollTop = this.bindings.getScrollTop();
      return;
    }

    this.ensureCursorVisible(cursorLine, 0);
    this.updatePreferredViewportOffset(cursorLine);
  }

  public onCursorMoved(cursorLine: number, totalLines: number, direction: number): void {
    if (totalLines <= 0) return;
    this.ensureCursorVisible(cursorLine, direction);
    this.updatePreferredViewportOffset(cursorLine);
  }

  public onCursorSet(
    cursorLine: number,
    totalLines: number,
    previousLine: number,
    positionMode: "auto" | "top" | "bottom",
  ): void {
    if (totalLines <= 0) return;

    if (positionMode === "top") {
      this.scrollTo(0);
    } else if (positionMode === "bottom") {
      this.scrollTo(this.bindings.getMaxScrollTop());
    } else {
      this.ensureCursorVisible(cursorLine, cursorLine - previousLine);
    }

    this.updatePreferredViewportOffset(cursorLine);
  }

  public goToCursorMaxVisibleHeight(cursorLine: number, totalLines: number): void {
    if (totalLines <= 0) return;
    const row = this.bindings.getDisplayRowForLine(cursorLine);
    this.scrollTo(row - this.maxVisibleOffset());
    this.ensureInViewport(row);
    this.updatePreferredViewportOffset(cursorLine);
  }

  public goToCursorMinVisibleHeight(cursorLine: number, totalLines: number): void {
    if (totalLines <= 0) return;
    const row = this.bindings.getDisplayRowForLine(cursorLine);
    this.scrollTo(row - this.minVisibleOffset());
    this.ensureInViewport(row);
    this.updatePreferredViewportOffset(cursorLine);
  }

  public placeDisplayRowAtMinVisibleHeight(displayRow: number, cursorLine: number): void {
    const normalizedRow = Math.max(0, Math.round(displayRow));
    this.scrollTo(normalizedRow - this.minVisibleOffset());
    this.ensureInViewport(normalizedRow);
    this.updatePreferredViewportOffset(cursorLine);
  }

  public placeLineAtMinVisibleHeight(line: number, totalLines: number): void {
    if (totalLines <= 0) return;
    const displayRow = this.bindings.getDisplayRowForLine(line);
    this.placeDisplayRowAtMinVisibleHeight(displayRow, line);
  }

  public handleExternalScroll(
    nextTop: number,
    totalLines: number,
    currentCursorLine: number,
  ): number | undefined {
    const normalizedTop = clamp(Math.round(nextTop), 0, this.bindings.getMaxScrollTop());

    if (this.internalScrollUpdate) {
      this.lastKnownScrollTop = normalizedTop;
      return undefined;
    }
    if (this.consumeProgrammaticScrollEvent(normalizedTop)) {
      this.lastKnownScrollTop = normalizedTop;
      return undefined;
    }
    if (normalizedTop === this.lastKnownScrollTop) {
      return undefined;
    }

    const delta = normalizedTop - this.lastKnownScrollTop;
    this.lastKnownScrollTop = normalizedTop;
    if (totalLines <= 0) return undefined;

    const viewportHeight = this.bindings.getViewportHeight();
    const preferredOffset = clamp(this.preferredViewportOffset, 0, viewportHeight - 1);
    const targetRow = normalizedTop + preferredOffset;
    const nextLine = this.bindings.getLineForDisplayRow(targetRow, delta);
    if (nextLine === undefined) return undefined;

    const clampedLine = clamp(nextLine, 1, totalLines);
    this.updatePreferredViewportOffset(clampedLine);
    if (clampedLine === currentCursorLine) return undefined;
    return clampedLine;
  }

  private ensureCursorVisible(cursorLine: number, direction: number): void {
    const row = this.bindings.getDisplayRowForLine(cursorLine);
    const top = this.bindings.getScrollTop();
    const minOffset = this.minVisibleOffset();
    const maxOffset = this.maxVisibleOffset();
    const bandTopRow = top + minOffset;
    const bandBottomRow = top + maxOffset;

    if (direction > 0) {
      if (row >= bandBottomRow) {
        this.scrollTo(row - maxOffset);
      }
    } else if (direction < 0) {
      if (row <= bandTopRow) {
        this.scrollTo(row - minOffset);
      }
    } else {
      if (row < bandTopRow) {
        this.scrollTo(row - minOffset);
      } else if (row > bandBottomRow) {
        this.scrollTo(row - maxOffset);
      }
    }

    this.ensureInViewport(row);
  }

  private ensureInViewport(row: number): void {
    const viewportHeight = this.bindings.getViewportHeight();
    const top = this.bindings.getScrollTop();
    const bottom = top + viewportHeight - 1;
    if (row < top) {
      this.scrollTo(row);
      return;
    }
    if (row > bottom) {
      this.scrollTo(row - viewportHeight + 1);
    }
  }

  private scrollTo(nextTop: number): void {
    const bounded = clamp(Math.round(nextTop), 0, this.bindings.getMaxScrollTop());
    if (bounded === this.bindings.getScrollTop()) {
      this.lastKnownScrollTop = bounded;
      return;
    }
    this.internalScrollUpdate = true;
    try {
      this.trackProgrammaticScrollEvent(bounded);
      this.bindings.setScrollTop(bounded);
      this.lastKnownScrollTop = this.bindings.getScrollTop();
    } finally {
      this.internalScrollUpdate = false;
    }
  }

  private minVisibleOffset(): number {
    return Math.floor(this.bindings.getViewportHeight() * 0.2);
  }

  private maxVisibleOffset(): number {
    const viewportHeight = this.bindings.getViewportHeight();
    return Math.max(this.minVisibleOffset(), Math.ceil(viewportHeight * 0.8) - 1);
  }

  private updatePreferredViewportOffset(cursorLine: number): void {
    const viewportHeight = this.bindings.getViewportHeight();
    const row = this.bindings.getDisplayRowForLine(cursorLine);
    this.preferredViewportOffset = clamp(row - this.bindings.getScrollTop(), 0, viewportHeight - 1);
    this.lastKnownScrollTop = this.bindings.getScrollTop();
  }

  private trackProgrammaticScrollEvent(top: number): void {
    this.pruneProgrammaticScrollEvents();
    this.pendingProgrammaticScrolls.push({ top, at: Date.now() });
    if (this.pendingProgrammaticScrolls.length <= CameraController.MAX_PROGRAMMATIC_SCROLL_EVENTS) {
      return;
    }
    this.pendingProgrammaticScrolls.splice(
      0,
      this.pendingProgrammaticScrolls.length - CameraController.MAX_PROGRAMMATIC_SCROLL_EVENTS,
    );
  }

  private consumeProgrammaticScrollEvent(top: number): boolean {
    this.pruneProgrammaticScrollEvents();
    const index = this.pendingProgrammaticScrolls.findIndex((entry) => entry.top === top);
    if (index < 0) return false;
    this.pendingProgrammaticScrolls.splice(index, 1);
    return true;
  }

  private pruneProgrammaticScrollEvents(): void {
    const cutoff = Date.now() - CameraController.PROGRAMMATIC_SCROLL_TTL_MS;
    this.pendingProgrammaticScrolls = this.pendingProgrammaticScrolls.filter(
      (entry) => entry.at >= cutoff,
    );
  }
}
