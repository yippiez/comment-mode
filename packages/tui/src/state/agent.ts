import type { AgentUpdate } from "../types";
import type { RootState, AgentState, AgentSubmissionStateInput } from "./types";
import type { StoreApi } from "./store";

function cloneUpdate(update: AgentUpdate): AgentUpdate {
  return {
    ...update,
    messages: [...(update.messages ?? [])],
  };
}

function makeUpdateId(): string {
  return `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function initialAgentState(initialUpdates: readonly AgentUpdate[] = []): AgentState {
  return {
    updates: initialUpdates.map(cloneUpdate),
  };
}

export function createAgentActions(store: StoreApi<RootState>) {
  return {
    setUpdates(updates: readonly AgentUpdate[]): void {
      store.update((state) => {
        state.agent.updates = updates.map(cloneUpdate);
      });
    },
    upsertFromSubmission(submission: AgentSubmissionStateInput): AgentUpdate {
      let result: AgentUpdate | null = null;
      store.update((state) => {
        const existing = submission.updateId
          ? state.agent.updates.find((entry) => entry.id === submission.updateId)
          : undefined;

        if (!existing) {
          const created: AgentUpdate = {
            id: makeUpdateId(),
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
          state.agent.updates.push(created);
          result = created;
          return;
        }

        existing.contextMode = submission.viewMode;
        existing.filePath = submission.filePath;
        existing.selectionStartFileLine = submission.selectionStartFileLine;
        existing.selectionEndFileLine = submission.selectionEndFileLine;
        existing.selectedText = submission.selectedText;
        existing.prompt = submission.prompt;
        existing.harness = "opencode";
        existing.model = submission.model;
        existing.variant = submission.thinkingLevel;
        result = existing;
      });

      if (!result) {
        throw new Error("Failed to upsert agent update.");
      }
      return result;
    },
    remove(updateId: string): boolean {
      let removed = false;
      store.update((state) => {
        const previousLength = state.agent.updates.length;
        state.agent.updates = state.agent.updates.filter((entry) => entry.id !== updateId);
        removed = state.agent.updates.length !== previousLength;
      });
      return removed;
    },
    pruneForEntries(relativePaths: ReadonlySet<string>): void {
      store.update((state) => {
        state.agent.updates = state.agent.updates.filter((update) => relativePaths.has(update.filePath));
      });
    },
    setRunStatus(updateId: string, status: AgentUpdate["status"], error?: string): void {
      store.update((state) => {
        const update = state.agent.updates.find((entry) => entry.id === updateId);
        if (!update) return;
        update.status = status;
        update.error = error;
      });
    },
    setRunId(updateId: string, runId: string | undefined): void {
      store.update((state) => {
        const update = state.agent.updates.find((entry) => entry.id === updateId);
        if (!update) return;
        update.runId = runId;
      });
    },
    clearMessages(updateId: string): void {
      store.update((state) => {
        const update = state.agent.updates.find((entry) => entry.id === updateId);
        if (!update) return;
        update.messages = [];
      });
    },
    pushMessage(updateId: string, message: string, maxMessages = 64): void {
      store.update((state) => {
        const update = state.agent.updates.find((entry) => entry.id === updateId);
        if (!update) return;

        const trimmed = message.replace(/\s+/g, " ").trim();
        if (trimmed.length === 0) return;
        const previous = update.messages[update.messages.length - 1];
        if (previous === trimmed) return;

        update.messages.push(trimmed);
        if (update.messages.length > maxMessages) {
          update.messages.splice(0, update.messages.length - maxMessages);
        }
      });
    },
  };
}
