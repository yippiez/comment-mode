import { createStore } from "./store";
import { createUiActions, initialUiState } from "./ui";
import { createFilterActions, initialFiltersState, isTypeEnabled } from "./filters";
import { createBrowserActions, initialBrowserState } from "./browser";
import { createPromptActions, initialPromptState } from "./prompt";
import { createAgentActions, initialAgentState } from "./agent";
import { createNavigationActions, getSelectionRange, initialNavigationState } from "./navigation";
import { createThemeActions, initialThemeState } from "./theme";
import type { CreateAppStoreOptions, RootState } from "./types";

export function createAppStore(options: CreateAppStoreOptions = {}) {
  const store = createStore<RootState>({
    ui: initialUiState(),
    filters: initialFiltersState(),
    browser: initialBrowserState(),
    prompt: initialPromptState(options.initialModels),
    agent: initialAgentState(options.initialAgentUpdates),
    navigation: initialNavigationState(),
    theme: initialThemeState(),
  });

  const actions = {
    ui: createUiActions(store),
    filters: createFilterActions(store),
    browser: createBrowserActions(store),
    prompt: createPromptActions(store),
    agent: createAgentActions(store),
    navigation: createNavigationActions(store),
    theme: createThemeActions(store),
  };

  if (options.initialEntries) {
    actions.filters.recomputeFromEntries(options.initialEntries);
  }

  const selectors = {
    keyboardStateSnapshot: () => {
      const state = store.get();
      return {
        promptVisible: state.prompt.visible,
        focusMode: state.ui.focusMode,
      };
    },
    selectionRange: () => {
      const state = store.get();
      return getSelectionRange(state.navigation);
    },
    isTypeEnabled: (type: string) => {
      const state = store.get();
      return isTypeEnabled(state, type);
    },
  };

  return {
    ...store,
    actions,
    selectors,
  };
}

export type AppStore = ReturnType<typeof createAppStore>;

export type {
  RootState,
  UiState,
  FiltersState,
  BrowserState,
  PromptState,
  PromptTarget,
  PromptModelCatalogEntry,
  AgentState,
  AgentSubmissionStateInput,
  CursorState,
  CameraState,
  NavigationState,
  ThemeState,
  ProgrammaticScrollEntry,
  CreateAppStoreOptions,
} from "./types";
