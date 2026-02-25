import type { KeyEvent } from "@opentui/core";
import type { PromptComposerField } from "../components/prompt-composer-bar";
import type { PromptSubmission } from "../controllers/prompt";
import { SIGNALS, emit, type SignalGroup } from "../signals";
import type { FocusMode } from "../types";

const CODE_KEYMAP = {
  up: "move_up",
  k: "move_up",
  down: "move_down",
  j: "move_down",
  pageup: "page_up",
  pagedown: "page_down",
  v: "toggle_visual",
  c: "collapse_file",
  y: "yank_selection",
  enter: "open_prompt",
  return: "open_prompt",
  escape: "escape_visual",
  q: "quit",
} as const;

const CHIPS_KEYMAP = {
  left: "move_left",
  right: "move_right",
  space: "toggle_chip",
  enter: "toggle_chip",
  return: "toggle_chip",
} as const;

type EventSource<EventName extends string, Handler extends (...args: any[]) => void> = {
  on: (event: EventName, handler: Handler) => unknown;
  off?: (event: EventName, handler: Handler) => unknown;
  removeListener?: (event: EventName, handler: Handler) => unknown;
};

type KeypressSource = EventSource<"keypress", (key: KeyEvent) => void>;

type ScrollBarChangePayload = { position?: number } | undefined;
type VerticalScrollBarSource = EventSource<"change", (event: ScrollBarChangePayload) => void>;

type StdoutSource = EventSource<"resize", () => void>;

export type KeyboardStateSnapshot = {
  promptVisible: boolean;
  focusMode: FocusMode;
  viewMode: "code" | "files";
  promptField: PromptComposerField | null;
};

const consumeKeyEvent = (key: KeyEvent): void => {
  key.preventDefault?.();
  key.stopPropagation?.();
};

function subscribeToSource<EventName extends string, Handler extends (...args: any[]) => void>(
  source: EventSource<EventName, Handler>,
  eventName: EventName,
  handler: Handler,
): () => void {
  source.on(eventName, handler);
  return () => {
    if (typeof source.off === "function") {
      source.off(eventName, handler);
      return;
    }
    if (typeof source.removeListener === "function") {
      source.removeListener(eventName, handler);
    }
  };
}

export function registerKeyboardSignalBindings(
  source: KeypressSource,
  getState: () => KeyboardStateSnapshot,
): () => void {
  let pendingLeaderAt: number | null = null;
  let pendingGChordAt: number | null = null;
  const leaderTimeoutMs = 500;
  const gChordTimeoutMs = 500;

  const emitHandled = (key: KeyEvent, signalGroup: SignalGroup, ...args: unknown[]): void => {
    consumeKeyEvent(key);
    emit(signalGroup, ...args);
  };

  const routePrompt = (keyName: string, key: KeyEvent): void => {
    if (keyName === "escape") {
      emitHandled(key, SIGNALS.promptClose);
      return;
    }

    if (keyName === "tab") {
      emitHandled(key, SIGNALS.promptFieldCycle, 1);
      return;
    }

    const { promptField } = getState();
    if (promptField === "model") {
      if (keyName === "left" || keyName === "up") {
        emitHandled(key, SIGNALS.promptModelCycle, -1);
        return;
      }
      if (keyName === "right" || keyName === "down") {
        emitHandled(key, SIGNALS.promptModelCycle, 1);
        return;
      }
      if (keyName === "r") {
        emitHandled(key, SIGNALS.promptModelsRefresh);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        emitHandled(key, SIGNALS.promptFieldCycle, 1);
      }
      return;
    }

    if (promptField === "thinking") {
      if (keyName === "left" || keyName === "up") {
        emitHandled(key, SIGNALS.promptThinkingCycle, -1);
        return;
      }
      if (keyName === "right" || keyName === "down") {
        emitHandled(key, SIGNALS.promptThinkingCycle, 1);
        return;
      }
      if (keyName === "return" || keyName === "enter") {
        emitHandled(key, SIGNALS.promptFieldCycle, -2);
        return;
      }
    }

    if (keyName === "return" || keyName === "enter") {
      emitHandled(key, SIGNALS.promptSubmit);
      return;
    }

    emit(SIGNALS.promptInputKey, key);
  };

  const routeCode = (keyName: string, rawKeyName: string | undefined, key: KeyEvent): void => {
    const now = Date.now();
    const leaderActive = pendingLeaderAt !== null && now - pendingLeaderAt <= leaderTimeoutMs;
    if (leaderActive && keyName === "o") {
      pendingLeaderAt = null;
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.filesToggleExplorer);
      return;
    }

    const { viewMode } = getState();
    if (keyName === "space" && viewMode !== "files") {
      pendingLeaderAt = now;
      return;
    }

    if (keyName === "o" && viewMode === "files") {
      pendingLeaderAt = null;
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.filesToggleExplorer);
      return;
    }

    pendingLeaderAt = null;

    const mappedAction = CODE_KEYMAP[keyName as keyof typeof CODE_KEYMAP];
    if (mappedAction === "escape_visual") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.visualExit);
      return;
    }

    const isShiftG = keyName === "g" && (Boolean(key.shift) || rawKeyName === "G");
    if (isShiftG) {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.navJumpBottom);
      return;
    }

    if (keyName === "g" && !key.shift) {
      if (pendingGChordAt !== null && now - pendingGChordAt <= gChordTimeoutMs) {
        pendingGChordAt = null;
        emitHandled(key, SIGNALS.navJumpTop);
      } else {
        pendingGChordAt = now;
      }
      return;
    }

    if (keyName === "n") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.navJumpNextFile);
      return;
    }

    if (keyName === "p") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.navJumpPrevFile);
      return;
    }

    if (keyName === "a") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.navJumpNextAgent);
      return;
    }

    if (keyName === "x") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.agentDeleteAtCursor);
      return;
    }

    pendingGChordAt = null;

    if (mappedAction === "open_prompt") {
      emitHandled(key, SIGNALS.filesEnterOrOpen);
      return;
    }

    if (mappedAction === "move_up") {
      emitHandled(key, SIGNALS.cursorMove, -1, Boolean(key.repeated));
      return;
    }

    if (mappedAction === "move_down") {
      emitHandled(key, SIGNALS.cursorMove, 1, Boolean(key.repeated));
      return;
    }

    if (mappedAction === "page_up") {
      emitHandled(key, SIGNALS.cursorPage, -1);
      return;
    }

    if (mappedAction === "page_down") {
      emitHandled(key, SIGNALS.cursorPage, 1);
      return;
    }

    if (mappedAction === "toggle_visual") {
      emitHandled(key, SIGNALS.visualToggle);
      return;
    }

    if (mappedAction === "yank_selection") {
      emitHandled(key, SIGNALS.selectionYank);
      return;
    }

    if (keyName === "space" && viewMode === "files") {
      emitHandled(key, SIGNALS.filesEnterDirectory);
      return;
    }

    if (keyName === "backspace" && viewMode === "files") {
      emitHandled(key, SIGNALS.filesParentDir);
      return;
    }

    if (mappedAction === "collapse_file") {
      emitHandled(key, SIGNALS.filesCollapseCurrent);
      return;
    }

    if (mappedAction === "quit") {
      emitHandled(key, SIGNALS.appQuit);
    }
  };

  const onKeypress = (key: KeyEvent): void => {
    const keyName = (key.name ?? "").toLowerCase();
    const rawKeyName = key.name;
    const state = getState();

    if (state.promptVisible) {
      routePrompt(keyName, key);
      return;
    }

    if (keyName === "t") {
      emitHandled(key, SIGNALS.themeToggle);
      return;
    }

    if (keyName === "tab") {
      emitHandled(key, SIGNALS.focusToggleCodeChips);
      return;
    }

    if (state.focusMode === "chips") {
      const action = CHIPS_KEYMAP[keyName as keyof typeof CHIPS_KEYMAP];
      if (action === "move_left") {
        emitHandled(key, SIGNALS.chipsMove, -1);
        return;
      }
      if (action === "move_right") {
        emitHandled(key, SIGNALS.chipsMove, 1);
        return;
      }
      if (action === "toggle_chip") {
        emitHandled(key, SIGNALS.chipsToggleSelected);
      }
      return;
    }

    routeCode(keyName, rawKeyName, key);
  };

  return subscribeToSource(source, "keypress", onKeypress);
}

export function registerScrollSignalBindings(source: VerticalScrollBarSource): () => void {
  const onChange = (event: ScrollBarChangePayload): void => {
    const position = event?.position;
    if (typeof position !== "number") return;
    emit(SIGNALS.scrollVertical, position);
  };

  return subscribeToSource(source, "change", onChange);
}

export function registerSystemSignalBindings(source: StdoutSource): () => void {
  const onResize = (): void => {
    emit(SIGNALS.systemStdoutResize);
  };

  return subscribeToSource(source, "resize", onResize);
}

type RegisterAppSignalHandlersOptions = {
  onSignal: (signalGroup: SignalGroup, handler: (...args: unknown[]) => void) => void;
  toggleTheme: () => void;
  getFocusMode: () => FocusMode;
  setFocusMode: (mode: FocusMode) => void;
  destroyRenderer: () => void;
  moveChipSelection: (delta: number) => void;
  toggleSelectedChip: () => void;
  shouldThrottleRepeatedMove: (repeated: boolean) => boolean;
  moveCursorBy: (delta: number) => void;
  getCursorPageStep: () => number;
  goCursorToMinVisibleHeight: () => void;
  goCursorToMaxVisibleHeight: () => void;
  toggleVisualMode: () => void;
  disableVisualMode: () => void;
  copySelectionToClipboard: () => Promise<void>;
  toggleFilesExplorerMode: () => void;
  openFromCurrentSelection: () => void;
  enterCurrentDirectory: () => void;
  goToParentDirectory: () => void;
  toggleCurrentStructureCollapse: () => void;
  jumpToTop: () => void;
  jumpToBottom: () => void;
  jumpToNextFile: () => void;
  jumpToPreviousFile: () => void;
  jumpToNextAgent: () => void;
  deleteCurrentAgentPrompt: () => void;
  closePrompt: () => void;
  isPromptVisible: () => boolean;
  submitPromptFromKeyboard: () => void;
  cyclePromptField: (delta: -2 | -1 | 1) => void;
  cyclePromptModel: (delta: -1 | 1) => void;
  cyclePromptThinkingLevel: (delta: -1 | 1) => void;
  refreshPromptModels: () => void;
  handlePromptInputKey: (key: KeyEvent, consume: (event: KeyEvent) => void) => void;
  handleExternalScroll: (position: number) => void;
  renderContent: () => void;
  applyLineHighlights: () => void;
  refreshPromptView: () => void;
  submitPromptToAgent: (submission: PromptSubmission) => Promise<void>;
};

const asSignedUnit = (value: unknown): -1 | 1 | null => {
  if (value === -1 || value === 1) {
    return value;
  }
  return null;
};

const asPromptFieldDelta = (value: unknown): -2 | -1 | 1 | null => {
  if (value === -2 || value === -1 || value === 1) {
    return value;
  }
  return null;
};

export function registerAppSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  options.onSignal(SIGNALS.themeToggle, () => {
    options.toggleTheme();
  });

  options.onSignal(SIGNALS.focusToggleCodeChips, () => {
    options.setFocusMode(options.getFocusMode() === "chips" ? "code" : "chips");
  });

  options.onSignal(SIGNALS.appQuit, () => {
    options.destroyRenderer();
  });

  options.onSignal(SIGNALS.chipsMove, (...args) => {
    const delta = asSignedUnit(args[0]);
    if (delta === null) return;
    options.moveChipSelection(delta);
  });

  options.onSignal(SIGNALS.chipsToggleSelected, () => {
    options.toggleSelectedChip();
  });

  options.onSignal(SIGNALS.cursorMove, (...args) => {
    const delta = asSignedUnit(args[0]);
    if (delta === null) return;
    const repeated = args[1] === true;
    if (options.shouldThrottleRepeatedMove(repeated)) {
      return;
    }
    options.moveCursorBy(delta);
  });

  options.onSignal(SIGNALS.cursorPage, (...args) => {
    const delta = asSignedUnit(args[0]);
    if (delta === null) return;
    options.moveCursorBy(options.getCursorPageStep() * delta);
    if (delta < 0) {
      options.goCursorToMinVisibleHeight();
      return;
    }
    options.goCursorToMaxVisibleHeight();
  });

  options.onSignal(SIGNALS.visualToggle, () => {
    options.toggleVisualMode();
  });

  options.onSignal(SIGNALS.visualExit, () => {
    options.disableVisualMode();
  });

  options.onSignal(SIGNALS.selectionYank, () => {
    void options.copySelectionToClipboard();
  });

  options.onSignal(SIGNALS.filesToggleExplorer, () => {
    options.toggleFilesExplorerMode();
  });

  options.onSignal(SIGNALS.filesEnterOrOpen, () => {
    options.openFromCurrentSelection();
  });

  options.onSignal(SIGNALS.filesEnterDirectory, () => {
    options.enterCurrentDirectory();
  });

  options.onSignal(SIGNALS.filesParentDir, () => {
    options.goToParentDirectory();
  });

  options.onSignal(SIGNALS.filesCollapseCurrent, () => {
    options.toggleCurrentStructureCollapse();
  });

  options.onSignal(SIGNALS.navJumpTop, () => {
    options.jumpToTop();
  });

  options.onSignal(SIGNALS.navJumpBottom, () => {
    options.jumpToBottom();
  });

  options.onSignal(SIGNALS.navJumpNextFile, () => {
    options.jumpToNextFile();
  });

  options.onSignal(SIGNALS.navJumpPrevFile, () => {
    options.jumpToPreviousFile();
  });

  options.onSignal(SIGNALS.navJumpNextAgent, () => {
    options.jumpToNextAgent();
  });

  options.onSignal(SIGNALS.agentDeleteAtCursor, () => {
    options.deleteCurrentAgentPrompt();
  });

  options.onSignal(SIGNALS.promptClose, () => {
    options.closePrompt();
  });

  options.onSignal(SIGNALS.promptSubmit, () => {
    if (options.isPromptVisible()) {
      options.submitPromptFromKeyboard();
      return;
    }
    options.openFromCurrentSelection();
  });

  options.onSignal(SIGNALS.promptFieldCycle, (...args) => {
    const delta = asPromptFieldDelta(args[0]);
    if (delta === null) return;
    options.cyclePromptField(delta);
  });

  options.onSignal(SIGNALS.promptModelCycle, (...args) => {
    const delta = asSignedUnit(args[0]);
    if (delta === null) return;
    options.cyclePromptModel(delta);
  });

  options.onSignal(SIGNALS.promptThinkingCycle, (...args) => {
    const delta = asSignedUnit(args[0]);
    if (delta === null) return;
    options.cyclePromptThinkingLevel(delta);
  });

  options.onSignal(SIGNALS.promptModelsRefresh, () => {
    options.refreshPromptModels();
  });

  options.onSignal(SIGNALS.promptInputKey, (...args) => {
    const key = args[0] as KeyEvent | undefined;
    if (!key) return;
    options.handlePromptInputKey(key, consumeKeyEvent);
  });

  options.onSignal(SIGNALS.scrollVertical, (...args) => {
    const position = args[0];
    if (typeof position !== "number") return;
    options.handleExternalScroll(position);
  });

  options.onSignal(SIGNALS.systemStdoutResize, () => {
    options.renderContent();
  });

  options.onSignal(SIGNALS.cursorChanged, () => {
    options.applyLineHighlights();
    if (options.isPromptVisible()) {
      options.refreshPromptView();
    }
  });

  options.onSignal(SIGNALS.promptFocusModeChange, (...args) => {
    const focusMode = args[0];
    if (focusMode !== "code" && focusMode !== "prompt") return;
    options.setFocusMode(focusMode);
  });

  options.onSignal(SIGNALS.promptSubmission, (...args) => {
    const submission = args[0] as PromptSubmission | undefined;
    if (!submission) return;
    void options.submitPromptToAgent(submission).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[app] prompt submission failed: ${message}`);
    });
  });

  options.onSignal(SIGNALS.agentRenderRequested, () => {
    options.renderContent();
  });
}
