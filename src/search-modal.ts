import {
  BoxRenderable,
  InputRenderable,
  KeyEvent,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import type { CodeFileEntry } from "./types";
import { clamp, clearChildren } from "./ui-utils";
import { buildSearchIndex, querySearchIndex, type SearchResult, type SearchResultKind } from "./search-index";

type SearchModalControllerOptions = {
  onSelectResult: (result: SearchResult) => void;
};

export class SearchModalController {
  private readonly renderer: CliRenderer;
  private readonly onSelectResult: (result: SearchResult) => void;
  private readonly overlay: BoxRenderable;
  private readonly panel: BoxRenderable;
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
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "transparent",
      zIndex: 950,
      visible: false,
    });

    this.panel = new BoxRenderable(renderer, {
      width: "80%",
      maxWidth: 96,
      maxHeight: "85%",
      border: true,
      borderStyle: "single",
      borderColor: "#475569",
      padding: 1,
      backgroundColor: "#020617",
      flexDirection: "column",
      gap: 1,
    });
    this.panel.add(
      new TextRenderable(renderer, {
        content: "Search Files + Symbols",
        fg: "#f8fafc",
        attributes: TextAttributes.BOLD,
      }),
    );

    this.queryInput = new InputRenderable(renderer, {
      width: "100%",
      value: "",
      placeholder: "Type to search files, functions, variables, headings...",
      backgroundColor: "#0f172a",
      focusedBackgroundColor: "#111827",
      textColor: "#e2e8f0",
      focusedTextColor: "#f8fafc",
      selectionBg: "#334155",
      selectionFg: "#f8fafc",
    });
    this.queryInput.focusable = false;
    this.queryInput.onContentChange = () => {
      this.query = this.queryInput.value;
      this.updateResults();
      this.renderResults();
    };
    this.panel.add(this.queryInput);

    this.statusText = new TextRenderable(renderer, {
      content: "",
      fg: "#93c5fd",
    });
    this.panel.add(this.statusText);

    this.resultsBox = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      gap: 0,
    });
    this.panel.add(this.resultsBox);

    this.overlay.add(this.panel);
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
    this.statusText.content = `${String(this.results.length)} result(s)`;
  }

  private renderResults(): void {
    clearChildren(this.resultsBox);

    if (this.results.length === 0) {
      this.resultsBox.add(
        new TextRenderable(this.renderer, {
          content: "No matches",
          fg: "#64748b",
          attributes: TextAttributes.DIM,
        }),
      );
      this.overlay.requestRender();
      return;
    }

    for (const [index, result] of this.results.entries()) {
      const selected = index === this.selectedIndex;
      const row = new BoxRenderable(this.renderer, {
        width: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
        backgroundColor: selected ? "#1e293b" : "transparent",
      });

      const location =
        result.kind === "file" ? result.filePath : `${result.name} — ${result.filePath}:${String(result.fileLine)}`;
      row.add(
        new TextRenderable(this.renderer, {
          content: location,
          fg: selected ? "#f8fafc" : "#cbd5e1",
          width: "82%",
          overflow: "hidden",
          truncate: true,
          wrapMode: "none",
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

      this.resultsBox.add(row);
    }

    this.overlay.requestRender();
  }

  private getKindColor(kind: SearchResultKind): string {
    switch (kind) {
      case "file":
        return "#38bdf8";
      case "function":
        return "#22c55e";
      case "variable":
        return "#f59e0b";
      case "class":
        return "#a78bfa";
      case "type":
        return "#f472b6";
      case "heading":
        return "#60a5fa";
      default:
        return "#cbd5e1";
    }
  }

  private selectCurrentResult(): void {
    const result = this.results[this.selectedIndex];
    if (!result) return;
    this.close();
    this.onSelectResult(result);
  }
}
