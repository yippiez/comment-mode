import { BoxRenderable, TextAttributes, TextRenderable, type CliRenderer } from "@opentui/core";
import { SHORTCUTS_SECTIONS } from "../shortcuts";
import { theme } from "../theme";
import { clearChildren } from "../ui-utils";

type HelpModalOptions = {
  onDismiss: () => void;
};

export class HelpModal {
  private readonly renderer: CliRenderer;
  private readonly overlay: BoxRenderable;
  private readonly topbar: BoxRenderable;
  private readonly body: BoxRenderable;
  private readonly backText: TextRenderable;
  private readonly titleText: TextRenderable;

  constructor(renderer: CliRenderer, options: HelpModalOptions) {
    this.renderer = renderer;
    this.overlay = new BoxRenderable(renderer, {
      id: "help-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "stretch",
      zIndex: 1000,
      visible: false,
    });

    this.topbar = new BoxRenderable(renderer, {
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
        options.onDismiss();
      },
    });
    this.backText = new TextRenderable(renderer, {
      content: "←",
      attributes: TextAttributes.BOLD,
    });
    backButton.add(this.backText);
    this.topbar.add(backButton);

    this.titleText = new TextRenderable(renderer, {
      content: "Shortcuts",
      attributes: TextAttributes.BOLD,
    });
    this.topbar.add(this.titleText);

    this.body = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      gap: 0,
    });

    this.overlay.add(this.topbar);
    this.overlay.add(this.body);
    this.renderBody();
    this.applyTheme();
  }

  public get renderable(): BoxRenderable {
    return this.overlay;
  }

  public get isVisible(): boolean {
    return this.overlay.visible;
  }

  public show(): void {
    this.overlay.visible = true;
    this.overlay.requestRender();
  }

  public hide(): void {
    this.overlay.visible = false;
    this.overlay.requestRender();
  }

  public toggle(): void {
    if (this.overlay.visible) {
      this.hide();
      return;
    }
    this.show();
  }

  /** Re-applies help-page colors and re-renders rows for active theme. */
  public applyTheme(): void {
    this.overlay.backgroundColor = theme.getModalBackgroundColor();
    this.topbar.backgroundColor = theme.getPromptOverlayBackgroundColor();
    this.body.backgroundColor = theme.getModalBackgroundColor();
    this.backText.fg = theme.getModalShortcutKeyColor();
    this.titleText.fg = theme.getModalTitleColor();
    this.renderBody();
    this.overlay.requestRender();
  }

  /** Renders full-page help content body. */
  private renderBody(): void {
    clearChildren(this.body);
    const contentWidth = Math.max(24, this.renderer.width - 2);
    const keyColumnWidth = Math.min(14, Math.max(8, Math.floor(contentWidth * 0.24)));

    for (const [sectionIndex, section] of SHORTCUTS_SECTIONS.entries()) {
      const sectionBox = new BoxRenderable(this.renderer, {
        width: "100%",
        flexDirection: "column",
        gap: 0,
      });

      const sectionHeader = new BoxRenderable(this.renderer, {
        width: "100%",
        backgroundColor: theme.getDividerBackgroundColor(),
        paddingLeft: 1,
        paddingRight: 1,
      });
      sectionHeader.add(
        new TextRenderable(this.renderer, {
          content: section.title,
          fg: theme.getDividerForegroundColor(),
          attributes: TextAttributes.BOLD,
        }),
      );
      sectionBox.add(sectionHeader);

      for (const entry of section.entries) {
        const row = new BoxRenderable(this.renderer, {
          width: "100%",
          flexDirection: "row",
          paddingLeft: 1,
          paddingRight: 1,
        });
        row.add(
          new TextRenderable(this.renderer, {
            content: entry.keys.padEnd(keyColumnWidth),
            fg: theme.getModalShortcutKeyColor(),
            attributes: TextAttributes.BOLD,
            width: keyColumnWidth,
            overflow: "hidden",
            truncate: true,
            wrapMode: "none",
          }),
        );
        row.add(
          new TextRenderable(this.renderer, {
            content: entry.description,
            fg: theme.getModalShortcutDescriptionColor(),
            width: "100%",
            wrapMode: "word",
          }),
        );
        sectionBox.add(row);
      }

      this.body.add(sectionBox);
      if (sectionIndex < SHORTCUTS_SECTIONS.length - 1) {
        this.body.add(new TextRenderable(this.renderer, { content: "" }));
      }
    }
  }
}
