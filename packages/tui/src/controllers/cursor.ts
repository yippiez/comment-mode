import { clamp } from "../utils/ui";
import { emit, SIGNALS } from "../signals";
import { Camera } from "./camera";

type CursorBindings = {
  camera: Camera;
};

export class Cursor {
  private readonly bindings: CursorBindings;

  private totalLines = 0;
  private line = 1;
  private visualMode = false;
  private visualAnchorLine = 1;

  constructor(bindings: CursorBindings) {
    this.bindings = bindings;
  }

  public get cursorLine(): number {
    return this.line;
  }

  public get selectionRange(): { start: number; end: number } {
    if (this.totalLines <= 0) return { start: 0, end: 0 };
    if (!this.visualMode) return { start: this.line, end: this.line };
    return {
      start: Math.min(this.visualAnchorLine, this.line),
      end: Math.max(this.visualAnchorLine, this.line),
    };
  }

  public get isVisualModeEnabled(): boolean {
    return this.visualMode;
  }

  public configure(totalLines: number): void {
    this.configureWithTarget(totalLines);
  }

  public configureWithTarget(
    totalLines: number,
    targetLine?: number,
    positionMode: "auto" | "top" | "bottom" | "keep" = "auto",
  ): void {
    const previous = this.line;
    this.totalLines = Math.max(0, totalLines);
    if (typeof targetLine === "number" && Number.isFinite(targetLine)) {
      this.line = Math.round(targetLine);
    }
    this.clampState();
    emit(SIGNALS.cursorChanged);
    this.bindings.camera.configure(this.line, this.totalLines);
    if (typeof targetLine === "number" && positionMode !== "keep") {
      this.bindings.camera.onCursorSet(this.line, this.totalLines, previous, positionMode);
    }
  }

  public pageStep(): number {
    return this.bindings.camera.pageStep();
  }

  public moveBy(delta: number): void {
    if (this.totalLines <= 0) return;
    this.line = clamp(this.line + delta, 1, this.totalLines);
    emit(SIGNALS.cursorChanged);
    this.bindings.camera.onCursorMoved(this.line, this.totalLines, delta);
  }

  public goToLine(
    targetLine: number,
    positionMode: "auto" | "top" | "bottom" | "keep" = "auto",
  ): void {
    if (this.totalLines <= 0) return;
    const previous = this.line;
    this.line = clamp(targetLine, 1, this.totalLines);
    emit(SIGNALS.cursorChanged);
    if (positionMode === "keep") return;
    this.bindings.camera.onCursorSet(this.line, this.totalLines, previous, positionMode);
  }

  public goToLineAtMinVisibleHeight(targetLine: number): void {
    if (this.totalLines <= 0) return;
    this.line = clamp(targetLine, 1, this.totalLines);
    emit(SIGNALS.cursorChanged);
    this.bindings.camera.placeLineAtMinVisibleHeight(this.line, this.totalLines);
  }

  public goToMaxVisibleHeight(): void {
    this.bindings.camera.goToCursorMaxVisibleHeight(this.line, this.totalLines);
  }

  public goToMinVisibleHeight(): void {
    this.bindings.camera.goToCursorMinVisibleHeight(this.line, this.totalLines);
  }

  public toggleVisualMode(): void {
    if (this.totalLines <= 0) return;
    this.visualMode = !this.visualMode;
    this.visualAnchorLine = this.line;
    emit(SIGNALS.cursorChanged);
    this.bindings.camera.onCursorMoved(this.line, this.totalLines, 0);
  }

  public disableVisualMode(): void {
    if (!this.visualMode) return;
    this.visualMode = false;
    this.visualAnchorLine = this.line;
    emit(SIGNALS.cursorChanged);
    this.bindings.camera.onCursorMoved(this.line, this.totalLines, 0);
  }

  public handleExternalScroll(nextTop: number): void {
    const nextLine = this.bindings.camera.handleExternalScroll(nextTop, this.totalLines, this.line);
    if (nextLine === undefined) return;
    this.line = nextLine;
    emit(SIGNALS.cursorChanged);
  }

  private clampState(): void {
    if (this.totalLines <= 0) {
      this.line = 1;
      this.visualAnchorLine = 1;
      return;
    }
    this.line = clamp(this.line, 1, this.totalLines);
    this.visualAnchorLine = clamp(this.visualAnchorLine, 1, this.totalLines);
  }
}
