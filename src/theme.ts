import { SyntaxStyle } from "@opentui/core";

type SyntaxPalette = {
  default: string;
  text: string;
  comment: string;
  punctuationComment: string;
  keywordControl: string;
  keywordOperator: string;
  keyword: string;
  boolean: string;
  nullish: string;
  builtin: string;
  variable: string;
  variableBuiltin: string;
  parameter: string;
  string: string;
  stringEscape: string;
  regexp: string;
  number: string;
  functionCall: string;
  function: string;
  method: string;
  constructor: string;
  type: string;
  class: string;
  interface: string;
  namespace: string;
  constant: string;
  enum: string;
  property: string;
  field: string;
  attribute: string;
  tag: string;
  operator: string;
  punctuation: string;
  delimiter: string;
  punctuationSpecial: string;
  heading: string;
  heading1: string;
  heading2: string;
  heading3: string;
  heading4: string;
  heading5: string;
  heading6: string;
  strong: string;
  italic: string;
  strikethrough: string;
  raw: string;
  list: string;
  link: string;
  linkLabel: string;
  linkUrl: string;
};

type ThemeColors = {
  background: string;
  chipSelectedFocusedBg: string;
  chipSelectedBlurBg: string;
  chipEnabledBg: string;
  chipDisabledBg: string;
  chipSelectedFg: string;
  chipEnabledFg: string;
  chipDisabledFg: string;
  dividerBg: string;
  dividerFg: string;
  collapsedBg: string;
  collapsedFg: string;
  codeLineNumberFg: string;
  uncommittedSignColor: string;
  agentRowFg: string;
  agentRowSelectedBg: string;
  agentRowSelectedFg: string;
  agentRowCursorBg: string;
  agentRowCursorFg: string;
  agentMessageBg: string;
  agentMessageFg: string;
  emptyStateFg: string;
  modalBorderColor: string;
  modalBackgroundColor: string;
  modalTitleColor: string;
  modalSectionTitleColor: string;
  modalShortcutKeyColor: string;
  modalShortcutDescriptionColor: string;
  searchStatusColor: string;
  searchInputBg: string;
  searchInputFocusedBg: string;
  searchInputText: string;
  searchInputFocusedText: string;
  searchInputSelectionBg: string;
  searchInputSelectionFg: string;
  searchSelectedRowBg: string;
  searchSelectedRowFg: string;
  searchRowFg: string;
  searchFileKindColor: string;
  searchFunctionKindColor: string;
  searchVariableKindColor: string;
  searchClassKindColor: string;
  searchTypeKindColor: string;
  searchHeadingKindColor: string;
  searchFallbackKindColor: string;
  promptOverlayBg: string;
  promptInputBg: string;
  promptInputFocusedBg: string;
  promptPrefixFg: string;
  promptTextFg: string;
  promptFocusedTextFg: string;
  promptSelectionBg: string;
  promptSelectionFg: string;
  promptChipBg: string;
  promptChipFg: string;
  promptChipActiveBg: string;
  promptChipActiveFg: string;
  cursorLineBg: string;
  selectionLineBg: string;
  highlightedTextColor: string;
  statusDraftBg: string;
  statusRunningBg: string;
  statusCompletedBg: string;
  statusFailedBg: string;
};

type ThemeDefinition = {
  name: string;
  syntax: SyntaxPalette;
  colors: ThemeColors;
};

const MIDNIGHT_THEME: ThemeDefinition = {
  name: "Midnight",
  syntax: {
    default: "#d1d5db",
    text: "#d1d5db",
    comment: "#6b7280",
    punctuationComment: "#6b7280",
    keywordControl: "#93c5fd",
    keywordOperator: "#f8fafc",
    keyword: "#60a5fa",
    boolean: "#f59e0b",
    nullish: "#f59e0b",
    builtin: "#f472b6",
    variable: "#e5e7eb",
    variableBuiltin: "#fda4af",
    parameter: "#bfdbfe",
    string: "#34d399",
    stringEscape: "#5eead4",
    regexp: "#86efac",
    number: "#f59e0b",
    functionCall: "#67e8f9",
    function: "#22d3ee",
    method: "#22d3ee",
    constructor: "#38bdf8",
    type: "#a78bfa",
    class: "#c4b5fd",
    interface: "#c4b5fd",
    namespace: "#c4b5fd",
    constant: "#f472b6",
    enum: "#f472b6",
    property: "#38bdf8",
    field: "#38bdf8",
    attribute: "#f9a8d4",
    tag: "#fb7185",
    operator: "#f8fafc",
    punctuation: "#9ca3af",
    delimiter: "#9ca3af",
    punctuationSpecial: "#94a3b8",
    heading: "#f8fafc",
    heading1: "#f97316",
    heading2: "#f59e0b",
    heading3: "#22c55e",
    heading4: "#06b6d4",
    heading5: "#3b82f6",
    heading6: "#a855f7",
    strong: "#ffffff",
    italic: "#e2e8f0",
    strikethrough: "#94a3b8",
    raw: "#fca5a5",
    list: "#93c5fd",
    link: "#60a5fa",
    linkLabel: "#bfdbfe",
    linkUrl: "#38bdf8",
  },
  colors: {
    background: "#030712",
    chipSelectedFocusedBg: "#f3f4f6",
    chipSelectedBlurBg: "#9ca3af",
    chipEnabledBg: "#6b7280",
    chipDisabledBg: "#1f2937",
    chipSelectedFg: "#111827",
    chipEnabledFg: "#ffffff",
    chipDisabledFg: "#9ca3af",
    dividerBg: "#6b7280",
    dividerFg: "#ffffff",
    collapsedBg: "#374151",
    collapsedFg: "#d1d5db",
    codeLineNumberFg: "#e5e7eb",
    uncommittedSignColor: "#22c55e",
    agentRowFg: "#f8fafc",
    agentRowSelectedBg: "#334155",
    agentRowSelectedFg: "#f8fafc",
    agentRowCursorBg: "#e7d570",
    agentRowCursorFg: "#111827",
    agentMessageBg: "#1f2937",
    agentMessageFg: "#e5e7eb",
    emptyStateFg: "#9ca3af",
    modalBorderColor: "#9ca3af",
    modalBackgroundColor: "#000000",
    modalTitleColor: "#ffffff",
    modalSectionTitleColor: "#ffffff",
    modalShortcutKeyColor: "#a855f7",
    modalShortcutDescriptionColor: "#ffffff",
    searchStatusColor: "#a855f7",
    searchInputBg: "#111827",
    searchInputFocusedBg: "#1f2937",
    searchInputText: "#f3f4f6",
    searchInputFocusedText: "#ffffff",
    searchInputSelectionBg: "#4b5563",
    searchInputSelectionFg: "#ffffff",
    searchSelectedRowBg: "#1f2937",
    searchSelectedRowFg: "#ffffff",
    searchRowFg: "#e5e7eb",
    searchFileKindColor: "#38bdf8",
    searchFunctionKindColor: "#22c55e",
    searchVariableKindColor: "#f59e0b",
    searchClassKindColor: "#a78bfa",
    searchTypeKindColor: "#f472b6",
    searchHeadingKindColor: "#60a5fa",
    searchFallbackKindColor: "#cbd5e1",
    promptOverlayBg: "#1f2937",
    promptInputBg: "#0b1220",
    promptInputFocusedBg: "#0f172a",
    promptPrefixFg: "#f9fafb",
    promptTextFg: "#f3f4f6",
    promptFocusedTextFg: "#ffffff",
    promptSelectionBg: "#6b7280",
    promptSelectionFg: "#ffffff",
    promptChipBg: "#374151",
    promptChipFg: "#f3f4f6",
    promptChipActiveBg: "#e5e7eb",
    promptChipActiveFg: "#111827",
    cursorLineBg: "#ada46d",
    selectionLineBg: "#8f8658",
    highlightedTextColor: "#111111",
    statusDraftBg: "#312e81",
    statusRunningBg: "#1e3a8a",
    statusCompletedBg: "#14532d",
    statusFailedBg: "#7f1d1d",
  },
};

const EMBER_THEME: ThemeDefinition = {
  name: "Ember",
  syntax: {
    default: "#f2efe9",
    text: "#f2efe9",
    comment: "#948b80",
    punctuationComment: "#948b80",
    keywordControl: "#ffb86b",
    keywordOperator: "#f8efe2",
    keyword: "#ffd089",
    boolean: "#ff9d7a",
    nullish: "#ff9d7a",
    builtin: "#ff8c8c",
    variable: "#f7f0e6",
    variableBuiltin: "#ffb3a1",
    parameter: "#f5d7b1",
    string: "#9ce0a1",
    stringEscape: "#8ce6d2",
    regexp: "#9ce0a1",
    number: "#ff9d7a",
    functionCall: "#8dd9ff",
    function: "#63c7ff",
    method: "#63c7ff",
    constructor: "#76a7ff",
    type: "#d5a8ff",
    class: "#dfbeff",
    interface: "#dfbeff",
    namespace: "#dfbeff",
    constant: "#ff8c8c",
    enum: "#ff8c8c",
    property: "#8ac8ff",
    field: "#8ac8ff",
    attribute: "#ffb5d0",
    tag: "#ff8e7d",
    operator: "#f8efe2",
    punctuation: "#b4aba0",
    delimiter: "#b4aba0",
    punctuationSpecial: "#c9b7a2",
    heading: "#fff6eb",
    heading1: "#ff8f5a",
    heading2: "#ffa14f",
    heading3: "#8ee35a",
    heading4: "#4fd4d4",
    heading5: "#5a98ff",
    heading6: "#c277ff",
    strong: "#ffffff",
    italic: "#fff0de",
    strikethrough: "#a69c90",
    raw: "#ffb8a1",
    list: "#ffd089",
    link: "#8ac8ff",
    linkLabel: "#b8dbff",
    linkUrl: "#6cb2ff",
  },
  colors: {
    background: "#1f1411",
    chipSelectedFocusedBg: "#fef3c7",
    chipSelectedBlurBg: "#d6b996",
    chipEnabledBg: "#8f6042",
    chipDisabledBg: "#3b2a23",
    chipSelectedFg: "#2a160e",
    chipEnabledFg: "#fff6ed",
    chipDisabledFg: "#c6a68f",
    dividerBg: "#855f4b",
    dividerFg: "#fff9f3",
    collapsedBg: "#4a2f24",
    collapsedFg: "#f2d7c3",
    codeLineNumberFg: "#f4dfcf",
    uncommittedSignColor: "#4ade80",
    agentRowFg: "#fff2e5",
    agentRowSelectedBg: "#5f3a2e",
    agentRowSelectedFg: "#fff7ef",
    agentRowCursorBg: "#e7c37b",
    agentRowCursorFg: "#22130c",
    agentMessageBg: "#3a241c",
    agentMessageFg: "#f4dfcf",
    emptyStateFg: "#c7a68e",
    modalBorderColor: "#d0ad90",
    modalBackgroundColor: "#120a07",
    modalTitleColor: "#fff5ea",
    modalSectionTitleColor: "#fff5ea",
    modalShortcutKeyColor: "#d8b4fe",
    modalShortcutDescriptionColor: "#fff5ea",
    searchStatusColor: "#d8b4fe",
    searchInputBg: "#24140f",
    searchInputFocusedBg: "#331d15",
    searchInputText: "#fff3e7",
    searchInputFocusedText: "#ffffff",
    searchInputSelectionBg: "#77523f",
    searchInputSelectionFg: "#ffffff",
    searchSelectedRowBg: "#3a241c",
    searchSelectedRowFg: "#ffffff",
    searchRowFg: "#f3dece",
    searchFileKindColor: "#67e8f9",
    searchFunctionKindColor: "#4ade80",
    searchVariableKindColor: "#facc15",
    searchClassKindColor: "#c4b5fd",
    searchTypeKindColor: "#f9a8d4",
    searchHeadingKindColor: "#93c5fd",
    searchFallbackKindColor: "#e5e7eb",
    promptOverlayBg: "#3a241c",
    promptInputBg: "#1b100c",
    promptInputFocusedBg: "#27160f",
    promptPrefixFg: "#fff8f2",
    promptTextFg: "#fff2e5",
    promptFocusedTextFg: "#ffffff",
    promptSelectionBg: "#7c5843",
    promptSelectionFg: "#ffffff",
    promptChipBg: "#5f3a2e",
    promptChipFg: "#ffeedd",
    promptChipActiveBg: "#fef3c7",
    promptChipActiveFg: "#2a160e",
    cursorLineBg: "#e0c585",
    selectionLineBg: "#c6a96b",
    highlightedTextColor: "#111111",
    statusDraftBg: "#7c2d12",
    statusRunningBg: "#9a3412",
    statusCompletedBg: "#14532d",
    statusFailedBg: "#7f1d1d",
  },
};

const FROST_THEME: ThemeDefinition = {
  name: "Frost",
  syntax: {
    default: "#e5eef5",
    text: "#e5eef5",
    comment: "#7d92a3",
    punctuationComment: "#7d92a3",
    keywordControl: "#9dd8ff",
    keywordOperator: "#f2f8fc",
    keyword: "#7bc8ff",
    boolean: "#ffd27c",
    nullish: "#ffd27c",
    builtin: "#ff9fc2",
    variable: "#f0f6fb",
    variableBuiltin: "#ffbed3",
    parameter: "#b8e3ff",
    string: "#8ce3c2",
    stringEscape: "#8cecf1",
    regexp: "#a3efcd",
    number: "#ffd27c",
    functionCall: "#7fe6f7",
    function: "#4fd1e6",
    method: "#4fd1e6",
    constructor: "#66c7ff",
    type: "#b5bcff",
    class: "#d0d5ff",
    interface: "#d0d5ff",
    namespace: "#d0d5ff",
    constant: "#ff9fc2",
    enum: "#ff9fc2",
    property: "#7fc5ff",
    field: "#7fc5ff",
    attribute: "#ffcae0",
    tag: "#ff94a8",
    operator: "#f2f8fc",
    punctuation: "#a6bac9",
    delimiter: "#a6bac9",
    punctuationSpecial: "#b8cad8",
    heading: "#f6fbff",
    heading1: "#ff9f5d",
    heading2: "#ffc363",
    heading3: "#6de27f",
    heading4: "#4ad6de",
    heading5: "#6ea9ff",
    heading6: "#c184ff",
    strong: "#ffffff",
    italic: "#eef5fb",
    strikethrough: "#a6bac9",
    raw: "#ffc3b0",
    list: "#a8d9ff",
    link: "#7bc8ff",
    linkLabel: "#b8e3ff",
    linkUrl: "#79c4ff",
  },
  colors: {
    background: "#0f1a24",
    chipSelectedFocusedBg: "#e2ecf8",
    chipSelectedBlurBg: "#9fb6cc",
    chipEnabledBg: "#4f6d87",
    chipDisabledBg: "#1d2a36",
    chipSelectedFg: "#0f1a24",
    chipEnabledFg: "#f2f8fc",
    chipDisabledFg: "#a2b7c8",
    dividerBg: "#4b687f",
    dividerFg: "#f4f9ff",
    collapsedBg: "#2b3d4d",
    collapsedFg: "#d8e7f2",
    codeLineNumberFg: "#e3eef7",
    uncommittedSignColor: "#4ade80",
    agentRowFg: "#f3f8fc",
    agentRowSelectedBg: "#32495d",
    agentRowSelectedFg: "#f8fbfe",
    agentRowCursorBg: "#dce597",
    agentRowCursorFg: "#12202c",
    agentMessageBg: "#203142",
    agentMessageFg: "#dbe8f2",
    emptyStateFg: "#9fb5c5",
    modalBorderColor: "#98b1c6",
    modalBackgroundColor: "#060e14",
    modalTitleColor: "#f6fbff",
    modalSectionTitleColor: "#f6fbff",
    modalShortcutKeyColor: "#d8b4fe",
    modalShortcutDescriptionColor: "#f6fbff",
    searchStatusColor: "#d8b4fe",
    searchInputBg: "#13212e",
    searchInputFocusedBg: "#1b2d3f",
    searchInputText: "#eaf3fa",
    searchInputFocusedText: "#ffffff",
    searchInputSelectionBg: "#47617a",
    searchInputSelectionFg: "#ffffff",
    searchSelectedRowBg: "#203142",
    searchSelectedRowFg: "#ffffff",
    searchRowFg: "#dce8f2",
    searchFileKindColor: "#67e8f9",
    searchFunctionKindColor: "#4ade80",
    searchVariableKindColor: "#facc15",
    searchClassKindColor: "#c4b5fd",
    searchTypeKindColor: "#f9a8d4",
    searchHeadingKindColor: "#93c5fd",
    searchFallbackKindColor: "#e2e8f0",
    promptOverlayBg: "#1b2d3f",
    promptInputBg: "#0c1620",
    promptInputFocusedBg: "#132434",
    promptPrefixFg: "#f6fbff",
    promptTextFg: "#ebf4fb",
    promptFocusedTextFg: "#ffffff",
    promptSelectionBg: "#4c667f",
    promptSelectionFg: "#ffffff",
    promptChipBg: "#32495d",
    promptChipFg: "#e9f2f9",
    promptChipActiveBg: "#e2ecf8",
    promptChipActiveFg: "#0f1a24",
    cursorLineBg: "#d6e08f",
    selectionLineBg: "#b9c67d",
    highlightedTextColor: "#101010",
    statusDraftBg: "#3730a3",
    statusRunningBg: "#1d4ed8",
    statusCompletedBg: "#166534",
    statusFailedBg: "#991b1b",
  },
};

/** Theme singleton used by all renderers to keep UI colors consistent. */
export class ThemeManager {
  private static instance: ThemeManager | null = null;
  private readonly themes: ThemeDefinition[];
  private readonly syntaxStyleCache = new Map<string, SyntaxStyle>();
  private currentThemeIndex = 0;

  private constructor() {
    this.themes = [MIDNIGHT_THEME, EMBER_THEME, FROST_THEME];
  }

  /** Returns the single global theme manager instance. */
  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  /** Cycles to the next theme and returns the active theme name. */
  public toggleTheme(): string {
    this.currentThemeIndex = (this.currentThemeIndex + 1) % this.themes.length;
    return this.getThemeName();
  }

  /** Returns the active theme display name. */
  public getThemeName(): string {
    return this.currentTheme.name;
  }

  /** Returns syntax style object for the active theme. */
  public getSyntaxStyle(): SyntaxStyle {
    const themeName = this.currentTheme.name;
    const cached = this.syntaxStyleCache.get(themeName);
    if (cached) return cached;
    const style = buildSyntaxStyle(this.currentTheme.syntax);
    this.syntaxStyleCache.set(themeName, style);
    return style;
  }

  /** Returns main app background color. */
  public getBackgroundColor(): string {
    return this.currentTheme.colors.background;
  }

  /** Returns syntax function color for external consumers. */
  public getFunctionColor(): string {
    return this.currentTheme.syntax.function;
  }

  /** Returns chip background for selected state. */
  public getChipSelectedBackgroundColor(focused: boolean): string {
    return focused
      ? this.currentTheme.colors.chipSelectedFocusedBg
      : this.currentTheme.colors.chipSelectedBlurBg;
  }

  /** Returns chip background for enabled or disabled state. */
  public getChipBackgroundColor(enabled: boolean): string {
    return enabled ? this.currentTheme.colors.chipEnabledBg : this.currentTheme.colors.chipDisabledBg;
  }

  /** Returns chip text color by visual state. */
  public getChipTextColor(selected: boolean, enabled: boolean): string {
    if (selected) return this.currentTheme.colors.chipSelectedFg;
    return enabled ? this.currentTheme.colors.chipEnabledFg : this.currentTheme.colors.chipDisabledFg;
  }

  /** Returns divider text foreground color. */
  public getDividerForegroundColor(): string {
    return this.currentTheme.colors.dividerFg;
  }

  /** Returns divider background color. */
  public getDividerBackgroundColor(): string {
    return this.currentTheme.colors.dividerBg;
  }

  /** Returns collapsed-block background color. */
  public getCollapsedBackgroundColor(): string {
    return this.currentTheme.colors.collapsedBg;
  }

  /** Returns collapsed-block foreground color. */
  public getCollapsedForegroundColor(): string {
    return this.currentTheme.colors.collapsedFg;
  }

  /** Returns code line-number foreground color. */
  public getCodeLineNumberColor(): string {
    return this.currentTheme.colors.codeLineNumberFg;
  }

  /** Returns uncommitted line sign color. */
  public getUncommittedLineSignColor(): string {
    return this.currentTheme.colors.uncommittedSignColor;
  }

  /** Returns base foreground for main agent row text. */
  public getAgentRowForegroundColor(): string {
    return this.currentTheme.colors.agentRowFg;
  }

  /** Returns agent row selected background color. */
  public getAgentRowSelectedBackgroundColor(): string {
    return this.currentTheme.colors.agentRowSelectedBg;
  }

  /** Returns agent row selected foreground color. */
  public getAgentRowSelectedForegroundColor(): string {
    return this.currentTheme.colors.agentRowSelectedFg;
  }

  /** Returns agent row cursor background color. */
  public getAgentRowCursorBackgroundColor(): string {
    return this.currentTheme.colors.agentRowCursorBg;
  }

  /** Returns agent row cursor foreground color. */
  public getAgentRowCursorForegroundColor(): string {
    return this.currentTheme.colors.agentRowCursorFg;
  }

  /** Returns agent message row background color. */
  public getAgentMessageBackgroundColor(): string {
    return this.currentTheme.colors.agentMessageBg;
  }

  /** Returns agent message row foreground color. */
  public getAgentMessageForegroundColor(): string {
    return this.currentTheme.colors.agentMessageFg;
  }

  /** Returns background color used by agent status. */
  public getAgentStatusBackgroundColor(status: "draft" | "running" | "completed" | "failed"): string {
    switch (status) {
      case "running":
        return this.currentTheme.colors.statusRunningBg;
      case "completed":
        return this.currentTheme.colors.statusCompletedBg;
      case "failed":
        return this.currentTheme.colors.statusFailedBg;
      default:
        return this.currentTheme.colors.statusDraftBg;
    }
  }

  /** Returns dim empty-state text color. */
  public getEmptyStateColor(): string {
    return this.currentTheme.colors.emptyStateFg;
  }

  /** Returns modal panel border color. */
  public getModalBorderColor(): string {
    return this.currentTheme.colors.modalBorderColor;
  }

  /** Returns modal panel background color. */
  public getModalBackgroundColor(): string {
    return this.currentTheme.colors.modalBackgroundColor;
  }

  /** Returns modal title color. */
  public getModalTitleColor(): string {
    return this.currentTheme.colors.modalTitleColor;
  }

  /** Returns modal section title color. */
  public getModalSectionTitleColor(): string {
    return this.currentTheme.colors.modalSectionTitleColor;
  }

  /** Returns modal shortcut key color. */
  public getModalShortcutKeyColor(): string {
    return this.currentTheme.colors.modalShortcutKeyColor;
  }

  /** Returns modal shortcut description color. */
  public getModalShortcutDescriptionColor(): string {
    return this.currentTheme.colors.modalShortcutDescriptionColor;
  }

  /** Returns search status color. */
  public getSearchStatusColor(): string {
    return this.currentTheme.colors.searchStatusColor;
  }

  /** Returns search input background color. */
  public getSearchInputBackgroundColor(): string {
    return this.currentTheme.colors.searchInputBg;
  }

  /** Returns search input focused background color. */
  public getSearchInputFocusedBackgroundColor(): string {
    return this.currentTheme.colors.searchInputFocusedBg;
  }

  /** Returns search input text color. */
  public getSearchInputTextColor(): string {
    return this.currentTheme.colors.searchInputText;
  }

  /** Returns search input focused text color. */
  public getSearchInputFocusedTextColor(): string {
    return this.currentTheme.colors.searchInputFocusedText;
  }

  /** Returns search input selection background color. */
  public getSearchInputSelectionBackgroundColor(): string {
    return this.currentTheme.colors.searchInputSelectionBg;
  }

  /** Returns search input selection foreground color. */
  public getSearchInputSelectionForegroundColor(): string {
    return this.currentTheme.colors.searchInputSelectionFg;
  }

  /** Returns search selected row background color. */
  public getSearchSelectedRowBackgroundColor(): string {
    return this.currentTheme.colors.searchSelectedRowBg;
  }

  /** Returns search selected row foreground color. */
  public getSearchSelectedRowForegroundColor(): string {
    return this.currentTheme.colors.searchSelectedRowFg;
  }

  /** Returns search row foreground color. */
  public getSearchRowForegroundColor(): string {
    return this.currentTheme.colors.searchRowFg;
  }

  /** Returns search-result kind color by symbol type. */
  public getSearchKindColor(kind: string): string {
    switch (kind) {
      case "file":
        return this.currentTheme.colors.searchFileKindColor;
      case "function":
        return this.currentTheme.colors.searchFunctionKindColor;
      case "variable":
        return this.currentTheme.colors.searchVariableKindColor;
      case "class":
        return this.currentTheme.colors.searchClassKindColor;
      case "type":
        return this.currentTheme.colors.searchTypeKindColor;
      case "heading":
        return this.currentTheme.colors.searchHeadingKindColor;
      case "reference":
        return this.currentTheme.colors.searchFunctionKindColor;
      default:
        return this.currentTheme.colors.searchFallbackKindColor;
    }
  }

  /** Returns prompt overlay background color. */
  public getPromptOverlayBackgroundColor(): string {
    return this.currentTheme.colors.promptOverlayBg;
  }

  /** Returns prompt input shell background color. */
  public getPromptInputBackgroundColor(): string {
    return this.currentTheme.colors.promptInputBg;
  }

  /** Returns prompt input focused background color. */
  public getPromptInputFocusedBackgroundColor(): string {
    return this.currentTheme.colors.promptInputFocusedBg;
  }

  /** Returns prompt prefix foreground color. */
  public getPromptPrefixColor(): string {
    return this.currentTheme.colors.promptPrefixFg;
  }

  /** Returns prompt text color. */
  public getPromptTextColor(): string {
    return this.currentTheme.colors.promptTextFg;
  }

  /** Returns prompt focused text color. */
  public getPromptFocusedTextColor(): string {
    return this.currentTheme.colors.promptFocusedTextFg;
  }

  /** Returns prompt selection background color. */
  public getPromptSelectionBackgroundColor(): string {
    return this.currentTheme.colors.promptSelectionBg;
  }

  /** Returns prompt selection foreground color. */
  public getPromptSelectionForegroundColor(): string {
    return this.currentTheme.colors.promptSelectionFg;
  }

  /** Returns prompt chip inactive background color. */
  public getPromptChipBackgroundColor(): string {
    return this.currentTheme.colors.promptChipBg;
  }

  /** Returns prompt chip inactive foreground color. */
  public getPromptChipForegroundColor(): string {
    return this.currentTheme.colors.promptChipFg;
  }

  /** Returns prompt chip active background color. */
  public getPromptChipActiveBackgroundColor(): string {
    return this.currentTheme.colors.promptChipActiveBg;
  }

  /** Returns prompt chip active foreground color. */
  public getPromptChipActiveForegroundColor(): string {
    return this.currentTheme.colors.promptChipActiveFg;
  }

  /** Returns cursor-line highlight color. */
  public getCursorLineHighlightBackgroundColor(): string {
    return this.currentTheme.colors.cursorLineBg;
  }

  /** Returns visual-selection highlight color. */
  public getSelectionLineHighlightBackgroundColor(): string {
    return this.currentTheme.colors.selectionLineBg;
  }

  /** Returns highlighted text color used during line selection. */
  public getHighlightedTextColor(): string {
    return this.currentTheme.colors.highlightedTextColor;
  }

  /** Returns shared transparent color token. */
  public getTransparentColor(): string {
    return "transparent";
  }

  private get currentTheme(): ThemeDefinition {
    const current = this.themes[this.currentThemeIndex];
    if (current) return current;
    const fallback = this.themes[0];
    return fallback ?? MIDNIGHT_THEME;
  }
}

function buildSyntaxStyle(palette: SyntaxPalette): SyntaxStyle {
  return SyntaxStyle.fromTheme([
    { scope: ["default"], style: { foreground: palette.default } },
    { scope: ["text"], style: { foreground: palette.text } },
    { scope: ["comment"], style: { foreground: palette.comment, italic: true } },
    { scope: ["punctuation.comment"], style: { foreground: palette.punctuationComment } },
    { scope: ["keyword.control"], style: { foreground: palette.keywordControl, bold: true } },
    { scope: ["keyword.operator"], style: { foreground: palette.keywordOperator } },
    { scope: ["keyword"], style: { foreground: palette.keyword, bold: true } },
    { scope: ["boolean"], style: { foreground: palette.boolean, bold: true } },
    { scope: ["null"], style: { foreground: palette.nullish, bold: true } },
    { scope: ["builtin"], style: { foreground: palette.builtin } },
    { scope: ["variable"], style: { foreground: palette.variable } },
    { scope: ["variable.builtin"], style: { foreground: palette.variableBuiltin } },
    { scope: ["parameter"], style: { foreground: palette.parameter } },
    { scope: ["string"], style: { foreground: palette.string } },
    { scope: ["string.escape"], style: { foreground: palette.stringEscape } },
    { scope: ["regexp"], style: { foreground: palette.regexp } },
    { scope: ["number"], style: { foreground: palette.number } },
    { scope: ["float"], style: { foreground: palette.number } },
    { scope: ["integer"], style: { foreground: palette.number } },
    { scope: ["function.call"], style: { foreground: palette.functionCall } },
    { scope: ["function"], style: { foreground: palette.function } },
    { scope: ["method"], style: { foreground: palette.method } },
    { scope: ["constructor"], style: { foreground: palette.constructor } },
    { scope: ["type"], style: { foreground: palette.type } },
    { scope: ["class"], style: { foreground: palette.class } },
    { scope: ["interface"], style: { foreground: palette.interface } },
    { scope: ["namespace"], style: { foreground: palette.namespace } },
    { scope: ["constant"], style: { foreground: palette.constant } },
    { scope: ["enum"], style: { foreground: palette.enum } },
    { scope: ["property"], style: { foreground: palette.property } },
    { scope: ["field"], style: { foreground: palette.field } },
    { scope: ["attribute"], style: { foreground: palette.attribute } },
    { scope: ["tag"], style: { foreground: palette.tag } },
    { scope: ["operator"], style: { foreground: palette.operator } },
    { scope: ["punctuation"], style: { foreground: palette.punctuation } },
    { scope: ["delimiter"], style: { foreground: palette.delimiter } },
    { scope: ["punctuation.special"], style: { foreground: palette.punctuationSpecial, bold: true } },
    { scope: ["markup.heading"], style: { foreground: palette.heading, bold: true } },
    { scope: ["markup.heading.1"], style: { foreground: palette.heading1, bold: true } },
    { scope: ["markup.heading.2"], style: { foreground: palette.heading2, bold: true } },
    { scope: ["markup.heading.3"], style: { foreground: palette.heading3, bold: true } },
    { scope: ["markup.heading.4"], style: { foreground: palette.heading4, bold: true } },
    { scope: ["markup.heading.5"], style: { foreground: palette.heading5, bold: true } },
    { scope: ["markup.heading.6"], style: { foreground: palette.heading6, bold: true } },
    { scope: ["markup.strong"], style: { foreground: palette.strong, bold: true } },
    { scope: ["markup.italic"], style: { foreground: palette.italic, italic: true } },
    { scope: ["markup.strikethrough"], style: { foreground: palette.strikethrough, dim: true } },
    { scope: ["markup.raw"], style: { foreground: palette.raw } },
    { scope: ["markup.list"], style: { foreground: palette.list, bold: true } },
    { scope: ["markup.link"], style: { foreground: palette.link } },
    { scope: ["markup.link.label"], style: { foreground: palette.linkLabel, underline: true } },
    { scope: ["markup.link.url"], style: { foreground: palette.linkUrl, underline: true } },
  ]);
}

export const theme = ThemeManager.getInstance();
