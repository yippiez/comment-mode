import type { CodeFileEntry, ViewMode } from "../types";
import { buildCodePromptSelection, filterCodeModeEntries } from "./code";
import { buildFileTreeRows, buildFilesClipboardText, buildFilesPromptSelection, filterFilesModeEntries } from "./files";
import { buildSignaturesPromptSelection, extractSignatureBlocks, filterSignaturesModeEntries } from "./signatures";
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
    label: "CODE",
    chipColors: { bg: "#2563eb", fg: "#f8fafc" },
    supportsDiff: true,
    emptyStateMessage: "No files for selected types.",
    filterEntries: filterCodeModeEntries,
    buildPromptSelection: buildCodePromptSelection,
  },
  {
    id: "signatures",
    label: "SIGNATURES",
    chipColors: { bg: "#7c3aed", fg: "#f8fafc" },
    supportsDiff: false,
    emptyStateMessage: "No signature-eligible files.",
    filterEntries: filterSignaturesModeEntries,
    buildPromptSelection: buildSignaturesPromptSelection,
  },
  {
    id: "files",
    label: "FILES",
    chipColors: { bg: "#eab308", fg: "#111827" },
    supportsDiff: false,
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

  public supportsDiff(mode: ViewMode): boolean {
    return this.getPlugin(mode).supportsDiff;
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

export { buildFileTreeRows, extractSignatureBlocks };
export type { FileTreeRow, ModeSelectionLineInfo, ViewModePlugin };
