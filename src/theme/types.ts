import { SyntaxStyle } from "@opentui/core";

export type SyntaxPalette = {
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

export type ThemeColors = {
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

export type ThemeDefinition = {
  name: string;
  syntax: SyntaxPalette;
  colors: ThemeColors;
};

export function buildSyntaxStyle(palette: SyntaxPalette): SyntaxStyle {
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
