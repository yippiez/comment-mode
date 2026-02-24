import type { KeyEvent } from "@opentui/core";
import type { PromptSubmission } from "../controllers/prompt";
import { SIGNALS, type SignalGroup } from "../signals";
import type { FocusMode } from "../types";

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
  consumeKey: (key: KeyEvent) => void;
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
    options.handlePromptInputKey(key, (event) => options.consumeKey(event));
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
