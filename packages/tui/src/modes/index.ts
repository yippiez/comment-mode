import type { CodeFileEntry, ViewMode } from "../types";
import { buildCodePromptSelection, filterCodeModeEntries } from "./code";
import { buildFileTreeRows, buildFilesClipboardText, buildFilesPromptSelection, filterFilesModeEntries } from "./files";
import type {
  FileTreeRow,
  ModeClipboardContext,
  ModePromptContext,
  ModePromptSelection,
  ModeSelectionLineInfo,
  ViewModePlugin,
} from "./types";

const MODE_PLUGINS: readonly ViewModePlugin[] = [
  {
    id: "code",
    emptyStateMessage: "No files for selected types.",
    filterEntries: filterCodeModeEntries,
    buildPromptSelection: buildCodePromptSelection,
  },
  {
    id: "files",
    emptyStateMessage: "No files for selected types.",
    filterEntries: filterFilesModeEntries,
    buildPromptSelection: buildFilesPromptSelection,
    buildClipboardText: buildFilesClipboardText,
  },
];

class ModeRegistry {
  private index = 0;

  public getAllModes(): readonly ViewModePlugin[] {
    return MODE_PLUGINS;
  }

  public getMode(): ViewMode {
    return MODE_PLUGINS[this.index]?.id ?? "code";
  }

  public setMode(mode: ViewMode): ViewMode {
    const nextIndex = MODE_PLUGINS.findIndex((entry) => entry.id === mode);
    if (nextIndex >= 0) {
      this.index = nextIndex;
    }
    return this.getMode();
  }

  public switchMode(): ViewMode {
    this.index = (this.index + 1) % MODE_PLUGINS.length;
    return this.getMode();
  }

  public getPlugin(mode: ViewMode): ViewModePlugin {
    const plugin = MODE_PLUGINS.find((entry) => entry.id === mode);
    if (plugin) return plugin;
    const fallback = MODE_PLUGINS[0];
    if (!fallback) {
      throw new Error("No view mode plugins registered.");
    }
    return fallback;
  }

  public filterEntries(mode: ViewMode, entries: readonly CodeFileEntry[]): CodeFileEntry[] {
    return this.getPlugin(mode).filterEntries(entries);
  }

  public getEmptyStateMessage(mode: ViewMode): string {
    return this.getPlugin(mode).emptyStateMessage;
  }

  public buildPromptSelection(mode: ViewMode, context: ModePromptContext): ModePromptSelection | null {
    return this.getPlugin(mode).buildPromptSelection(context);
  }

  public buildClipboardText(mode: ViewMode, context: ModeClipboardContext): string | null {
    const plugin = this.getPlugin(mode);
    if (!plugin.buildClipboardText) return null;
    return plugin.buildClipboardText(context);
  }
}

export const modes = new ModeRegistry();

export { buildFileTreeRows };
export type { FileTreeRow, ModeSelectionLineInfo, ViewModePlugin };
