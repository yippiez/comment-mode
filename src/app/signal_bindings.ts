import type { KeyEvent, PasteEvent } from "@opentui/core";
import type { PromptComposerField } from "./prompt-composer-bar";
import type { PromptSubmission } from "../controllers/prompt";
import { SIGNALS, emit, type SignalGroup } from "../signals";
import type { AppKeyInput, FocusMode } from "../types";

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

const toAppKeyInput = (key: KeyEvent): AppKeyInput => ({
  name: key.name,
  ctrl: key.ctrl,
  meta: key.meta,
  shift: key.shift,
  option: key.option,
  sequence: key.sequence,
  number: key.number,
  raw: key.raw,
  eventType: key.eventType,
  source: key.source,
  code: key.code,
  super: key.super,
  hyper: key.hyper,
  capsLock: key.capsLock,
  numLock: key.numLock,
  baseCode: key.baseCode,
  repeated: key.repeated,
});

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

type KeyboardSignalBindingsOptions = {
  getState: () => KeyboardStateSnapshot;
  handleGroupNameInputKey: (key: AppKeyInput) => boolean;
  handleGroupNamePasteText: (text: string) => void;
  handlePromptInputKey: (key: AppKeyInput) => boolean;
  handlePromptPasteText: (text: string) => void;
};

export function registerKeyboardSignalBindings(
  source: KeypressSource,
  options: KeyboardSignalBindingsOptions,
): () => void {
  let pendingGChordAt: number | null = null;
  const gChordTimeoutMs = 500;

  const emitHandled = <Args extends unknown[]>(
    key: KeyEvent,
    signalGroup: SignalGroup<Args>,
    ...args: Args
  ): void => {
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

    const { promptField } = options.getState();
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

    const handled = options.handlePromptInputKey(toAppKeyInput(key));
    if (handled) {
      consumeKeyEvent(key);
    }
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

    const handled = options.handleGroupNameInputKey(toAppKeyInput(key));
    if (handled) {
      consumeKeyEvent(key);
    }
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
    const state = options.getState();

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

    const state = options.getState();
    if (state.groupNamePromptVisible) {
      consumePasteEvent(event);
      options.handleGroupNamePasteText(pastedText);
      return;
    }

    if (!state.promptVisible) return;

    consumePasteEvent(event);
    options.handlePromptPasteText(pastedText);
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
  onSignal: <Args extends unknown[]>(
    signalGroup: SignalGroup<Args>,
    handler: (...args: Args) => void,
  ) => void;
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
  handleExternalScroll: (position: number) => void;
  renderAll: () => void;
  renderChips: () => void;
  renderContent: () => void;
  applyLineHighlights: () => void;
  refreshPromptView: () => void;
  submitPromptToAgent: (submission: PromptSubmission) => Promise<void>;
};

export function registerAppSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  const resizeState: ResizeRerenderState = {};

  registerShortcutSignalHandlers(options);
  registerChromeSignalHandlers(options);
  registerChipSignalHandlers(options);
  registerCursorSignalHandlers(options);
  registerFileAndVisualSignalHandlers(options);
  registerGroupSignalHandlers(options);
  registerNavigationSignalHandlers(options);
  registerPromptSignalHandlers(options);
  registerScrollSignalHandlers(options);
  registerViewportSignalHandlers(options, resizeState);
  registerRenderSignalHandlers(options);
}

type ResizeRerenderState = {
  pendingResizeRerender?: ReturnType<typeof setTimeout>;
  pendingResizeSettleRerender?: ReturnType<typeof setTimeout>;
};

function registerShortcutSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  options.onSignal(SIGNALS.shortcutsToggle, () => {
    options.toggleShortcutsModal();
  });

  options.onSignal(SIGNALS.shortcutsScrollLines, (delta) => {
    options.scrollShortcutsModalByLines(delta);
  });

  options.onSignal(SIGNALS.shortcutsScrollPages, (delta) => {
    options.scrollShortcutsModalByPages(delta);
  });
}

function registerChromeSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  options.onSignal(SIGNALS.themeToggle, () => {
    options.toggleTheme();
  });

  options.onSignal(SIGNALS.focusToggleCodeChips, () => {
    options.setFocusMode(options.getFocusMode() === "chips" ? "code" : "chips");
  });

  options.onSignal(SIGNALS.appQuit, () => {
    options.destroyRenderer();
  });
}

function registerChipSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  options.onSignal(SIGNALS.chipsMove, (delta) => {
    options.moveChipSelection(delta);
  });

  options.onSignal(SIGNALS.chipsToggleSelected, () => {
    options.toggleSelectedChip();
  });
}

function registerCursorSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  options.onSignal(SIGNALS.cursorMove, (delta, repeated) => {
    if (options.shouldThrottleRepeatedMove(repeated)) {
      return;
    }
    options.moveCursorBy(delta);
  });

  options.onSignal(SIGNALS.cursorPage, (delta) => {
    options.moveCursorBy(options.getCursorPageStep() * delta);
    if (delta < 0) {
      options.goCursorToMinVisibleHeight();
      return;
    }
    options.goCursorToMaxVisibleHeight();
  });
}

function registerFileAndVisualSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
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
}

function registerGroupSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
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
}

function registerNavigationSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
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
}

function registerPromptSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
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

  options.onSignal(SIGNALS.promptFieldCycle, (delta) => {
    options.cyclePromptField(delta);
  });

  options.onSignal(SIGNALS.promptModelCycle, (delta) => {
    options.cyclePromptModel(delta);
  });

  options.onSignal(SIGNALS.promptThinkingCycle, (delta) => {
    options.cyclePromptThinkingLevel(delta);
  });

  options.onSignal(SIGNALS.promptModelsRefresh, () => {
    options.refreshPromptModels();
  });

  options.onSignal(SIGNALS.promptFocusModeChange, (focusMode) => {
    options.setFocusMode(focusMode);
  });

  options.onSignal(SIGNALS.promptSubmission, (submission) => {
    void options.submitPromptToAgent(submission).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[app] prompt submission failed: ${message}`);
    });
  });
}

function registerScrollSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  options.onSignal(SIGNALS.scrollVertical, (position) => {
    options.handleExternalScroll(position);
  });
}

function registerViewportSignalHandlers(
  options: RegisterAppSignalHandlersOptions,
  resizeState: ResizeRerenderState,
): void {
  options.onSignal(SIGNALS.systemStdoutResize, () => {
    if (resizeState.pendingResizeRerender) {
      clearTimeout(resizeState.pendingResizeRerender);
    }
    if (resizeState.pendingResizeSettleRerender) {
      clearTimeout(resizeState.pendingResizeSettleRerender);
      resizeState.pendingResizeSettleRerender = undefined;
    }

    resizeState.pendingResizeRerender = setTimeout(() => {
      resizeState.pendingResizeRerender = undefined;
      options.renderAll();

      resizeState.pendingResizeSettleRerender = setTimeout(() => {
        resizeState.pendingResizeSettleRerender = undefined;
        options.renderAll();
      }, 90);
    }, 40);
  });
}

function registerRenderSignalHandlers(options: RegisterAppSignalHandlersOptions): void {
  options.onSignal(SIGNALS.cursorChanged, () => {
    options.applyLineHighlights();
    if (options.isPromptVisible()) {
      options.refreshPromptView();
    }
  });

  options.onSignal(SIGNALS.agentRenderRequested, () => {
    options.renderContent();
  });
}
