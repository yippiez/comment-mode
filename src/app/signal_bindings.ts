import type { KeyEvent, PasteEvent } from "@opentui/core";
import type { PromptComposerField } from "./prompt-composer-bar";
import type { PromptSubmission } from "../controllers/prompt";
import { SIGNALS, emit, type SignalGroup } from "../signals";
import type { FocusMode } from "../types";
import { toPromptFieldDelta, toSignedUnit } from "../utils/guards";

const CODE_KEYMAP = {
  up: "move_up",
  k: "move_up",
  down: "move_down",
  j: "move_down",
  pageup: "page_up",
  pagedown: "page_down",
  v: "toggle_visual",
  c: "collapse_file",
  enter: "open_prompt",
  return: "open_prompt",
  escape: "escape_visual",
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
type PasteSource = EventSource<"paste", (event: PasteEvent) => void>;

type ScrollBarChangePayload = { position?: number } | undefined;
type VerticalScrollBarSource = EventSource<"change", (event: ScrollBarChangePayload) => void>;

type StdoutSource = EventSource<"resize", () => void>;
type FocusSource = EventSource<"focus", () => void>;
type ProcessSignalSource = {
  on?: (event: "SIGWINCH", handler: () => void) => unknown;
  off?: (event: "SIGWINCH", handler: () => void) => unknown;
  removeListener?: (event: "SIGWINCH", handler: () => void) => unknown;
};

export type KeyboardStateSnapshot = {
  groupNamePromptVisible: boolean;
  promptVisible: boolean;
  focusMode: FocusMode;
  promptField: PromptComposerField | null;
  shortcutsVisible: boolean;
};

const consumeKeyEvent = (key: KeyEvent): void => {
  key.preventDefault?.();
  key.stopPropagation?.();
};

const consumePasteEvent = (event: PasteEvent): void => {
  event.preventDefault?.();
  event.stopPropagation?.();
};

const isShortcutsToggleKey = (keyName: string, rawKeyName: string | undefined, key: KeyEvent): boolean =>
  keyName === "?" || rawKeyName === "?" || (keyName === "/" && Boolean(key.shift));

const isPromptPasteKey = (keyName: string, key: KeyEvent): boolean => keyName === "v" && key.ctrl;

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
  let pendingGChordAt: number | null = null;
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

    if (isPromptPasteKey(keyName, key)) {
      emit(SIGNALS.promptInputKey, key);
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

  const routeGroupNamePrompt = (keyName: string, key: KeyEvent): void => {
    if (keyName === "escape") {
      emitHandled(key, SIGNALS.groupsNameCancel);
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      emitHandled(key, SIGNALS.groupsNameSubmit);
      return;
    }

    emit(SIGNALS.groupsNameInputKey, key);
  };

  const routeCode = (keyName: string, rawKeyName: string | undefined, key: KeyEvent): void => {
    const now = Date.now();

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

    if (keyName === "e") {
      pendingGChordAt = null;
      emitHandled(key, SIGNALS.filesOpenInEditor);
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

    if (keyName === "backspace") {
      emitHandled(key, SIGNALS.filesParentDir);
      return;
    }

    if (mappedAction === "collapse_file") {
      emitHandled(key, SIGNALS.filesCollapseCurrent);
      return;
    }

  };

  const onKeypress = (key: KeyEvent): void => {
    const keyName = (key.name ?? "").toLowerCase();
    const rawKeyName = key.name;
    const state = getState();

    if (state.groupNamePromptVisible) {
      routeGroupNamePrompt(keyName, key);
      return;
    }

    if (state.promptVisible) {
      routePrompt(keyName, key);
      return;
    }

    if (isShortcutsToggleKey(keyName, rawKeyName, key)) {
      emitHandled(key, SIGNALS.shortcutsToggle);
      return;
    }

    if (state.shortcutsVisible) {
      if (keyName === "escape") {
        emitHandled(key, SIGNALS.shortcutsToggle);
        return;
      }
      if (keyName === "up") {
        emitHandled(key, SIGNALS.shortcutsScrollLines, -1);
        return;
      }
      if (keyName === "down") {
        emitHandled(key, SIGNALS.shortcutsScrollLines, 1);
        return;
      }
      if (keyName === "pageup") {
        emitHandled(key, SIGNALS.shortcutsScrollPages, -1);
        return;
      }
      if (keyName === "pagedown") {
        emitHandled(key, SIGNALS.shortcutsScrollPages, 1);
        return;
      }
      consumeKeyEvent(key);
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

    if (keyName === "r" && key.shift) {
      emitHandled(key, SIGNALS.workspaceChanged);
      return;
    }

    if (keyName === "r") {
      emitHandled(key, SIGNALS.filesResetVisibility);
      return;
    }

    if (keyName === "s") {
      emitHandled(key, SIGNALS.groupsSaveOrUpdate);
      return;
    }

    if (state.focusMode === "chips") {
      if (keyName === "x") {
        emitHandled(key, SIGNALS.groupsDeleteSelected);
        return;
      }

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

  const onPaste = (event: PasteEvent): void => {
    const pastedText = event.text;
    if (!pastedText) return;

    const state = getState();
    if (state.groupNamePromptVisible) {
      consumePasteEvent(event);
      emit(SIGNALS.groupsNameInputPaste, pastedText);
      return;
    }

    if (!state.promptVisible) return;

    consumePasteEvent(event);
    emit(SIGNALS.promptInputPaste, pastedText);
  };

  const cleanupFns: Array<() => void> = [subscribeToSource(source, "keypress", onKeypress)];
  cleanupFns.push(subscribeToSource(source as unknown as PasteSource, "paste", onPaste));

  return () => {
    for (const cleanup of cleanupFns.splice(0)) {
      cleanup();
    }
  };
}

export function registerScrollSignalBindings(source: VerticalScrollBarSource): () => void {
  const onChange = (event: ScrollBarChangePayload): void => {
    const position = event?.position;
    if (typeof position !== "number") return;
    emit(SIGNALS.scrollVertical, position);
  };

  return subscribeToSource(source, "change", onChange);
}

export function registerSystemSignalBindings(source: StdoutSource, focusSource?: FocusSource): () => void {
  const onResize = (): void => {
    emit(SIGNALS.systemStdoutResize);
  };

  const cleanupFns: Array<() => void> = [subscribeToSource(source, "resize", onResize)];

  if (focusSource) {
    const onFocus = (): void => {
      emit(SIGNALS.onFocus);
    };
    cleanupFns.push(subscribeToSource(focusSource, "focus", onFocus));
  }

  const cleanupBindings = (): void => {
    for (const cleanup of cleanupFns.splice(0)) {
      cleanup();
    }
  };

  const runtimeProcess = globalThis.process as ProcessSignalSource | undefined;

  if (typeof runtimeProcess?.on === "function") {
    runtimeProcess.on("SIGWINCH", onResize);
    return () => {
      cleanupBindings();
      if (typeof runtimeProcess.off === "function") {
        runtimeProcess.off("SIGWINCH", onResize);
        return;
      }
      if (typeof runtimeProcess.removeListener === "function") {
        runtimeProcess.removeListener("SIGWINCH", onResize);
      }
    };
  }

  return cleanupBindings;
}

type RegisterAppSignalHandlersOptions = {
  onSignal: (signalGroup: SignalGroup, handler: (...args: unknown[]) => void) => void;
  toggleShortcutsModal: () => void;
  scrollShortcutsModalByLines: (delta: number) => void;
  scrollShortcutsModalByPages: (delta: number) => void;
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
  toggleFilesExplorerMode: () => void;
  openFromCurrentSelection: () => void;
  openCurrentSelectionInEditor: () => void;
  enterCurrentDirectory: () => void;
  goToParentDirectory: () => void;
  toggleCurrentStructureCollapse: () => void;
  resetVisibilityState: () => void;
  saveOrUpdateSelectedGroup: () => void;
  deleteSelectedGroup: () => void;
  submitGroupName: () => void;
  cancelGroupName: () => void;
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
  handleGroupNameInputKey: (key: KeyEvent, consume: (event: KeyEvent) => void) => void;
  handleGroupNamePasteText: (text: string) => void;
  handlePromptInputKey: (key: KeyEvent, consume: (event: KeyEvent) => void) => void;
  handlePromptPasteText: (text: string) => void;
  handleExternalScroll: (position: number) => void;
  renderAll: () => void;
  renderChips: () => void;
  renderContent: () => void;
  applyLineHighlights: () => void;
  refreshPromptView: () => void;
  submitPromptToAgent: (submission: PromptSubmission) => Promise<void>;
};

export function registerAppSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  let pendingResizeRerender: ReturnType<typeof setTimeout> | undefined;
  let pendingResizeSettleRerender: ReturnType<typeof setTimeout> | undefined;

  options.onSignal(SIGNALS.shortcutsToggle, () => {
    options.toggleShortcutsModal();
  });

  options.onSignal(SIGNALS.shortcutsScrollLines, (...args) => {
    const delta = toSignedUnit(args[0]);
    if (delta === null) return;
    options.scrollShortcutsModalByLines(delta);
  });

  options.onSignal(SIGNALS.shortcutsScrollPages, (...args) => {
    const delta = toSignedUnit(args[0]);
    if (delta === null) return;
    options.scrollShortcutsModalByPages(delta);
  });

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
    const delta = toSignedUnit(args[0]);
    if (delta === null) return;
    options.moveChipSelection(delta);
  });

  options.onSignal(SIGNALS.chipsToggleSelected, () => {
    options.toggleSelectedChip();
  });

  options.onSignal(SIGNALS.cursorMove, (...args) => {
    const delta = toSignedUnit(args[0]);
    if (delta === null) return;
    const repeated = args[1] === true;
    if (options.shouldThrottleRepeatedMove(repeated)) {
      return;
    }
    options.moveCursorBy(delta);
  });

  options.onSignal(SIGNALS.cursorPage, (...args) => {
    const delta = toSignedUnit(args[0]);
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

  options.onSignal(SIGNALS.filesToggleExplorer, () => {
    options.toggleFilesExplorerMode();
  });

  options.onSignal(SIGNALS.filesEnterOrOpen, () => {
    options.openFromCurrentSelection();
  });

  options.onSignal(SIGNALS.filesOpenInEditor, () => {
    options.openCurrentSelectionInEditor();
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

  options.onSignal(SIGNALS.filesResetVisibility, () => {
    options.resetVisibilityState();
  });

  options.onSignal(SIGNALS.groupsSaveOrUpdate, () => {
    options.saveOrUpdateSelectedGroup();
  });

  options.onSignal(SIGNALS.groupsDeleteSelected, () => {
    options.deleteSelectedGroup();
  });

  options.onSignal(SIGNALS.groupsNameSubmit, () => {
    options.submitGroupName();
  });

  options.onSignal(SIGNALS.groupsNameCancel, () => {
    options.cancelGroupName();
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
    const delta = toPromptFieldDelta(args[0]);
    if (delta === null) return;
    options.cyclePromptField(delta);
  });

  options.onSignal(SIGNALS.promptModelCycle, (...args) => {
    const delta = toSignedUnit(args[0]);
    if (delta === null) return;
    options.cyclePromptModel(delta);
  });

  options.onSignal(SIGNALS.promptThinkingCycle, (...args) => {
    const delta = toSignedUnit(args[0]);
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

  options.onSignal(SIGNALS.promptInputPaste, (...args) => {
    const text = args[0];
    if (typeof text !== "string" || text.length === 0) return;
    options.handlePromptPasteText(text);
  });

  options.onSignal(SIGNALS.groupsNameInputKey, (...args) => {
    const key = args[0] as KeyEvent | undefined;
    if (!key) return;
    options.handleGroupNameInputKey(key, consumeKeyEvent);
  });

  options.onSignal(SIGNALS.groupsNameInputPaste, (...args) => {
    const text = args[0];
    if (typeof text !== "string" || text.length === 0) return;
    options.handleGroupNamePasteText(text);
  });

  options.onSignal(SIGNALS.scrollVertical, (...args) => {
    const position = args[0];
    if (typeof position !== "number") return;
    options.handleExternalScroll(position);
  });

  options.onSignal(SIGNALS.systemStdoutResize, () => {
    if (pendingResizeRerender) {
      clearTimeout(pendingResizeRerender);
    }
    if (pendingResizeSettleRerender) {
      clearTimeout(pendingResizeSettleRerender);
      pendingResizeSettleRerender = undefined;
    }

    pendingResizeRerender = setTimeout(() => {
      pendingResizeRerender = undefined;
      options.renderAll();

      pendingResizeSettleRerender = setTimeout(() => {
        pendingResizeSettleRerender = undefined;
        options.renderAll();
      }, 90);
    }, 40);
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
