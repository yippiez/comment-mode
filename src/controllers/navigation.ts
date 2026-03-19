import { Camera } from "./camera";
import { Cursor } from "./cursor";
import { LineModel } from "../line-model";

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

    /** Throttles repeated keypress bursts to avoid queued jump spikes. */
    public shouldThrottleRepeatedMove(repeated: boolean): boolean {
        if (!repeated) return false;
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

    /** Moves cursor/camera to next file anchor and places divider near top band. */
    private jumpToNextFileStart(): void {
        if (this.bindings.lineModel.totalLines <= 0) return;
        const currentAnchorIndex = this.bindings.lineModel.findCurrentFileAnchorIndex(
            this.bindings.cursor.cursorLine,
        );
        const target = this.bindings.lineModel.getFileAnchor(currentAnchorIndex + 1);
        if (!target) return;
        this.bindings.camera.placeDisplayRowAtMinVisibleHeight(
            this.bindings.getAnchorDividerDisplayRow(target),
            target.line,
        );
        this.bindings.cursor.goToLine(target.line, "keep");
    }

    /** Moves cursor/camera to current or previous file anchor depending on cursor line. */
    private jumpToPreviousFileStart(): void {
        if (this.bindings.lineModel.totalLines <= 0) return;
        const currentAnchorIndex = this.bindings.lineModel.findCurrentFileAnchorIndex(
            this.bindings.cursor.cursorLine,
        );
        const currentAnchor = this.bindings.lineModel.getFileAnchor(currentAnchorIndex);
        if (!currentAnchor) return;

        const target =
      this.bindings.cursor.cursorLine > currentAnchor.line
          ? currentAnchor
          : this.bindings.lineModel.getFileAnchor(currentAnchorIndex - 1);
        if (!target) return;

        this.bindings.camera.placeDisplayRowAtMinVisibleHeight(
            this.bindings.getAnchorDividerDisplayRow(target),
            target.line,
        );
        this.bindings.cursor.goToLine(target.line, "keep");
    }

    /** Jumps cursor to the next rendered agent prompt row with wrap-around. */
    private jumpToNextAgentPrompt(): void {
        if (this.bindings.lineModel.totalLines <= 0) return;
        const lines = this.bindings.getAgentPromptLines().sort((a, b) => a - b);
        if (lines.length === 0) return;

        const currentLine = this.bindings.cursor.cursorLine;
        const next = lines.find((line) => line > currentLine) ?? lines[0];
        if (typeof next !== "number") return;
        this.bindings.cursor.goToLine(next, "auto");
    }
}

export { NavigationController as Navigation };
