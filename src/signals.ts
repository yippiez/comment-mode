
export interface SignalListener<Args extends unknown[]> {
    (...args: Args): void;
}

export interface SignalDispatcher<Args extends unknown[]> {
    (...args: Args): void;
}

export interface SignalSubscriber<Args extends unknown[]> {
    (listener: SignalListener<Args>): SignalUnsubscriber;
}

export interface SignalUnsubscriber {
    (): void;
}

export type Signal<Args extends unknown[]> = SignalSubscriber<Args> & SignalDispatcher<Args>;
export type SignalReturn = SignalUnsubscriber | void;

export function signalCreate<Args extends unknown[] = []>(): Signal<Args> {
    let subscribers: SignalListener<Args>[] = [];

    return ((...signalArgs: [SignalListener<Args>] | Args): SignalReturn => {
        if (signalArgs.length === 1 && typeof signalArgs[0] === "function") {
            const listener = signalArgs[0] as SignalListener<Args>;
            subscribers.push(listener);

            return () => {
                subscribers = subscribers.filter((l) => l !== listener);
            };
        }

        subscribers.forEach((listener) => listener(...(signalArgs as Args)));
    }) as Signal<Args>;
}

export const SIGNALS = {
  shortcutsToggle: signalCreate(),
  shortcutsScrollLines: signalCreate<[number]>(),
  shortcutsScrollPages: signalCreate<[number]>(),
  themeToggle: signalCreate(),
  focusToggleCodeChips: signalCreate(),
  appQuit: signalCreate(),
  chipsMove: signalCreate<[number]>(),
  chipsToggleSelected: signalCreate(),
  cursorMove: signalCreate<[number, boolean]>(),
  cursorPage: signalCreate<[number]>(),
  cursorChanged: signalCreate(),
  visualToggle: signalCreate(),
  visualExit: signalCreate(),
  filesToggleExplorer: signalCreate(),
  filesEnterOrOpen: signalCreate(),
  filesOpenInEditor: signalCreate(),
  filesEnterDirectory: signalCreate(),
  filesParentDir: signalCreate(),
  filesCollapseCurrent: signalCreate(),
  filesResetVisibility: signalCreate(),
  groupsSaveOrUpdate: signalCreate(),
  groupsDeleteSelected: signalCreate(),
  groupsNameSubmit: signalCreate(),
  groupsNameCancel: signalCreate(),
  navJumpTop: signalCreate(),
  navJumpBottom: signalCreate(),
  navJumpNextFile: signalCreate(),
  navJumpPrevFile: signalCreate(),
  navJumpNextAgent: signalCreate(),
  agentDeleteAtCursor: signalCreate(),
  promptClose: signalCreate(),
  promptSubmit: signalCreate(),
  promptFieldCycle: signalCreate<[number]>(),
  promptModelCycle: signalCreate<[number]>(),
  promptThinkingCycle: signalCreate<[number]>(),
  promptModelsRefresh: signalCreate(),
  promptFocusModeChange: signalCreate<[string]>(),
  promptSubmission: signalCreate<[any]>(),
  scrollVertical: signalCreate<[number]>(),
  systemStdoutResize: signalCreate(),
  onFocus: signalCreate(),
  workspaceChanged: signalCreate(),
  agentRenderRequested: signalCreate(),
} as const;
