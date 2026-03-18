import type { PromptSubmission } from "./controllers/prompt";
import type { FocusMode } from "./types";

type SignalArgs = unknown[];
type PromptFocusMode = Extract<FocusMode, "code" | "prompt">;

export type AppSignalMap = {
  appQuit: [];
  shortcutsToggle: [];
  shortcutsScrollLines: [delta: -1 | 1];
  shortcutsScrollPages: [delta: -1 | 1];
  themeToggle: [];
  focusToggleCodeChips: [];
  chipsMove: [delta: -1 | 1];
  chipsToggleSelected: [];
  cursorMove: [delta: -1 | 1, repeated: boolean];
  cursorPage: [delta: -1 | 1];
  cursorChanged: [];
  visualToggle: [];
  visualExit: [];
  filesToggleExplorer: [];
  filesEnterOrOpen: [];
  filesOpenInEditor: [];
  filesEnterDirectory: [];
  filesParentDir: [];
  filesCollapseCurrent: [];
  filesResetVisibility: [];
  groupsSaveOrUpdate: [];
  groupsDeleteSelected: [];
  groupsNameSubmit: [];
  groupsNameCancel: [];
  navJumpTop: [];
  navJumpBottom: [];
  navJumpNextFile: [];
  navJumpPrevFile: [];
  navJumpNextAgent: [];
  agentDeleteAtCursor: [];
  promptClose: [];
  promptSubmit: [];
  promptFieldCycle: [delta: -2 | -1 | 1];
  promptModelCycle: [delta: -1 | 1];
  promptThinkingCycle: [delta: -1 | 1];
  promptModelsRefresh: [];
  promptSubmission: [submission: PromptSubmission];
  promptFocusModeChange: [focusMode: PromptFocusMode];
  agentRenderRequested: [];
  scrollVertical: [position: number];
  systemStdoutResize: [];
  onFocus: [];
  workspaceChanged: [];
};

export type SignalHandler<Args extends SignalArgs = []> = (...args: Args) => void;

type SignalRegistration = {
  signalKey: string;
};

type RegisteredSignalHandler = SignalHandler<SignalArgs>;

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

export class SignalGroup<Args extends SignalArgs = []> {
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

  public static fromStr<Args extends SignalArgs = []>(raw: string): SignalGroup<Args> {
    const trimmed = raw.trim();
    const parts = trimmed.split(":");
    if (parts.length !== 2) {
      throw new Error(`Invalid signal group "${raw}". Expected format "group:subgroup".`);
    }

    const group = parts[0] ?? "";
    const subgroup = parts[1] ?? "";
    assertValidSignalToken(group, "group");
    assertValidSignalToken(subgroup, "subgroup");
    return new SignalGroup<Args>(group, subgroup);
  }
}

function createSignal<Args extends SignalArgs = []>(raw: string): SignalGroup<Args> {
  return SignalGroup.fromStr<Args>(raw);
}

const registrationsBySignal = new Map<string, Map<string, RegisteredSignalHandler>>();
const registrationById = new Map<string, SignalRegistration>();

export function register<Args extends SignalArgs>(
  signalGroup: SignalGroup<Args>,
  handler: SignalHandler<Args>,
): string {
  const signalKey = signalGroup.toStr();
  const registrationId = crypto.randomUUID();
  let listeners = registrationsBySignal.get(signalKey);
  if (!listeners) {
    listeners = new Map();
    registrationsBySignal.set(signalKey, listeners);
  }
  listeners.set(registrationId, handler as RegisteredSignalHandler);
  registrationById.set(registrationId, {
    signalKey,
  });
  return registrationId;
}

export function emit<Args extends SignalArgs>(signalGroup: SignalGroup<Args>, ...args: Args): void {
  const signalKey = signalGroup.toStr();
  const listeners = registrationsBySignal.get(signalKey);
  if (!listeners || listeners.size === 0) return;

  const activeHandlers = [...listeners.values()] as SignalHandler<Args>[];
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

export const SIGNALS: { [K in keyof AppSignalMap]: SignalGroup<AppSignalMap[K]> } = {
  appQuit: createSignal("app:quit"),
  shortcutsToggle: createSignal("shortcuts:toggle"),
  shortcutsScrollLines: createSignal("shortcuts:scroll_lines"),
  shortcutsScrollPages: createSignal("shortcuts:scroll_pages"),
  themeToggle: createSignal("theme:toggle"),
  focusToggleCodeChips: createSignal("focus:toggle_code_chips"),
  chipsMove: createSignal("chips:move"),
  chipsToggleSelected: createSignal("chips:toggle_selected"),
  cursorMove: createSignal("cursor:move"),
  cursorPage: createSignal("cursor:page"),
  cursorChanged: createSignal("cursor:changed"),
  visualToggle: createSignal("visual:toggle"),
  visualExit: createSignal("visual:exit"),
  filesToggleExplorer: createSignal("files:toggle_explorer"),
  filesEnterOrOpen: createSignal("files:enter_or_open"),
  filesOpenInEditor: createSignal("files:open_in_editor"),
  filesEnterDirectory: createSignal("files:enter_directory"),
  filesParentDir: createSignal("files:parent_dir"),
  filesCollapseCurrent: createSignal("files:collapse_current"),
  filesResetVisibility: createSignal("files:reset_visibility"),
  groupsSaveOrUpdate: createSignal("groups:save_or_update"),
  groupsDeleteSelected: createSignal("groups:delete_selected"),
  groupsNameSubmit: createSignal("groups:name_submit"),
  groupsNameCancel: createSignal("groups:name_cancel"),
  navJumpTop: createSignal("nav:jump_top"),
  navJumpBottom: createSignal("nav:jump_bottom"),
  navJumpNextFile: createSignal("nav:jump_next_file"),
  navJumpPrevFile: createSignal("nav:jump_prev_file"),
  navJumpNextAgent: createSignal("nav:jump_next_agent"),
  agentDeleteAtCursor: createSignal("agent:delete_at_cursor"),
  promptClose: createSignal("prompt:close"),
  promptSubmit: createSignal("prompt:submit"),
  promptFieldCycle: createSignal("prompt:field_cycle"),
  promptModelCycle: createSignal("prompt:model_cycle"),
  promptThinkingCycle: createSignal("prompt:thinking_cycle"),
  promptModelsRefresh: createSignal("prompt:models_refresh"),
  promptSubmission: createSignal("prompt:submission"),
  promptFocusModeChange: createSignal("prompt:focus_mode_change"),
  agentRenderRequested: createSignal("agent:render_requested"),
  scrollVertical: createSignal("scroll:vertical"),
  systemStdoutResize: createSignal("system:stdout_resize"),
  onFocus: createSignal("on:focus"),
  workspaceChanged: createSignal("workspace:changed"),
} as const;
