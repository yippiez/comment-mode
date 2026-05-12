/**
 * Navigation controller: implements vim-like movement and jumps between
 * files and agent prompt blocks while coordinating cursor and camera.
 */
import { Camera } from "./camera";
import { Cursor } from "./cursor";
import { LineModel } from "../line_model";

type NavigationBindings = {
  cursor: Cursor;
  camera: Camera;
  lineModel: LineModel;
  getAgentPromptLines: () => number[];
  getAnchorDividerDisplayRow: (anchor: { filePath: string; dividerRow: number }) => number;
};

export class NavigationController {
    private static readonly REPEATED_MOVE_THROTTLE_MS = 14;

    private readonly bindings: NavigationBindings;
    private lastRepeatedMoveAt = 0;

    /** Creates navigation coordinator for vim-style movement and file jumps. */
    constructor(bindings: NavigationBindings) {
        this.bindings = bindings;
    }

    // ------------------------------------------
    // Actions
    // ------------------------------------------

    /** Throttles repeated keypress bursts to avoid queued jump spikes. */
    public shouldThrottleRepeatedMove(repeated: boolean): boolean {
        if (!repeated) { return false; }
        const now = Date.now();
        if (now - this.lastRepeatedMoveAt < NavigationController.REPEATED_MOVE_THROTTLE_MS) {
            return true;
        }
        this.lastRepeatedMoveAt = now;
        return false;
    }

    public jumpToTop(): void {
        this.bindings.cursor.goToLine(1, "top");
    }

    public jumpToBottom(): void {
        this.bindings.cursor.goToLine(this.bindings.lineModel.totalLines, "bottom");
    }

    public jumpToNextFile(): void {
        this.jumpToNextFileStart();
    }

    public jumpToPreviousFile(): void {
        this.jumpToPreviousFileStart();
    }

    public jumpToNextAgent(): void {
        this.jumpToNextAgentPrompt();
    }

    /** Jumps cursor to the next hunk start line in the diff view. */
    public jumpToNextHunk(hunkLines: readonly number[]): void {
        if (hunkLines.length === 0 || this.bindings.lineModel.totalLines <= 0) { return; }
        const currentLine = this.bindings.cursor.cursorLine;
        // Find first hunk line greater than current cursor line
        const next = hunkLines.find((line) => line > currentLine);
        if (typeof next === "number") {
            this.bindings.cursor.goToLine(next, "auto");
        } else {
            // Wrap around to first hunk
            this.bindings.cursor.goToLine(hunkLines[0] ?? 1, "auto");
        }
    }

    /** Jumps cursor to the previous hunk start line in the diff view. */
    public jumpToPreviousHunk(hunkLines: readonly number[]): void {
        if (hunkLines.length === 0 || this.bindings.lineModel.totalLines <= 0) { return; }
        const currentLine = this.bindings.cursor.cursorLine;
        // Find the nearest hunk line that is before the current cursor line
        let prev: number | null = null;
        for (const line of hunkLines) {
            if (line >= currentLine) { break; }
            prev = line;
        }
        if (prev !== null) {
            this.bindings.cursor.goToLine(prev, "auto");
        } else {
            // Wrap around to last hunk
            const last = hunkLines[hunkLines.length - 1];
            if (typeof last === "number") {
                this.bindings.cursor.goToLine(last, "auto");
            }
        }
    }

    /** Moves cursor/camera to next file anchor and places divider near top band. */
    // ------------------------------------------
    // Private Helpers
    // ------------------------------------------

    private jumpToNextFileStart(): void {
        if (this.bindings.lineModel.totalLines <= 0) { return; }
        const currentAnchorIndex = this.bindings.lineModel.findCurrentFileAnchorIndex(
            this.bindings.cursor.cursorLine,
        );
        const target = this.bindings.lineModel.getFileAnchor(currentAnchorIndex + 1);
        if (!target) { return; }
        this.bindings.camera.placeDisplayRowAtMinVisibleHeight(
            this.bindings.getAnchorDividerDisplayRow(target),
            target.line,
        );
        this.bindings.cursor.goToLine(target.line, "keep");
    }

    /** Moves cursor/camera to current or previous file anchor depending on cursor line. */
    private jumpToPreviousFileStart(): void {
        if (this.bindings.lineModel.totalLines <= 0) { return; }
        const currentAnchorIndex = this.bindings.lineModel.findCurrentFileAnchorIndex(
            this.bindings.cursor.cursorLine,
        );
        const currentAnchor = this.bindings.lineModel.getFileAnchor(currentAnchorIndex);
        if (!currentAnchor) { return; }

        const target =
      this.bindings.cursor.cursorLine > currentAnchor.line
          ? currentAnchor
          : this.bindings.lineModel.getFileAnchor(currentAnchorIndex - 1);
        if (!target) { return; }

        this.bindings.camera.placeDisplayRowAtMinVisibleHeight(
            this.bindings.getAnchorDividerDisplayRow(target),
            target.line,
        );
        this.bindings.cursor.goToLine(target.line, "keep");
    }

    /** Jumps cursor to the next rendered agent prompt row with wrap-around. */
    private jumpToNextAgentPrompt(): void {
        if (this.bindings.lineModel.totalLines <= 0) { return; }
        const lines = this.bindings.getAgentPromptLines().sort((a, b) => a - b);
        if (lines.length === 0) { return; }

        const currentLine = this.bindings.cursor.cursorLine;
        const next = lines.find((line) => line > currentLine) ?? lines[0];
        if (typeof next !== "number") { return; }
        this.bindings.cursor.goToLine(next, "auto");
    }
}
