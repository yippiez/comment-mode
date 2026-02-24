type SignalHandler = (...args: unknown[]) => void;

type SignalRegistration = {
  signalKey: string;
};

const TOKEN_PATTERN = /^[a-z][a-z0-9_-]*$/;

function assertValidSignalToken(value: string, tokenName: "group" | "subgroup"): asserts value is string {
  if (value.length === 0) {
    throw new Error(`Signal ${tokenName} cannot be empty.`);
  }
  if (!TOKEN_PATTERN.test(value)) {
    throw new Error(
      `Invalid signal ${tokenName} "${value}". Use lowercase letters, digits, underscore, or hyphen and start with a letter.`,
    );
  }
}

export class SignalGroup {
  public readonly group: string;
  public readonly subgroup: string;

  constructor(group: string, subgroup: string) {
    assertValidSignalToken(group, "group");
    assertValidSignalToken(subgroup, "subgroup");
    this.group = group;
    this.subgroup = subgroup;
  }

  public toStr(): string {
    return `${this.group}:${this.subgroup}`;
  }

  public static fromStr(raw: string): SignalGroup {
    const trimmed = raw.trim();
    const parts = trimmed.split(":");
    if (parts.length !== 2) {
      throw new Error(`Invalid signal group "${raw}". Expected format "group:subgroup".`);
    }

    const group = parts[0] ?? "";
    const subgroup = parts[1] ?? "";
    assertValidSignalToken(group, "group");
    assertValidSignalToken(subgroup, "subgroup");
    return new SignalGroup(group, subgroup);
  }
}

const registrationsBySignal = new Map<string, Map<string, SignalHandler>>();
const registrationById = new Map<string, SignalRegistration>();

export function register(signalGroup: SignalGroup, handler: SignalHandler): string {
  const signalKey = signalGroup.toStr();
  const registrationId = crypto.randomUUID();
  let listeners = registrationsBySignal.get(signalKey);
  if (!listeners) {
    listeners = new Map();
    registrationsBySignal.set(signalKey, listeners);
  }
  listeners.set(registrationId, handler);
  registrationById.set(registrationId, {
    signalKey,
  });
  return registrationId;
}

export function emit(signalGroup: SignalGroup, ...args: unknown[]): void {
  const signalKey = signalGroup.toStr();
  const listeners = registrationsBySignal.get(signalKey);
  if (!listeners || listeners.size === 0) return;

  const activeHandlers = [...listeners.values()];
  for (const handler of activeHandlers) {
    try {
      handler(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[signals] handler failed for ${signalKey}: ${message}`);
    }
  }
}

export function deregister(registrationId: string): boolean {
  const registration = registrationById.get(registrationId);
  if (!registration) return false;

  const listeners = registrationsBySignal.get(registration.signalKey);
  if (listeners) {
    listeners.delete(registrationId);
    if (listeners.size === 0) {
      registrationsBySignal.delete(registration.signalKey);
    }
  }

  registrationById.delete(registrationId);
  return true;
}

export const SIGNALS = {
  appQuit: SignalGroup.fromStr("app:quit"),
  themeToggle: SignalGroup.fromStr("theme:toggle"),
  focusToggleCodeChips: SignalGroup.fromStr("focus:toggle_code_chips"),
  chipsMove: SignalGroup.fromStr("chips:move"),
  chipsToggleSelected: SignalGroup.fromStr("chips:toggle_selected"),
  cursorMove: SignalGroup.fromStr("cursor:move"),
  cursorPage: SignalGroup.fromStr("cursor:page"),
  cursorChanged: SignalGroup.fromStr("cursor:changed"),
  visualToggle: SignalGroup.fromStr("visual:toggle"),
  visualExit: SignalGroup.fromStr("visual:exit"),
  selectionYank: SignalGroup.fromStr("selection:yank"),
  filesToggleExplorer: SignalGroup.fromStr("files:toggle_explorer"),
  filesEnterOrOpen: SignalGroup.fromStr("files:enter_or_open"),
  filesEnterDirectory: SignalGroup.fromStr("files:enter_directory"),
  filesParentDir: SignalGroup.fromStr("files:parent_dir"),
  filesCollapseCurrent: SignalGroup.fromStr("files:collapse_current"),
  navJumpTop: SignalGroup.fromStr("nav:jump_top"),
  navJumpBottom: SignalGroup.fromStr("nav:jump_bottom"),
  navJumpNextFile: SignalGroup.fromStr("nav:jump_next_file"),
  navJumpPrevFile: SignalGroup.fromStr("nav:jump_prev_file"),
  navJumpNextAgent: SignalGroup.fromStr("nav:jump_next_agent"),
  agentDeleteAtCursor: SignalGroup.fromStr("agent:delete_at_cursor"),
  promptClose: SignalGroup.fromStr("prompt:close"),
  promptSubmit: SignalGroup.fromStr("prompt:submit"),
  promptFieldCycle: SignalGroup.fromStr("prompt:field_cycle"),
  promptModelCycle: SignalGroup.fromStr("prompt:model_cycle"),
  promptThinkingCycle: SignalGroup.fromStr("prompt:thinking_cycle"),
  promptModelsRefresh: SignalGroup.fromStr("prompt:models_refresh"),
  promptInputKey: SignalGroup.fromStr("prompt:input_key"),
  promptSubmission: SignalGroup.fromStr("prompt:submission"),
  promptFocusModeChange: SignalGroup.fromStr("prompt:focus_mode_change"),
  agentRenderRequested: SignalGroup.fromStr("agent:render_requested"),
  scrollVertical: SignalGroup.fromStr("scroll:vertical"),
  systemStdoutResize: SignalGroup.fromStr("system:stdout_resize"),
  workspaceChanged: SignalGroup.fromStr("workspace:changed"),
} as const;
