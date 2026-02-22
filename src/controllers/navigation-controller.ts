import type { KeyEvent } from "@opentui/core";
import { CameraController } from "../camera-controller";
import { CursorController } from "../cursor-controller";
import { LineModel } from "../line-model";

type NavigationBindings = {
  cursor: CursorController;
  camera: CameraController;
  lineModel: LineModel;
  getAgentPromptLines: () => number[];
  getAnchorDividerDisplayRow: (anchor: { filePath: string; dividerRow: number }) => number;
  onDeleteCurrentAgentPrompt: () => void;
};

type HandleResult = {
  handled: boolean;
};

export class NavigationController {
  private static readonly GG_CHORD_TIMEOUT_MS = 500;
  private static readonly REPEATED_MOVE_THROTTLE_MS = 14;

  private readonly bindings: NavigationBindings;
  private pendingGChordAt: number | null = null;
  private lastRepeatedMoveAt = 0;

  /** Creates navigation coordinator for vim-style movement and file jumps. */
  constructor(bindings: NavigationBindings) {
    this.bindings = bindings;
  }

  /** Clears pending multi-key chord state like `gg`. */
  public resetChordState(): void {
    this.pendingGChordAt = null;
  }

  /** Throttles repeated keypress bursts to avoid queued jump spikes. */
  public shouldThrottleRepeatedMove(key: KeyEvent): boolean {
    if (!key.repeated) return false;
    const now = Date.now();
    if (now - this.lastRepeatedMoveAt < NavigationController.REPEATED_MOVE_THROTTLE_MS) {
      return true;
    }
    this.lastRepeatedMoveAt = now;
    return false;
  }

  /** Handles vim navigation keys and dispatches cursor/file/agent jumps. */
  public handleVimNavigationKeypress(
    keyName: string,
    rawKeyName: string | undefined,
    key: KeyEvent,
    consumeKey: (event: KeyEvent) => void,
  ): HandleResult {
    const isShiftG = keyName === "g" && (Boolean(key.shift) || rawKeyName === "G");
    if (isShiftG) {
      consumeKey(key);
      this.pendingGChordAt = null;
      this.bindings.cursor.goToLine(this.bindings.lineModel.totalLines, "bottom");
      return { handled: true };
    }

    if (keyName === "g" && !key.shift) {
      consumeKey(key);
      const now = Date.now();
      if (
        this.pendingGChordAt !== null &&
        now - this.pendingGChordAt <= NavigationController.GG_CHORD_TIMEOUT_MS
      ) {
        this.pendingGChordAt = null;
        this.bindings.cursor.goToLine(1, "top");
      } else {
        this.pendingGChordAt = now;
      }
      return { handled: true };
    }

    if (keyName === "n") {
      consumeKey(key);
      this.pendingGChordAt = null;
      this.jumpToNextFileStart();
      return { handled: true };
    }

    if (keyName === "p") {
      consumeKey(key);
      this.pendingGChordAt = null;
      this.jumpToPreviousFileStart();
      return { handled: true };
    }

    if (keyName === "a") {
      consumeKey(key);
      this.pendingGChordAt = null;
      this.jumpToNextAgentPrompt();
      return { handled: true };
    }

    if (keyName === "x") {
      consumeKey(key);
      this.pendingGChordAt = null;
      this.bindings.onDeleteCurrentAgentPrompt();
      return { handled: true };
    }

    this.pendingGChordAt = null;
    return { handled: false };
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
