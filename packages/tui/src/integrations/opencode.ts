import { createServerSocket, requestServer } from "../server-client";
import { emit, SIGNALS } from "../signals";
import type { AgentModel, AgentUpdate, ViewMode } from "../types";

export type AgentSubmission = {
  updateId?: string;
  viewMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  selectedText: string;
  prompt: string;
  model: string;
  thinkingLevel?: string;
};

type AgentOptions = {
  rootDir: string;
  initialUpdates: AgentUpdate[];
  onUpdatesChanged?: (updates: AgentUpdate[]) => void;
};

type OpencodeRunRequest = {
  rootDir: string;
  model: AgentModel;
  variant?: string;
  contextMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  prompt: string;
  selectedText: string;
  onMessage: (message: string) => void;
  onExit: (result: { success: boolean; error?: string }) => void;
};

type OpencodeRunResult =
  | {
      ok: true;
      runId: string;
      stop: () => void;
    }
  | {
      ok: false;
      error: string;
    };

type ServerRunDone = {
  runId: string;
  success: boolean;
  error?: string;
};

export type OpencodeModelCatalogItem = {
  model: string;
  variants: string[];
};

export class Agent {
  private readonly rootDir: string;
  private readonly onUpdatesChanged?: (updates: AgentUpdate[]) => void;

  private updates: AgentUpdate[];
  private runningStops = new Map<string, () => void>();
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AgentOptions) {
    this.rootDir = options.rootDir;
    this.onUpdatesChanged = options.onUpdatesChanged;
    this.updates = options.initialUpdates.map((update) => ({
      ...update,
      messages: [...(update.messages ?? [])],
    }));
  }

  public shutdown(): void {
    for (const stop of this.runningStops.values()) {
      stop();
    }
    this.runningStops.clear();
    if (!this.renderTimer) return;
    clearTimeout(this.renderTimer);
    this.renderTimer = null;
  }

  public getUpdates(): AgentUpdate[] {
    return this.updates.map((update) => ({ ...update, messages: [...update.messages] }));
  }

  public getMutableUpdates(): AgentUpdate[] {
    return this.updates;
  }

  public upsertFromSubmission(submission: AgentSubmission): AgentUpdate {
    let update = submission.updateId
      ? this.updates.find((entry) => entry.id === submission.updateId)
      : undefined;

    if (!update) {
      update = {
        id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        contextMode: submission.viewMode,
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
      update.contextMode = submission.viewMode;
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

  public findById(id: string): AgentUpdate | undefined {
    return this.updates.find((update) => update.id === id);
  }

  public findByRenderedLine(
    cursorLine: number,
    updateIdByAgentLine: ReadonlyMap<number, string>,
  ): AgentUpdate | undefined {
    const updateId = updateIdByAgentLine.get(cursorLine);
    if (!updateId) return undefined;
    return this.findById(updateId);
  }

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
    emit(SIGNALS.agentRenderRequested);
    return true;
  }

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
    emit(SIGNALS.agentRenderRequested);

    let result: OpencodeRunResult;
    try {
      result = await startHeadlessOpencodeRun({
        rootDir: this.rootDir,
        model: update.model,
        variant: update.variant,
        contextMode: update.contextMode,
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
          update.error = success ? undefined : error ?? "opencode run failed.";
          if (update.error) {
            this.pushMessage(update, update.error);
          }
          this.notifyUpdatesChanged();
          emit(SIGNALS.agentRenderRequested);
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
      emit(SIGNALS.agentRenderRequested);
      return;
    }

    update.runId = result.runId;
    this.runningStops.set(update.id, result.stop);
    this.notifyUpdatesChanged();
    emit(SIGNALS.agentRenderRequested);
  }

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

  private scheduleRender(): void {
    if (this.renderTimer) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.notifyUpdatesChanged();
      emit(SIGNALS.agentRenderRequested);
    }, 60);
  }

  private notifyUpdatesChanged(): void {
    this.onUpdatesChanged?.(this.getUpdates());
  }
}

export async function listOpencodeModelCatalog(_rootDir: string): Promise<OpencodeModelCatalogItem[]> {
  try {
    const payload = await requestServer<unknown>("opencode.models.list");
    return parseServerModelCatalog(payload);
  } catch {
    return [];
  }
}

async function startHeadlessOpencodeRun(request: OpencodeRunRequest): Promise<OpencodeRunResult> {
  const socket = await createServerSocket();

  let started = false;
  let finished = false;
  let runId = "";
  let detachedClose: (() => void) | null = null;
  let detachedEvents: (() => void) | null = null;

  const dispose = () => {
    detachedClose?.();
    detachedClose = null;
    detachedEvents?.();
    detachedEvents = null;
    socket.close();
  };

  const finalize = (result: { success: boolean; error?: string }) => {
    if (finished) return;
    finished = true;
    dispose();
    request.onExit(result);
  };

  detachedClose = socket.onClose(() => {
    if (!started) return;
    if (finished) return;
    finalize({ success: false, error: "Server connection closed during run." });
  });

  detachedEvents = socket.onEvent((event) => {
    if (event.event === "opencode.run.message") {
      const data = asRecord(event.data);
      if (!data) return;
      if (toText(data.runId) !== runId) return;
      const message = toText(data.message);
      if (!message) return;
      request.onMessage(message);
      return;
    }

    if (event.event === "opencode.run.done") {
      const done = parseRunDone(event.data);
      if (!done) return;
      if (done.runId !== runId) return;
      finalize({ success: done.success, error: done.success ? undefined : done.error });
    }
  });

  try {
    const startResult = await socket.request<{ runId?: unknown }>("opencode.run.start", {
      model: request.model,
      variant: request.variant,
      contextMode: request.contextMode,
      filePath: request.filePath,
      selectionStartFileLine: request.selectionStartFileLine,
      selectionEndFileLine: request.selectionEndFileLine,
      prompt: request.prompt,
      selectedText: request.selectedText,
    });

    const nextRunId = toText(asRecord(startResult)?.runId);
    if (!nextRunId) {
      dispose();
      return { ok: false, error: "Server did not provide a run id." };
    }

    runId = nextRunId;
    started = true;
  } catch (error) {
    dispose();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to start run.",
    };
  }

  return {
    ok: true,
    runId,
    stop: () => {
      if (finished) return;
      void socket.request("opencode.run.stop", { runId }).catch(() => {
        // ignore best-effort stop errors
      });
      finalize({ success: false, error: "opencode run was cancelled." });
    },
  };
}

function parseServerModelCatalog(payload: unknown): OpencodeModelCatalogItem[] {
  if (!Array.isArray(payload)) return [];

  const catalog = new Map<string, OpencodeModelCatalogItem>();
  for (const item of payload) {
    const record = asRecord(item);
    if (!record) continue;

    const model = toText(record.model);
    if (!model) continue;

    const variants = Array.isArray(record.variants)
      ? record.variants
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
          .sort((a, b) => a.localeCompare(b))
      : [];

    catalog.set(model, { model, variants });
  }

  return [...catalog.values()].sort((a, b) => a.model.localeCompare(b.model));
}

function parseRunDone(value: unknown): ServerRunDone | null {
  const record = asRecord(value);
  if (!record) return null;
  const runId = toText(record.runId);
  if (!runId) return null;
  const success = record.success === true;
  return {
    runId,
    success,
    error: success ? undefined : toText(record.error) ?? "opencode run failed.",
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function toText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
