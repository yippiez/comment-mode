import {
  BoxRenderable,
  InputRenderable,
  KeyEvent,
  ScrollBoxRenderable,
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
  onClose?: () => void;
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
  private static readonly PREVIEW_CONTEXT_LINES = 2;
  private static readonly RESULT_HEIGHT = 6;

  private readonly renderer: CliRenderer;
  private readonly onSelectResult: (result: SearchResult) => void;
  private readonly onClose?: () => void;
  private readonly overlay: BoxRenderable;
  private readonly header: BoxRenderable;
  private readonly body: BoxRenderable;
  private readonly backText: TextRenderable;
  private readonly titleText: TextRenderable;
  private readonly queryInputContainer: BoxRenderable;
  private readonly queryInputShell: BoxRenderable;
  private readonly queryInputIcon: TextRenderable;
  private readonly queryInput: InputRenderable;
  private readonly statusContainer: BoxRenderable;
  private readonly statusShell: BoxRenderable;
  private readonly statusText: TextRenderable;
  private readonly resultsBox: ScrollBoxRenderable;

  private visible = false;
  private query = "";
  private results: SearchResult[] = [];
  private selectedIndex = 0;
  private index: SearchResult[] = [];
  private fileLinesByPath = new Map<string, string[]>();

  constructor(renderer: CliRenderer, options: SearchModalControllerOptions) {
    this.renderer = renderer;
    this.onSelectResult = options.onSelectResult;
    this.onClose = options.onClose;

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
      justifyContent: "flex-start",
      alignItems: "center",
      paddingLeft: 1,
      paddingRight: 1,
      gap: 2,
    });

    const backButton = new BoxRenderable(renderer, {
      onMouseDown: () => {
        this.close();
      },
    });
    this.backText = new TextRenderable(renderer, {
      content: "←",
      attributes: TextAttributes.BOLD,
    });
    backButton.add(this.backText);
    this.header.add(backButton);
    this.titleText = new TextRenderable(renderer, {
      content: "Search",
      attributes: TextAttributes.BOLD,
    });
    this.header.add(this.titleText);

    this.body = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      gap: 1,
    });

    this.queryInputContainer = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    });

    this.queryInputShell = new BoxRenderable(renderer, {
      width: "80%",
      flexDirection: "row",
      alignItems: "center",
      paddingLeft: 1,
      paddingRight: 1,
      gap: 1,
      backgroundColor: theme.getSearchInputBackgroundColor(),
    });

    this.queryInputIcon = new TextRenderable(renderer, {
      content: "⌕",
      attributes: TextAttributes.DIM,
      fg: theme.getSearchInputTextColor(),
    });
    this.queryInputShell.add(this.queryInputIcon);

    this.queryInput = new InputRenderable(renderer, {
      flexGrow: 1,
      value: "",
      placeholder: "Type to search...",
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
    this.queryInputShell.add(this.queryInput);
    this.queryInputContainer.add(this.queryInputShell);
    this.body.add(this.queryInputContainer);

    this.statusText = new TextRenderable(renderer, {
      content: "",
      attributes: TextAttributes.BOLD,
      width: "100%",
      wrapMode: "none",
      truncate: true,
      overflow: "hidden",
    });

    this.statusContainer = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
    });
    this.statusShell = new BoxRenderable(renderer, {
      width: "80%",
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      alignItems: "center",
    });
    this.statusShell.add(this.statusText);
    this.statusContainer.add(this.statusShell);
    this.body.add(this.statusContainer);

    this.resultsBox = new ScrollBoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      gap: 0,
      verticalScrollbarOptions: { visible: false },
      horizontalScrollbarOptions: { visible: false },
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
    this.fileLinesByPath = new Map(entries.map((entry) => [entry.relativePath, entry.content.split("\n")]));
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
    if (!this.visible) return;
    this.visible = false;
    this.overlay.visible = false;
    this.queryInput.blur();
    this.overlay.requestRender();
    this.onClose?.();
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
    this.queryInputIcon.fg = theme.getSearchInputTextColor();
    this.queryInputShell.backgroundColor = theme.getSearchInputBackgroundColor();
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
    const normalizedQuery = this.query.trim();
    if (normalizedQuery.length === 0) {
      this.results = [];
      this.selectedIndex = 0;
      this.statusText.content = "";
      return;
    }

    this.results = querySearchIndex(this.index, normalizedQuery, 14);
    if (this.results.length === 0) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = clamp(this.selectedIndex, 0, this.results.length - 1);
    }
    const fileCount = this.results.filter((result) => result.kind === "file").length;
    const referenceCount = this.results.filter((result) => result.kind === "reference").length;
    this.statusText.content = `${String(this.results.length)} result(s) · ${String(fileCount)} file(s) · ${String(referenceCount)} reference(s)`;
  }

  private renderResults(): void {
    clearChildren(this.resultsBox);

    if (this.results.length === 0) {
      if (this.query.trim().length === 0) {
        this.overlay.requestRender();
        return;
      }
      this.resultsBox.add(
        new TextRenderable(this.renderer, {
          content: "No matches",
          fg: theme.getEmptyStateColor(),
          attributes: TextAttributes.DIM,
          wrapMode: "none",
          truncate: true,
          overflow: "hidden",
        }),
      );
      this.overlay.requestRender();
      return;
    }

    for (const [index, result] of this.results.entries()) {
      this.resultsBox.add(this.createResultCard(result, index));
    }

    const selectedTopRow = this.selectedIndex * SearchModalController.RESULT_HEIGHT;
    this.resultsBox.scrollTo(Math.max(0, selectedTopRow - 1));
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

  private createResultCard(result: SearchResult, index: number): BoxRenderable {
    const selected = index === this.selectedIndex;
    const card = new BoxRenderable(this.renderer, {
      width: "100%",
      height: SearchModalController.RESULT_HEIGHT,
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: selected
        ? theme.getSearchSelectedRowBackgroundColor()
        : theme.getTransparentColor(),
      paddingLeft: 1,
      paddingRight: 1,
    });

    const header = new BoxRenderable(this.renderer, {
      width: "100%",
      flexDirection: "row",
      justifyContent: "space-between",
    });
    header.add(
      new TextRenderable(this.renderer, {
        content: `${result.filePath}:${String(result.fileLine)}`,
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
    header.add(
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
    card.add(header);

    const previewLines = this.getPreviewLines(result);
    for (const previewLine of previewLines) {
      const lineNumber =
        previewLine.lineNumber === null ? "    " : String(previewLine.lineNumber).padStart(4, " ");
      card.add(
        new TextRenderable(this.renderer, {
          content: `${previewLine.isAnchor ? ">" : " "} ${lineNumber} | ${previewLine.content}`,
          fg: selected
            ? theme.getSearchSelectedRowForegroundColor()
            : theme.getSearchRowForegroundColor(),
          wrapMode: "none",
          truncate: true,
          overflow: "hidden",
          attributes: previewLine.isAnchor ? TextAttributes.BOLD : TextAttributes.NONE,
        }),
      );
    }

    return card;
  }

  private getPreviewLines(
    result: SearchResult,
  ): Array<{ lineNumber: number | null; content: string; isAnchor: boolean }> {
    const sourceLines = this.fileLinesByPath.get(result.filePath) ?? [];
    if (sourceLines.length === 0) {
      return Array.from({ length: 5 }, () => ({ lineNumber: null, content: "", isAnchor: false }));
    }

    const anchorLine = clamp(result.fileLine, 1, sourceLines.length);
    const blockHeight = SearchModalController.PREVIEW_CONTEXT_LINES * 2 + 1;
    const maxStart = Math.max(1, sourceLines.length - blockHeight + 1);
    const startLine = clamp(anchorLine - SearchModalController.PREVIEW_CONTEXT_LINES, 1, maxStart);

    const preview: Array<{ lineNumber: number | null; content: string; isAnchor: boolean }> = [];
    for (let offset = 0; offset < blockHeight; offset += 1) {
      const lineNumber = startLine + offset;
      if (lineNumber > sourceLines.length) {
        preview.push({ lineNumber: null, content: "", isAnchor: false });
        continue;
      }
      const content = (sourceLines[lineNumber - 1] ?? "").replace(/\t/g, "  ");
      preview.push({
        lineNumber,
        content,
        isAnchor: lineNumber === anchorLine,
      });
    }

    return preview;
  }
}
