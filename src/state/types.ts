import type { AgentUpdate, CodeFileEntry, FocusMode, ViewMode } from "../types";
import type { PromptComposerField } from "../components/prompt-composer-bar";

export type UiState = {
  focusMode: FocusMode;
  viewMode: ViewMode;
  diffMode: boolean;
  selectedChipIndex: number;
};

export type FiltersState = {
  typeCounts: Map<string, number>;
  sortedTypes: string[];
  enabledTypes: Map<string, boolean>;
};

export type BrowserState = {
  collapsedFiles: Set<string>;
  filesModeDirectoryPath: string;
};

export type PromptTarget = {
  updateId?: string;
  viewMode?: ViewMode;
  filePath: string;
  selectionStartFileLine: number;
  selectionEndFileLine: number;
  anchorLine: number;
  selectedText: string;
  prompt: string;
  model: string;
  thinkingLevel?: string;
};

export type PromptState = {
  visible: boolean;
  field: PromptComposerField;
  target: PromptTarget | null;
  anchorLine: number | null;
  availableModels: string[];
  modelVariantsById: Map<string, string[]>;
  modelQuery: string;
  modelListLoading: boolean;
};

export type PromptModelCatalogEntry = {
  model: string;
  variants: string[];
};

export type AgentState = {
  updates: AgentUpdate[];
};

export type AgentSubmissionStateInput = {
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

export type CursorState = {
  totalLines: number;
  line: number;
  visualMode: boolean;
  visualAnchorLine: number;
};

export type ProgrammaticScrollEntry = {
  top: number;
  at: number;
};

export type CameraState = {
  preferredViewportOffset: number;
  lastKnownScrollTop: number;
  internalScrollUpdate: boolean;
  pendingProgrammaticScrolls: ProgrammaticScrollEntry[];
};

export type NavigationState = {
  cursor: CursorState;
  camera: CameraState;
  pendingGChordAt: number | null;
  lastRepeatedMoveAt: number;
};

export type ThemeState = {
  currentThemeIndex: number;
};

export type RootState = {
  ui: UiState;
  filters: FiltersState;
  browser: BrowserState;
  prompt: PromptState;
  agent: AgentState;
  navigation: NavigationState;
  theme: ThemeState;
};

export type CreateAppStoreOptions = {
  initialEntries?: readonly CodeFileEntry[];
  initialAgentUpdates?: readonly AgentUpdate[];
  initialModels?: readonly string[];
};
