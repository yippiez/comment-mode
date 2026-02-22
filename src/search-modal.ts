import {
  BoxRenderable,
  InputRenderable,
  KeyEvent,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { buildSearchIndex, querySearchIndex, type SearchResult, type SearchResultKind } from "./search-index";
import { theme } from "./theme";
import type { CodeFileEntry } from "./types";
import { clamp, clearChildren } from "./ui-utils";

type SearchModalControllerOptions = {
  onSelectResult: (result: SearchResult) => void;
};

type RuntimeInputStyleApi = {
  backgroundColor?: string;
  focusedBackgroundColor?: string;
  textColor?: string;
  focusedTextColor?: string;
  selectionBg?: string;
  selectionFg?: string;
};

export class SearchModalController {
  private readonly renderer: CliRenderer;
  private readonly onSelectResult: (result: SearchResult) => void;
  private readonly overlay: BoxRenderable;
  private readonly header: BoxRenderable;
  private readonly body: BoxRenderable;
  private readonly backText: TextRenderable;
  private readonly titleText: TextRenderable;
  private readonly queryInput: InputRenderable;
  private readonly statusText: TextRenderable;
  private readonly resultsBox: BoxRenderable;

  private visible = false;
  private query = "";
  private results: SearchResult[] = [];
  private selectedIndex = 0;
  private index: SearchResult[] = [];

  constructor(renderer: CliRenderer, options: SearchModalControllerOptions) {
    this.renderer = renderer;
    this.onSelectResult = options.onSelectResult;

    this.overlay = new BoxRenderable(renderer, {
      id: "search-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "stretch",
      zIndex: 950,
      visible: false,
    });

    this.header = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingLeft: 1,
      paddingRight: 1,
    });

    const backButton = new BoxRenderable(renderer, {
      onMouseDown: () => {
        this.close();
      },
    });
    this.backText = new TextRenderable(renderer, {
      content: "← Back",
      attributes: TextAttributes.BOLD,
    });
    backButton.add(this.backText);
    this.header.add(backButton);
    this.titleText = new TextRenderable(renderer, {
      content: "Search",
      attributes: TextAttributes.BOLD,
    });
    this.header.add(this.titleText);
    this.header.add(new TextRenderable(renderer, { content: "" }));

    this.body = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      gap: 1,
    });

    this.queryInput = new InputRenderable(renderer, {
      width: "100%",
      value: "",
      placeholder: "Type to search files, functions, variables, headings...",
      backgroundColor: theme.getSearchInputBackgroundColor(),
      focusedBackgroundColor: theme.getSearchInputFocusedBackgroundColor(),
      textColor: theme.getSearchInputTextColor(),
      focusedTextColor: theme.getSearchInputFocusedTextColor(),
      selectionBg: theme.getSearchInputSelectionBackgroundColor(),
      selectionFg: theme.getSearchInputSelectionForegroundColor(),
    });
    this.queryInput.focusable = false;
    this.queryInput.onContentChange = () => {
      this.query = this.queryInput.value;
      this.updateResults();
      this.renderResults();
    };
    this.body.add(this.queryInput);

    this.statusText = new TextRenderable(renderer, {
      content: "",
      attributes: TextAttributes.BOLD,
    });
    this.body.add(this.statusText);

    this.resultsBox = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      gap: 0,
    });
    this.body.add(this.resultsBox);

    this.overlay.add(this.header);
    this.overlay.add(this.body);
    this.applyTheme();
  }

  public get renderable(): BoxRenderable {
    return this.overlay;
  }

  public get isVisible(): boolean {
    return this.visible;
  }

  public setEntries(entries: readonly CodeFileEntry[]): void {
    this.index = buildSearchIndex(entries);
    if (!this.visible) return;
    this.updateResults();
    this.renderResults();
  }

  public open(): void {
    this.visible = true;
    this.query = "";
    this.selectedIndex = 0;
    this.queryInput.value = "";
    this.queryInput.focus();
    this.updateResults();
    this.renderResults();
    this.overlay.visible = true;
    this.overlay.requestRender();
  }

  public close(): void {
    this.visible = false;
    this.overlay.visible = false;
    this.queryInput.blur();
    this.overlay.requestRender();
  }

  public shutdown(): void {
    this.visible = false;
    this.overlay.visible = false;
    this.queryInput.blur();
  }

  public handleKeypress(
    keyName: string,
    key: KeyEvent,
    consumeKey: (event: KeyEvent) => void,
  ): void {
    if (keyName === "escape") {
      consumeKey(key);
      this.close();
      return;
    }

    if (keyName === "up" || keyName === "k") {
      consumeKey(key);
      this.moveSelection(-1);
      return;
    }

    if (keyName === "down" || keyName === "j") {
      consumeKey(key);
      this.moveSelection(1);
      return;
    }

    if (keyName === "pageup") {
      consumeKey(key);
      this.moveSelection(-8);
      return;
    }

    if (keyName === "pagedown") {
      consumeKey(key);
      this.moveSelection(8);
      return;
    }

    if (keyName === "return" || keyName === "enter") {
      consumeKey(key);
      this.selectCurrentResult();
      return;
    }

    const handled = this.queryInput.handleKeyPress(key);
    if (!handled) return;

    consumeKey(key);
    this.query = this.queryInput.value;
    this.updateResults();
    this.renderResults();
  }

  /** Re-applies full-page search colors for active theme. */
  public applyTheme(): void {
    this.overlay.backgroundColor = theme.getModalBackgroundColor();
    this.header.backgroundColor = theme.getPromptOverlayBackgroundColor();
    this.body.backgroundColor = theme.getModalBackgroundColor();
    this.backText.fg = theme.getModalShortcutKeyColor();
    this.titleText.fg = theme.getModalTitleColor();
    this.statusText.fg = theme.getSearchStatusColor();
    this.applyInputTheme();
    this.renderResults();
    this.overlay.requestRender();
  }

  private moveSelection(delta: number): void {
    if (this.results.length === 0) return;
    const maxIndex = this.results.length - 1;
    this.selectedIndex = clamp(this.selectedIndex + delta, 0, maxIndex);
    this.renderResults();
  }

  private updateResults(): void {
    this.results = querySearchIndex(this.index, this.query, 14);
    if (this.results.length === 0) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = clamp(this.selectedIndex, 0, this.results.length - 1);
    }
    const fileCount = this.results.filter((result) => result.kind === "file").length;
    this.statusText.content = `${String(this.results.length)} result(s) · ${String(fileCount)} file(s) first`;
  }

  private renderResults(): void {
    clearChildren(this.resultsBox);

    if (this.results.length === 0) {
      this.resultsBox.add(
        new TextRenderable(this.renderer, {
          content: "No matches",
          fg: theme.getEmptyStateColor(),
          attributes: TextAttributes.DIM,
        }),
      );
      this.overlay.requestRender();
      return;
    }

    const indexed = this.results.map((result, index) => ({ result, index }));
    const files = indexed.filter((item) => item.result.kind === "file");
    const symbols = indexed.filter((item) => item.result.kind !== "file");

    if (files.length > 0) {
      this.resultsBox.add(this.createGroupHeader("FILES"));
      for (const item of files) {
        this.resultsBox.add(this.createResultRow(item.result, item.index));
      }
    }

    if (symbols.length > 0) {
      if (files.length > 0) {
        this.resultsBox.add(new TextRenderable(this.renderer, { content: "" }));
      }
      this.resultsBox.add(this.createGroupHeader("SYMBOLS"));

      const symbolGroups = new Map<string, Array<{ result: SearchResult; index: number }>>();
      for (const item of symbols) {
        const existing = symbolGroups.get(item.result.filePath);
        if (existing) {
          existing.push(item);
          continue;
        }
        symbolGroups.set(item.result.filePath, [item]);
      }

      for (const [filePath, group] of symbolGroups.entries()) {
        this.resultsBox.add(
          new TextRenderable(this.renderer, {
            content: filePath,
            fg: theme.getEmptyStateColor(),
            attributes: TextAttributes.BOLD,
          }),
        );
        for (const item of group) {
          this.resultsBox.add(this.createResultRow(item.result, item.index, true));
        }
      }
    }

    this.overlay.requestRender();
  }

  private getKindColor(kind: SearchResultKind): string {
    return theme.getSearchKindColor(kind);
  }

  private selectCurrentResult(): void {
    const result = this.results[this.selectedIndex];
    if (!result) return;
    this.close();
    this.onSelectResult(result);
  }

  /** Applies theme colors to runtime input style fields. */
  private applyInputTheme(): void {
    const runtimeInput = this.queryInput as unknown as RuntimeInputStyleApi;
    runtimeInput.backgroundColor = theme.getSearchInputBackgroundColor();
    runtimeInput.focusedBackgroundColor = theme.getSearchInputFocusedBackgroundColor();
    runtimeInput.textColor = theme.getSearchInputTextColor();
    runtimeInput.focusedTextColor = theme.getSearchInputFocusedTextColor();
    runtimeInput.selectionBg = theme.getSearchInputSelectionBackgroundColor();
    runtimeInput.selectionFg = theme.getSearchInputSelectionForegroundColor();
  }

  /** Creates a section header row for grouped search output. */
  private createGroupHeader(label: string): TextRenderable {
    return new TextRenderable(this.renderer, {
      content: ` ${label} `,
      fg: theme.getDividerForegroundColor(),
      bg: theme.getDividerBackgroundColor(),
      attributes: TextAttributes.BOLD,
    });
  }

  /** Creates a result row with optional indentation for grouped symbol lists. */
  private createResultRow(
    result: SearchResult,
    index: number,
    indented = false,
  ): BoxRenderable {
    const selected = index === this.selectedIndex;
    const row = new BoxRenderable(this.renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: selected
        ? theme.getSearchSelectedRowBackgroundColor()
        : theme.getTransparentColor(),
      paddingLeft: indented ? 2 : 0,
    });

    const location =
      result.kind === "file"
        ? result.filePath
        : `${result.name}:${String(result.fileLine)}`;
    row.add(
      new TextRenderable(this.renderer, {
        content: location,
        fg: selected
          ? theme.getSearchSelectedRowForegroundColor()
          : theme.getSearchRowForegroundColor(),
        width: "82%",
        overflow: "hidden",
        truncate: true,
        wrapMode: "none",
        attributes: selected ? TextAttributes.BOLD : TextAttributes.NONE,
      }),
    );

    row.add(
      new TextRenderable(this.renderer, {
        content: result.kind.toUpperCase(),
        fg: this.getKindColor(result.kind),
        width: "18%",
        overflow: "hidden",
        truncate: true,
        wrapMode: "none",
        attributes: TextAttributes.BOLD,
      }),
    );

    return row;
  }
}
