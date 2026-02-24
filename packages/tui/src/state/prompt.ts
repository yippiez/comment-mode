import type { PromptComposerField } from "../components/prompt-composer-bar";
import type { RootState, PromptState, PromptTarget, PromptModelCatalogEntry } from "./types";
import type { StoreApi } from "./store";

const DEFAULT_MODEL = "opencode/big-pickle";
const DEFAULT_THINKING_LEVEL = "auto";

export function initialPromptState(initialModels?: readonly string[]): PromptState {
  const availableModels = normalizeModelList(initialModels ?? [DEFAULT_MODEL]);
  return {
    visible: false,
    field: "prompt",
    target: null,
    anchorLine: null,
    availableModels,
    modelVariantsById: new Map(),
    modelQuery: "",
    modelListLoading: false,
  };
}

function normalizeModelList(models: readonly string[]): string[] {
  const deduped = new Set(models.map((entry) => entry.trim()).filter((entry) => entry.length > 0));
  if (deduped.size === 0) {
    deduped.add(DEFAULT_MODEL);
  }
  return [...deduped].sort((a, b) => a.localeCompare(b));
}

function resolveDefaultModel(state: PromptState): string {
  if (state.availableModels.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  return state.availableModels[0] ?? DEFAULT_MODEL;
}

function normalizeThinkingLevel(target: PromptTarget, state: PromptState): string {
  const variants = state.modelVariantsById.get(target.model);
  if (!variants || variants.length === 0) {
    return target.thinkingLevel ?? DEFAULT_THINKING_LEVEL;
  }
  const current = target.thinkingLevel ?? DEFAULT_THINKING_LEVEL;
  return variants.includes(current) ? current : variants[0] ?? DEFAULT_THINKING_LEVEL;
}

export function createPromptActions(store: StoreApi<RootState>) {
  return {
    open(target: PromptTarget): void {
      store.update((state) => {
        const model = target.model || resolveDefaultModel(state.prompt);
        const normalized: PromptTarget = {
          ...target,
          model,
          thinkingLevel: target.thinkingLevel ?? DEFAULT_THINKING_LEVEL,
        };

        normalized.thinkingLevel = normalizeThinkingLevel(normalized, state.prompt);
        state.prompt.target = normalized;
        state.prompt.anchorLine = target.anchorLine;
        state.prompt.field = "prompt";
        state.prompt.visible = true;
        state.prompt.modelQuery = "";
      });
    },
    close(): void {
      store.update((state) => {
        state.prompt.visible = false;
        state.prompt.target = null;
        state.prompt.anchorLine = null;
        state.prompt.field = "prompt";
        state.prompt.modelQuery = "";
      });
    },
    setField(field: PromptComposerField): void {
      store.update((state) => {
        state.prompt.field = field;
      });
    },
    cycleField(delta: number): PromptComposerField {
      const fields: PromptComposerField[] = ["prompt", "model", "thinking"];
      let nextField: PromptComposerField = "prompt";
      store.update((state) => {
        const currentIndex = fields.indexOf(state.prompt.field);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex = ((safeIndex + delta) % fields.length + fields.length) % fields.length;
        nextField = fields[nextIndex] ?? "prompt";
        state.prompt.field = nextField;
      });
      return nextField;
    },
    setModelQuery(query: string): void {
      store.update((state) => {
        state.prompt.modelQuery = query;
      });
    },
    setModelListLoading(loading: boolean): void {
      store.update((state) => {
        state.prompt.modelListLoading = loading;
      });
    },
    setCatalog(catalog: readonly PromptModelCatalogEntry[]): void {
      store.update((state) => {
        if (catalog.length === 0) {
          state.prompt.availableModels = normalizeModelList(state.prompt.availableModels);
          return;
        }

        state.prompt.availableModels = normalizeModelList(catalog.map((entry) => entry.model));
        state.prompt.modelVariantsById = new Map(
          catalog.map((entry) => [entry.model, [...entry.variants].sort((a, b) => a.localeCompare(b))]),
        );

        if (!state.prompt.target) return;
        if (!state.prompt.availableModels.includes(state.prompt.target.model)) {
          state.prompt.target.model = resolveDefaultModel(state.prompt);
        }
        state.prompt.target.thinkingLevel = normalizeThinkingLevel(state.prompt.target, state.prompt);
      });
    },
    setTargetPrompt(prompt: string): void {
      store.update((state) => {
        if (!state.prompt.target) return;
        state.prompt.target.prompt = prompt;
      });
    },
  };
}
