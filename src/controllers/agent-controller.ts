import { startHeadlessAgentRun, type HeadlessAgentRunResult } from "../agent-session";
import type { AgentUpdate } from "../types";

export type AgentSubmission = {
  updateId?: string;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  selectedText: string;
  prompt: string;
  model: string;
  thinkingLevel?: string;
};

type AgentControllerOptions = {
  rootDir: string;
  initialUpdates: AgentUpdate[];
  onUpdatesChanged?: (updates: AgentUpdate[]) => void;
  onRenderRequested: () => void;
};

export class AgentController {
  private readonly rootDir: string;
  private readonly onUpdatesChanged?: (updates: AgentUpdate[]) => void;
  private readonly onRenderRequested: () => void;

  private updates: AgentUpdate[];
  private runningStops = new Map<string, () => void>();
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  /** Initializes agent update state and lifecycle callbacks. */
  constructor(options: AgentControllerOptions) {
    this.rootDir = options.rootDir;
    this.onUpdatesChanged = options.onUpdatesChanged;
    this.onRenderRequested = options.onRenderRequested;
    this.updates = options.initialUpdates.map((update) => ({
      ...update,
      messages: [...(update.messages ?? [])],
    }));
  }

  /** Stops running agent sessions and clears pending render timer. */
  public shutdown(): void {
    for (const stop of this.runningStops.values()) {
      stop();
    }
    this.runningStops.clear();
    if (!this.renderTimer) return;
    clearTimeout(this.renderTimer);
    this.renderTimer = null;
  }

  /** Returns immutable snapshot copy of current updates. */
  public getUpdates(): AgentUpdate[] {
    return this.updates.map((update) => ({ ...update, messages: [...update.messages] }));
  }

  /** Returns mutable updates array for internal render integration. */
  public getMutableUpdates(): AgentUpdate[] {
    return this.updates;
  }

  /** Creates or updates an agent update row from prompt submission. */
  public upsertFromSubmission(submission: AgentSubmission): AgentUpdate {
    let update = submission.updateId
      ? this.updates.find((entry) => entry.id === submission.updateId)
      : undefined;

    if (!update) {
      update = {
        id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        filePath: submission.filePath,
        selectionStartFileLine: submission.selectionStartFileLine,
        selectionEndFileLine: submission.selectionEndFileLine,
        selectedText: submission.selectedText,
        prompt: submission.prompt,
        harness: "opencode",
        model: submission.model,
        variant: submission.thinkingLevel,
        status: "draft",
        messages: [],
      };
      this.updates.push(update);
    } else {
      update.filePath = submission.filePath;
      update.selectionStartFileLine = submission.selectionStartFileLine;
      update.selectionEndFileLine = submission.selectionEndFileLine;
      update.selectedText = submission.selectedText;
      update.prompt = submission.prompt;
      update.harness = "opencode";
      update.model = submission.model;
      update.variant = submission.thinkingLevel;
    }

    this.notifyUpdatesChanged();
    return update;
  }

  /** Finds update by stable id. */
  public findById(id: string): AgentUpdate | undefined {
    return this.updates.find((update) => update.id === id);
  }

  /** Resolves update associated with the current rendered cursor line. */
  public findByRenderedLine(
    cursorLine: number,
    updateIdByAgentLine: ReadonlyMap<number, string>,
  ): AgentUpdate | undefined {
    const updateId = updateIdByAgentLine.get(cursorLine);
    if (!updateId) return undefined;
    return this.findById(updateId);
  }

  /** Removes an update and terminates any running session for it. */
  public remove(updateId: string): boolean {
    const stop = this.runningStops.get(updateId);
    if (stop) {
      stop();
      this.runningStops.delete(updateId);
    }

    const previousLength = this.updates.length;
    this.updates = this.updates.filter((entry) => entry.id !== updateId);
    if (this.updates.length === previousLength) return false;

    this.notifyUpdatesChanged();
    this.onRenderRequested();
    return true;
  }

  /** Drops updates that reference files no longer present in entry set. */
  public pruneForEntries(relativePaths: ReadonlySet<string>): void {
    const removedIds = new Set<string>();
    for (const update of this.updates) {
      if (relativePaths.has(update.filePath)) continue;
      removedIds.add(update.id);
    }

    for (const updateId of removedIds) {
      const stop = this.runningStops.get(updateId);
      if (!stop) continue;
      stop();
      this.runningStops.delete(updateId);
    }

    const previousLength = this.updates.length;
    this.updates = this.updates.filter((update) => relativePaths.has(update.filePath));
    if (this.updates.length === previousLength) return;

    this.notifyUpdatesChanged();
  }

  /** Starts a headless opencode run and streams update messages. */
  public async launch(update: AgentUpdate): Promise<void> {
    const existingStop = this.runningStops.get(update.id);
    if (existingStop) {
      existingStop();
      this.runningStops.delete(update.id);
    }

    update.status = "running";
    update.error = undefined;
    update.runId = undefined;
    update.messages = [];
    this.notifyUpdatesChanged();
    this.onRenderRequested();

    let result: HeadlessAgentRunResult;
    try {
      result = await startHeadlessAgentRun({
        rootDir: this.rootDir,
        harness: "opencode",
        model: update.model,
        variant: update.variant,
        filePath: update.filePath,
        selectionStartFileLine: update.selectionStartFileLine,
        selectionEndFileLine: update.selectionEndFileLine,
        prompt: update.prompt,
        selectedText: update.selectedText,
        onMessage: (message) => {
          this.pushMessage(update, message);
          this.scheduleRender();
        },
        onExit: ({ success, error }) => {
          this.runningStops.delete(update.id);
          update.status = success ? "completed" : "failed";
          update.error = success ? undefined : error ?? "Headless opencode run failed.";
          if (update.error) {
            this.pushMessage(update, update.error);
          }
          this.notifyUpdatesChanged();
          this.onRenderRequested();
        },
      });
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : "Failed to start run." };
    }

    if (!result.ok) {
      update.status = "failed";
      update.error = result.error;
      this.pushMessage(update, result.error);
      this.notifyUpdatesChanged();
      this.onRenderRequested();
      return;
    }

    update.runId = result.runId;
    this.runningStops.set(update.id, result.stop);
    this.notifyUpdatesChanged();
    this.onRenderRequested();
  }

  /** Appends normalized message while deduplicating adjacent duplicates. */
  private pushMessage(update: AgentUpdate, message: string): void {
    const trimmed = message.replace(/\s+/g, " ").trim();
    if (trimmed.length === 0) return;
    const previous = update.messages[update.messages.length - 1];
    if (previous === trimmed) return;
    update.messages.push(trimmed);
    if (update.messages.length > 64) {
      update.messages.splice(0, update.messages.length - 64);
    }
  }

  /** Batches high-frequency stream updates into a short render cadence. */
  private scheduleRender(): void {
    if (this.renderTimer) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.notifyUpdatesChanged();
      this.onRenderRequested();
    }, 60);
  }

  /** Emits update snapshots to persistence callback. */
  private notifyUpdatesChanged(): void {
    this.onUpdatesChanged?.(this.getUpdates());
  }
}
