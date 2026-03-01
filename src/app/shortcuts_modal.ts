import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core";
import { theme } from "../theme";
import { truncateLeftLabel } from "../utils/text";
import { clearChildren } from "../utils/ui";

type ShortcutItem = {
  keys: string;
  description: string;
};

type ShortcutSection = {
  title: string;
  shortcuts: readonly ShortcutItem[];
};

const SHORTCUT_SECTIONS: readonly ShortcutSection[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: "?", description: "Toggle this shortcuts modal" },
      { keys: "q", description: "Quit application" },
      { keys: "t", description: "Cycle theme" },
      { keys: "s", description: "Save current state as group or update selected group" },
      { keys: "Tab", description: "Switch focus between code and chips" },
    ],
  },
  {
    title: "Code Navigation",
    shortcuts: [
      { keys: "j / Down", description: "Move cursor down" },
      { keys: "k / Up", description: "Move cursor up" },
      { keys: "PgDn", description: "Move cursor down by one page" },
      { keys: "PgUp", description: "Move cursor up by one page" },
      { keys: "gg", description: "Jump to top" },
      { keys: "G", description: "Jump to bottom" },
      { keys: "n", description: "Jump to next file" },
      { keys: "p", description: "Jump to previous file" },
      { keys: "a", description: "Jump to next agent update" },
      { keys: "Enter", description: "Open file/directory or open prompt" },
      { keys: "Backspace", description: "Go to parent directory" },
      { keys: "c", description: "Collapse/expand current structure" },
      { keys: "i", description: "Ignore current file from view" },
      { keys: "r", description: "Reset chips, collapse, and ignore" },
      { keys: "e", description: "Open current location in $EDITOR" },
      { keys: "x", description: "Delete agent update at cursor" },
    ],
  },
  {
    title: "Selection",
    shortcuts: [
      { keys: "v", description: "Toggle visual selection mode" },
      { keys: "Esc", description: "Exit visual selection mode" },
      { keys: "y", description: "Copy selected text to clipboard" },
    ],
  },
  {
    title: "Type Chips Focus",
    shortcuts: [
      { keys: "Left / Right", description: "Move selected chip" },
      { keys: "Space", description: "Toggle selected type chip" },
      { keys: "Enter", description: "Toggle selected type chip or apply selected group" },
      { keys: "x", description: "Delete selected group chip" },
    ],
  },
  {
    title: "Group Naming",
    shortcuts: [
      { keys: "Enter", description: "Confirm group name" },
      { keys: "Esc", description: "Keep generated name" },
      { keys: "Ctrl+V / Ctrl+Shift+V", description: "Paste clipboard into group name" },
    ],
  },
  {
    title: "Prompt",
    shortcuts: [
      { keys: "Esc", description: "Close prompt" },
      { keys: "Tab", description: "Cycle prompt field" },
      { keys: "Enter", description: "Submit prompt or move between fields" },
      { keys: "Ctrl+V / Ctrl+Shift+V", description: "Paste clipboard into prompt input" },
      { keys: "Model: Left/Up", description: "Previous model" },
      { keys: "Model: Right/Down", description: "Next model" },
      { keys: "Model: r", description: "Refresh model list" },
      { keys: "Thinking: Left/Up", description: "Previous reasoning level" },
      { keys: "Thinking: Right/Down", description: "Next reasoning level" },
    ],
  },
];

export class ShortcutsModal {
  private readonly renderer: CliRenderer;
  private readonly overlay: BoxRenderable;
  private readonly panel: BoxRenderable;
  private readonly title: TextRenderable;
  private readonly hint: TextRenderable;
  private readonly content: ScrollBoxRenderable;

  constructor(renderer: CliRenderer) {
    this.renderer = renderer;

    this.overlay = new BoxRenderable(renderer, {
      id: "shortcuts-modal-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
      padding: 1,
      zIndex: 1000,
      visible: false,
      backgroundColor: theme.getTransparentColor(),
    });

    this.panel = new BoxRenderable(renderer, {
      width: 72,
      height: 24,
      maxWidth: "100%",
      maxHeight: "100%",
      flexDirection: "column",
      gap: 1,
      paddingTop: 1,
      paddingBottom: 1,
      paddingLeft: 1,
      paddingRight: 1,
      border: true,
      borderColor: theme.getModalBorderColor(),
      backgroundColor: theme.getModalBackgroundColor(),
    });

    this.title = new TextRenderable(renderer, {
      content: "Keyboard shortcuts",
      attributes: TextAttributes.BOLD,
      fg: theme.getModalTitleColor(),
    });

    this.hint = new TextRenderable(renderer, {
      content: "Press ? or Esc to close",
      fg: theme.getModalShortcutDescriptionColor(),
      attributes: TextAttributes.DIM,
    });

    this.content = new ScrollBoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      verticalScrollbarOptions: { visible: false },
      horizontalScrollbarOptions: { visible: false },
      backgroundColor: theme.getModalBackgroundColor(),
    });

    this.panel.add(this.title);
    this.panel.add(this.hint);
    this.panel.add(this.content);
    this.overlay.add(this.panel);

    this.refreshLayout();
  }

  public get renderable(): BoxRenderable {
    return this.overlay;
  }

  public get isVisible(): boolean {
    return this.overlay.visible;
  }

  public setVisible(visible: boolean): void {
    this.overlay.visible = visible;
    if (visible) {
      this.refreshLayout();
      this.content.scrollTo(0);
    }
    this.overlay.requestRender();
  }

  public toggle(): void {
    this.setVisible(!this.overlay.visible);
  }

  public refreshLayout(): void {
    const panelWidth = Math.max(46, Math.min(104, this.renderer.width - 6));
    const panelHeight = Math.max(10, Math.min(34, this.renderer.height - 4));
    this.panel.width = panelWidth;
    this.panel.height = panelHeight;
    this.renderShortcuts();
    this.overlay.requestRender();
  }

  public applyTheme(): void {
    this.overlay.backgroundColor = theme.getTransparentColor();
    this.panel.backgroundColor = theme.getModalBackgroundColor();
    this.panel.borderColor = theme.getModalBorderColor();
    this.title.fg = theme.getModalTitleColor();
    this.hint.fg = theme.getModalShortcutDescriptionColor();
    this.content.backgroundColor = theme.getModalBackgroundColor();
    this.renderShortcuts();
    this.overlay.requestRender();
  }

  public scrollByLines(delta: number): void {
    if (!this.overlay.visible) return;
    const nextTop = Math.max(0, this.content.scrollTop + delta);
    this.content.scrollTo(nextTop);
    this.overlay.requestRender();
  }

  public scrollByPage(delta: number): void {
    if (!this.overlay.visible) return;
    const step = Math.max(1, this.content.viewport.height || this.content.height || 1);
    this.scrollByLines(step * delta);
  }

  private renderShortcuts(): void {
    clearChildren(this.content);

    const keyColumnWidth = this.computeKeyColumnWidth();
    const descriptionWidth = Math.max(16, this.getContentWidth() - keyColumnWidth - 3);

    SHORTCUT_SECTIONS.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        this.content.add(new TextRenderable(this.renderer, { content: "" }));
      }

      this.content.add(
        new TextRenderable(this.renderer, {
          content: section.title,
          fg: theme.getModalSectionTitleColor(),
          attributes: TextAttributes.BOLD,
        }),
      );

      for (const shortcut of section.shortcuts) {
        const row = new BoxRenderable(this.renderer, {
          width: "100%",
          flexDirection: "row",
          gap: 1,
          backgroundColor: theme.getModalBackgroundColor(),
        });

        row.add(
          new TextRenderable(this.renderer, {
            width: keyColumnWidth,
            content: truncateLeftLabel(shortcut.keys, keyColumnWidth),
            fg: theme.getModalShortcutKeyColor(),
            attributes: TextAttributes.BOLD,
            overflow: "hidden",
            truncate: true,
            wrapMode: "none",
          }),
        );

        row.add(
          new TextRenderable(this.renderer, {
            width: descriptionWidth,
            content: truncateLeftLabel(shortcut.description, descriptionWidth),
            fg: theme.getModalShortcutDescriptionColor(),
            overflow: "hidden",
            truncate: true,
            wrapMode: "none",
          }),
        );

        this.content.add(row);
      }
    });
  }

  private computeKeyColumnWidth(): number {
    const widths = SHORTCUT_SECTIONS.flatMap((section) =>
      section.shortcuts.map((shortcut) => shortcut.keys.length),
    );
    const maxWidth = widths.length > 0 ? Math.max(...widths) : 12;
    return Math.max(12, Math.min(24, maxWidth));
  }

  private getContentWidth(): number {
    const panelWidth = typeof this.panel.width === "number" ? this.panel.width : this.renderer.width;
    return Math.max(24, panelWidth - 6);
  }
}
