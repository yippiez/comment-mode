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

const VAGUE_THEME: ThemeDefinition = {
  name: "Vague",
  syntax: {
    default: "#cdcdcd",
    text: "#cdcdcd",
    comment: "#606079",
    punctuationComment: "#606079",
    keywordControl: "#6e94b2",
    keywordOperator: "#90a0b5",
    keyword: "#6e94b2",
    boolean: "#e0a363",
    nullish: "#e0a363",
    builtin: "#b4d4cf",
    variable: "#cdcdcd",
    variableBuiltin: "#aeaed1",
    parameter: "#bb9dbd",
    string: "#e8b589",
    stringEscape: "#f3be7c",
    regexp: "#e8b589",
    number: "#e0a363",
    functionCall: "#c48282",
    function: "#c48282",
    method: "#c48282",
    constructor: "#9bb4bc",
    type: "#9bb4bc",
    class: "#9bb4bc",
    interface: "#9bb4bc",
    namespace: "#9bb4bc",
    constant: "#aeaed1",
    enum: "#aeaed1",
    property: "#c3c3d5",
    field: "#c3c3d5",
    attribute: "#c3c3d5",
    tag: "#c48282",
    operator: "#90a0b5",
    punctuation: "#878787",
    delimiter: "#878787",
    punctuationSpecial: "#90a0b5",
    heading: "#cdcdcd",
    heading1: "#c48282",
    heading2: "#e8b589",
    heading3: "#9bb4bc",
    heading4: "#6e94b2",
    heading5: "#b4d4cf",
    heading6: "#bb9dbd",
    strong: "#ffffff",
    italic: "#bcbccc",
    strikethrough: "#878787",
    raw: "#f3be7c",
    list: "#6e94b2",
    link: "#7e98e8",
    linkLabel: "#9bb4bc",
    linkUrl: "#7e98e8",
  },
  colors: {
    background: "#141415",
    chipSelectedFocusedBg: "#cdcdcd",
    chipSelectedBlurBg: "#878787",
    chipEnabledBg: "#333738",
    chipDisabledBg: "#1c1c24",
    chipSelectedFg: "#141415",
    chipEnabledFg: "#cdcdcd",
    chipDisabledFg: "#606079",
    dividerBg: "#252530",
    dividerFg: "#cdcdcd",
    collapsedBg: "#1c1c24",
    collapsedFg: "#c3c3d5",
    codeLineNumberFg: "#878787",
    uncommittedSignColor: "#7fa563",
    agentRowFg: "#cdcdcd",
    agentRowSelectedBg: "#252530",
    agentRowSelectedFg: "#ffffff",
    agentRowCursorBg: "#f3be7c",
    agentRowCursorFg: "#141415",
    agentMessageBg: "#1c1c24",
    agentMessageFg: "#cdcdcd",
    emptyStateFg: "#878787",
    modalBorderColor: "#606079",
    modalBackgroundColor: "#141415",
    modalTitleColor: "#ffffff",
    modalSectionTitleColor: "#cdcdcd",
    modalShortcutKeyColor: "#7e98e8",
    modalShortcutDescriptionColor: "#cdcdcd",
    searchStatusColor: "#7e98e8",
    searchInputBg: "#1c1c24",
    searchInputFocusedBg: "#252530",
    searchInputText: "#cdcdcd",
    searchInputFocusedText: "#ffffff",
    searchInputSelectionBg: "#333738",
    searchInputSelectionFg: "#ffffff",
    searchSelectedRowBg: "#252530",
    searchSelectedRowFg: "#ffffff",
    searchRowFg: "#cdcdcd",
    searchFileKindColor: "#7e98e8",
    searchFunctionKindColor: "#c48282",
    searchVariableKindColor: "#e0a363",
    searchClassKindColor: "#9bb4bc",
    searchTypeKindColor: "#b4d4cf",
    searchHeadingKindColor: "#6e94b2",
    searchFallbackKindColor: "#878787",
    promptOverlayBg: "#1c1c24",
    promptInputBg: "#1c1c24",
    promptInputFocusedBg: "#252530",
    promptPrefixFg: "#cdcdcd",
    promptTextFg: "#cdcdcd",
    promptFocusedTextFg: "#ffffff",
    promptSelectionBg: "#333738",
    promptSelectionFg: "#ffffff",
    promptChipBg: "#252530",
    promptChipFg: "#cdcdcd",
    promptChipActiveBg: "#cdcdcd",
    promptChipActiveFg: "#141415",
    cursorLineBg: "#405065",
    selectionLineBg: "#333738",
    highlightedTextColor: "#ffffff",
    statusDraftBg: "#4b3f63",
    statusRunningBg: "#405065",
    statusCompletedBg: "#2f4f3a",
    statusFailedBg: "#5b2d3a",
  },
};

const OPENCODE_THEME: ThemeDefinition = {
  name: "OpenCode",
  syntax: {
    default: "#ededed",
    text: "#ededed",
    comment: "#9a9190",
    punctuationComment: "#9a9190",
    keywordControl: "#ffba92",
    keywordOperator: "#b6abab",
    keyword: "#ffba92",
    boolean: "#ffba92",
    nullish: "#ffba92",
    builtin: "#93e9f6",
    variable: "#f5f2f2",
    variableBuiltin: "#edb2f1",
    parameter: "#fab283",
    string: "#00ceb9",
    stringEscape: "#95f3d9",
    regexp: "#93e9f6",
    number: "#ffba92",
    functionCall: "#edb2f1",
    function: "#edb2f1",
    method: "#ff9ae2",
    constructor: "#ecf58c",
    type: "#ecf58c",
    class: "#ecf58c",
    interface: "#ecf58c",
    namespace: "#ecf58c",
    constant: "#93e9f6",
    enum: "#93e9f6",
    property: "#ff9ae2",
    field: "#ff9ae2",
    attribute: "#ff9ae2",
    tag: "#ffba92",
    operator: "#b6abab",
    punctuation: "#9a9190",
    delimiter: "#9a9190",
    punctuationSpecial: "#c8c1c0",
    heading: "#f5f2f2",
    heading1: "#fab283",
    heading2: "#edb2f1",
    heading3: "#93e9f6",
    heading4: "#ecf58c",
    heading5: "#00ceb9",
    heading6: "#ff9ae2",
    strong: "#ffffff",
    italic: "#d6cdcc",
    strikethrough: "#9a9190",
    raw: "#ffba92",
    list: "#fab283",
    link: "#93e9f6",
    linkLabel: "#edb2f1",
    linkUrl: "#93e9f6",
  },
  colors: {
    background: "#101010",
    chipSelectedFocusedBg: "#f3f3f3",
    chipSelectedBlurBg: "#7c7372",
    chipEnabledBg: "#2a2727",
    chipDisabledBg: "#1b1b1b",
    chipSelectedFg: "#101010",
    chipEnabledFg: "#ededed",
    chipDisabledFg: "#9a9190",
    dividerBg: "#3d3838",
    dividerFg: "#f5f2f2",
    collapsedBg: "#1e1e1e",
    collapsedFg: "#d6cdcc",
    codeLineNumberFg: "#9a9190",
    uncommittedSignColor: "#12c905",
    agentRowFg: "#ededed",
    agentRowSelectedBg: "#1f1f1f",
    agentRowSelectedFg: "#ffffff",
    agentRowCursorBg: "#fab283",
    agentRowCursorFg: "#101010",
    agentMessageBg: "#151515",
    agentMessageFg: "#ededed",
    emptyStateFg: "#9a9190",
    modalBorderColor: "#3d3838",
    modalBackgroundColor: "#101010",
    modalTitleColor: "#f5f2f2",
    modalSectionTitleColor: "#f5f2f2",
    modalShortcutKeyColor: "#edb2f1",
    modalShortcutDescriptionColor: "#ededed",
    searchStatusColor: "#edb2f1",
    searchInputBg: "#151515",
    searchInputFocusedBg: "#1e1e1e",
    searchInputText: "#ededed",
    searchInputFocusedText: "#ffffff",
    searchInputSelectionBg: "#3d3838",
    searchInputSelectionFg: "#ffffff",
    searchSelectedRowBg: "#1f1f1f",
    searchSelectedRowFg: "#ffffff",
    searchRowFg: "#d6cdcc",
    searchFileKindColor: "#93e9f6",
    searchFunctionKindColor: "#00ceb9",
    searchVariableKindColor: "#fab283",
    searchClassKindColor: "#ecf58c",
    searchTypeKindColor: "#edb2f1",
    searchHeadingKindColor: "#ff9ae2",
    searchFallbackKindColor: "#b6abab",
    promptOverlayBg: "#151515",
    promptInputBg: "#1b1b1b",
    promptInputFocusedBg: "#1f1f1f",
    promptPrefixFg: "#f5f2f2",
    promptTextFg: "#ededed",
    promptFocusedTextFg: "#ffffff",
    promptSelectionBg: "#3d3838",
    promptSelectionFg: "#ffffff",
    promptChipBg: "#2a2727",
    promptChipFg: "#ededed",
    promptChipActiveBg: "#f3f3f3",
    promptChipActiveFg: "#101010",
    cursorLineBg: "#4a3a2e",
    selectionLineBg: "#3a2f29",
    highlightedTextColor: "#ffffff",
    statusDraftBg: "#432155",
    statusRunningBg: "#0f3058",
    statusCompletedBg: "#033a34",
    statusFailedBg: "#501b3f",
  },
};

const TOKYO_NIGHT_THEME: ThemeDefinition = {
  name: "Tokyo Night",
  syntax: {
    default: "#c0caf5",
    text: "#c0caf5",
    comment: "#565f89",
    punctuationComment: "#565f89",
    keywordControl: "#7aa2f7",
    keywordOperator: "#c0caf5",
    keyword: "#7aa2f7",
    boolean: "#ff9e64",
    nullish: "#ff9e64",
    builtin: "#f7768e",
    variable: "#c0caf5",
    variableBuiltin: "#bb9af7",
    parameter: "#9ece6a",
    string: "#9ece6a",
    stringEscape: "#73daca",
    regexp: "#73daca",
    number: "#ff9e64",
    functionCall: "#7dcfff",
    function: "#7dcfff",
    method: "#7dcfff",
    constructor: "#7aa2f7",
    type: "#e0af68",
    class: "#e0af68",
    interface: "#e0af68",
    namespace: "#e0af68",
    constant: "#7dcfff",
    enum: "#7dcfff",
    property: "#bb9af7",
    field: "#bb9af7",
    attribute: "#bb9af7",
    tag: "#f7768e",
    operator: "#c0caf5",
    punctuation: "#7a88cf",
    delimiter: "#7a88cf",
    punctuationSpecial: "#9aa5ce",
    heading: "#eaeaff",
    heading1: "#bb9af7",
    heading2: "#7aa2f7",
    heading3: "#9ece6a",
    heading4: "#7dcfff",
    heading5: "#e0af68",
    heading6: "#f7768e",
    strong: "#ffffff",
    italic: "#a9b1d6",
    strikethrough: "#737aa2",
    raw: "#ff9e64",
    list: "#7aa2f7",
    link: "#7aa2f7",
    linkLabel: "#7dcfff",
    linkUrl: "#7dcfff",
  },
  colors: {
    background: "#0f111a",
    chipSelectedFocusedBg: "#c0caf5",
    chipSelectedBlurBg: "#5a5f82",
    chipEnabledBg: "#24283b",
    chipDisabledBg: "#161a2a",
    chipSelectedFg: "#0f111a",
    chipEnabledFg: "#c0caf5",
    chipDisabledFg: "#565f89",
    dividerBg: "#3b4261",
    dividerFg: "#eaeaff",
    collapsedBg: "#1f2335",
    collapsedFg: "#a9b1d6",
    codeLineNumberFg: "#737aa2",
    uncommittedSignColor: "#41a6b5",
    agentRowFg: "#c0caf5",
    agentRowSelectedBg: "#1f2335",
    agentRowSelectedFg: "#eaeaff",
    agentRowCursorBg: "#e0af68",
    agentRowCursorFg: "#0f111a",
    agentMessageBg: "#1a1f30",
    agentMessageFg: "#c0caf5",
    emptyStateFg: "#565f89",
    modalBorderColor: "#3a3e57",
    modalBackgroundColor: "#101324",
    modalTitleColor: "#eaeaff",
    modalSectionTitleColor: "#eaeaff",
    modalShortcutKeyColor: "#bb9af7",
    modalShortcutDescriptionColor: "#c0caf5",
    searchStatusColor: "#bb9af7",
    searchInputBg: "#1f2335",
    searchInputFocusedBg: "#242a42",
    searchInputText: "#c0caf5",
    searchInputFocusedText: "#ffffff",
    searchInputSelectionBg: "#3b4261",
    searchInputSelectionFg: "#ffffff",
    searchSelectedRowBg: "#24283b",
    searchSelectedRowFg: "#ffffff",
    searchRowFg: "#c0caf5",
    searchFileKindColor: "#7aa2f7",
    searchFunctionKindColor: "#7dcfff",
    searchVariableKindColor: "#9ece6a",
    searchClassKindColor: "#e0af68",
    searchTypeKindColor: "#bb9af7",
    searchHeadingKindColor: "#7dcfff",
    searchFallbackKindColor: "#a9b1d6",
    promptOverlayBg: "#1f2335",
    promptInputBg: "#161a2a",
    promptInputFocusedBg: "#242a42",
    promptPrefixFg: "#eaeaff",
    promptTextFg: "#c0caf5",
    promptFocusedTextFg: "#ffffff",
    promptSelectionBg: "#3b4261",
    promptSelectionFg: "#ffffff",
    promptChipBg: "#24283b",
    promptChipFg: "#c0caf5",
    promptChipActiveBg: "#c0caf5",
    promptChipActiveFg: "#0f111a",
    cursorLineBg: "#2a3154",
    selectionLineBg: "#2b3357",
    highlightedTextColor: "#ffffff",
    statusDraftBg: "#3a2b58",
    statusRunningBg: "#1f4b7a",
    statusCompletedBg: "#1f5d4f",
    statusFailedBg: "#5f2f47",
  },
};

const WHITE_SEPIA_LIGHT_THEME: ThemeDefinition = {
  name: "Soda",
  syntax: {
    default: "#3f352f",
    text: "#3f352f",
    comment: "#9f8f7f",
    punctuationComment: "#9f8f7f",
    keywordControl: "#8f5a3a",
    keywordOperator: "#5f554e",
    keyword: "#8f5a3a",
    boolean: "#a8633f",
    nullish: "#a8633f",
    builtin: "#3b6f79",
    variable: "#3f352f",
    variableBuiltin: "#6d5ba6",
    parameter: "#6f4f37",
    string: "#557a4d",
    stringEscape: "#3f7f64",
    regexp: "#3b6f79",
    number: "#a8633f",
    functionCall: "#7c4a8b",
    function: "#7c4a8b",
    method: "#8a4f75",
    constructor: "#7a6a2d",
    type: "#7a6a2d",
    class: "#7a6a2d",
    interface: "#7a6a2d",
    namespace: "#7a6a2d",
    constant: "#3b6f79",
    enum: "#3b6f79",
    property: "#8a4f75",
    field: "#8a4f75",
    attribute: "#8a4f75",
    tag: "#8f5a3a",
    operator: "#5f554e",
    punctuation: "#8f7f70",
    delimiter: "#8f7f70",
    punctuationSpecial: "#706257",
    heading: "#3f352f",
    heading1: "#8f5a3a",
    heading2: "#7c4a8b",
    heading3: "#3b6f79",
    heading4: "#7a6a2d",
    heading5: "#557a4d",
    heading6: "#8a4f75",
    strong: "#241d19",
    italic: "#6d6158",
    strikethrough: "#9f8f7f",
    raw: "#a8633f",
    list: "#8f5a3a",
    link: "#2f5f8f",
    linkLabel: "#7c4a8b",
    linkUrl: "#2f5f8f",
  },
  colors: {
    background: "#efe7da",
    chipSelectedFocusedBg: "#5d4a3e",
    chipSelectedBlurBg: "#8f7e6f",
    chipEnabledBg: "#e6dac7",
    chipDisabledBg: "#ebe1d2",
    chipSelectedFg: "#fdf9f2",
    chipEnabledFg: "#4a3d34",
    chipDisabledFg: "#a59484",
    dividerBg: "#cdbda6",
    dividerFg: "#3f352f",
    collapsedBg: "#e4d8c5",
    collapsedFg: "#6d5f53",
    codeLineNumberFg: "#9b8a79",
    uncommittedSignColor: "#3f8d53",
    agentRowFg: "#3f352f",
    agentRowSelectedBg: "#e8ddcb",
    agentRowSelectedFg: "#2e2621",
    agentRowCursorBg: "#c7895f",
    agentRowCursorFg: "#231b16",
    agentMessageBg: "#e9decd",
    agentMessageFg: "#4a3d34",
    emptyStateFg: "#9b8a79",
    modalBorderColor: "#bfae97",
    modalBackgroundColor: "#efe7da",
    modalTitleColor: "#3f352f",
    modalSectionTitleColor: "#4f4035",
    modalShortcutKeyColor: "#7c4a8b",
    modalShortcutDescriptionColor: "#4f4035",
    searchStatusColor: "#6f4f37",
    searchInputBg: "#f0e7d9",
    searchInputFocusedBg: "#eadfcd",
    searchInputText: "#3f352f",
    searchInputFocusedText: "#2e2621",
    searchInputSelectionBg: "#dfcfba",
    searchInputSelectionFg: "#2e2621",
    searchSelectedRowBg: "#e8ddcb",
    searchSelectedRowFg: "#2e2621",
    searchRowFg: "#4a3d34",
    searchFileKindColor: "#2f5f8f",
    searchFunctionKindColor: "#7c4a8b",
    searchVariableKindColor: "#8f5a3a",
    searchClassKindColor: "#7a6a2d",
    searchTypeKindColor: "#3b6f79",
    searchHeadingKindColor: "#8a4f75",
    searchFallbackKindColor: "#8f7f70",
    promptOverlayBg: "#e9decd",
    promptInputBg: "#f0e7d9",
    promptInputFocusedBg: "#eadfcd",
    promptPrefixFg: "#5d4a3e",
    promptTextFg: "#3f352f",
    promptFocusedTextFg: "#2e2621",
    promptSelectionBg: "#dfcfba",
    promptSelectionFg: "#2e2621",
    promptChipBg: "#e7dbc8",
    promptChipFg: "#4a3d34",
    promptChipActiveBg: "#5d4a3e",
    promptChipActiveFg: "#fdf9f2",
    cursorLineBg: "#eadfcf",
    selectionLineBg: "#e9decd",
    highlightedTextColor: "#221c17",
    statusDraftBg: "#e6d8ef",
    statusRunningBg: "#d8e5f2",
    statusCompletedBg: "#d6ead7",
    statusFailedBg: "#f1d9de",
  },
};

/** Theme singleton used by all renderers to keep UI colors consistent. */
export class ThemeManager {
  private static instance: ThemeManager | null = null;
  private readonly themes: ThemeDefinition[];
  private readonly syntaxStyleCache = new Map<string, SyntaxStyle>();
  private currentThemeIndex = 0;

  private constructor() {
    this.themes = [VAGUE_THEME, OPENCODE_THEME, TOKYO_NIGHT_THEME, WHITE_SEPIA_LIGHT_THEME];
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
    if (!current) {
      throw new Error(`Theme index out of range: ${this.currentThemeIndex}`);
    }
    return current;
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
