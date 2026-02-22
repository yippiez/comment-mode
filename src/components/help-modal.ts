import { BoxRenderable, TextAttributes, TextRenderable, type CliRenderer } from "@opentui/core";
import { SHORTCUTS_SECTIONS } from "../shortcuts";

type HelpModalOptions = {
  onDismiss: () => void;
};

export class HelpModal {
  private readonly overlay: BoxRenderable;

  constructor(renderer: CliRenderer, options: HelpModalOptions) {
    this.overlay = new BoxRenderable(renderer, {
      id: "help-overlay",
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "transparent",
      zIndex: 1000,
      visible: false,
      onMouseDown: () => {
        options.onDismiss();
      },
    });

    const panel = new BoxRenderable(renderer, {
      width: "80%",
      maxWidth: 88,
      border: true,
      borderStyle: "single",
      borderColor: "#9ca3af",
      padding: 1,
      backgroundColor: "#000000",
      flexDirection: "column",
    });

    panel.add(
      new TextRenderable(renderer, {
        content: "Shortcuts",
        fg: "#ffffff",
        attributes: TextAttributes.BOLD,
      }),
    );

    for (const section of SHORTCUTS_SECTIONS) {
      panel.add(new TextRenderable(renderer, { content: "" }));
      panel.add(
        new TextRenderable(renderer, {
          content: section.title,
          fg: "#ffffff",
          attributes: TextAttributes.BOLD,
        }),
      );

      for (const entry of section.entries) {
        const row = new BoxRenderable(renderer, {
          flexDirection: "row",
          width: "100%",
        });

        row.add(
          new TextRenderable(renderer, {
            content: entry.keys.padEnd(12),
            fg: "#a855f7",
            attributes: TextAttributes.BOLD,
          }),
        );

        row.add(
          new TextRenderable(renderer, {
            content: entry.description,
            fg: "#ffffff",
          }),
        );

        panel.add(row);
      }
    }

    this.overlay.add(panel);
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
}
