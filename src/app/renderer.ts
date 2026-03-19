import {
    BoxRenderable,
    ScrollBoxRenderable,
    TextAttributes,
    TextRenderable,
    type CliRenderer,
} from "@opentui/core";
import type { PromptTarget } from "../controllers/prompt";
import type { Cursor } from "../controllers/cursor";
import type { AppStateStore } from "../controllers/state";
import type { Highlight } from "../controllers/highlight";
import type { AgentUpdate, BlockKind, CodeFileEntry, FocusMode } from "../types";
import type { LineModel } from "../line_model";
import type { PromptComposerBar, PromptComposerLayout } from "./components/prompt_composer_bar";
import type { FileExplorer } from "./components/file_explorer";
import type { AgentTimeline } from "./components/agent_timeline";
import type { DocumentBlocks } from "./components/document_blocks";
import type { VirtualCodeBlocks } from "./virtual_code_blocks";
import { theme } from "../theme";
import { clamp } from "../utils/math";
import { clearChildren, makeSlashLine } from "../utils/ui";
import { renderTypeChips } from "../utils/chips";
import { resolveBlockKindPenalty } from "../utils/restore";
import { normalizePersistedLineText } from "../utils/text";
import { resolvePromptComposerLayout as resolvePromptComposerLayoutForSelection } from "./selection";

type GroupChipDescriptor = {
  id: string;
  name: string;
};

type RestoreLineReference = {
  globalLine: number;
  filePath: string | null;
  fileLine: number | null;
  lineText: string | null;
  blockKind: BlockKind | null;
  agentUpdateId: string | null;
  agentLineOffset: number | null;
};

type CursorRestorePoint = {
  cursor: RestoreLineReference;
  visualMode: boolean;
  anchor: RestoreLineReference | null;
};

type RestoreLineCandidateScore = {
  blockKindPenalty: number;
  fileLineDistance: number;
  globalLineDistance: number;
  globalLine: number;
};

type RenderContentOptions = {
  cursorTargetFilePath?: string;
  preferFirstAnchor?: boolean;
};

type AppRendererOptions = {
  renderer: CliRenderer;
  root: BoxRenderable;
  chipsRow: BoxRenderable;
  scrollbox: ScrollBoxRenderable;
  promptComposer: PromptComposerBar;
  state: AppStateStore;
  cursor: Cursor;
  lineModel: LineModel;
  visualHighlights: Highlight;
  fileExplorer: FileExplorer;
  virtualCodeBlocks: VirtualCodeBlocks;
  agentTimeline: AgentTimeline;
  documentBlocks: DocumentBlocks;
  getEntries: () => CodeFileEntry[];
  getSortedTypes: () => readonly string[];
  getGroupChips: () => readonly GroupChipDescriptor[];
  getTypeCounts: (type: string) => { shown: number; hidden: number };
  isTypeEnabled: (type: string) => boolean;
  getFocusMode: () => FocusMode;
  onChipSelected: (index: number) => void;
  onToggleSelectedChip: () => void;
  getUpdatesForFile: (filePath: string) => AgentUpdate[];
  scheduleFileContentLoad: (entry: CodeFileEntry) => void;
  isPromptVisible: () => boolean;
  refreshPromptView: () => void;
};

export class AppRenderer {
    private readonly renderer: CliRenderer;
    private readonly root: BoxRenderable;
    private readonly chipsRow: BoxRenderable;
    private readonly scrollbox: ScrollBoxRenderable;
    private readonly promptComposer: PromptComposerBar;
    private readonly state: AppStateStore;
    private readonly cursor: Cursor;
    private readonly lineModel: LineModel;
    private readonly visualHighlights: Highlight;
    private readonly fileExplorer: FileExplorer;
    private readonly virtualCodeBlocks: VirtualCodeBlocks;
    private readonly agentTimeline: AgentTimeline;
    private readonly documentBlocks: DocumentBlocks;
    private readonly getEntries: () => CodeFileEntry[];
    private readonly getSortedTypes: () => readonly string[];
    private readonly getGroupChips: () => readonly GroupChipDescriptor[];
    private readonly getTypeCounts: (type: string) => { shown: number; hidden: number };
    private readonly isTypeEnabled: (type: string) => boolean;
    private readonly getFocusMode: () => FocusMode;
    private readonly onChipSelected: (index: number) => void;
    private readonly onToggleSelectedChip: () => void;
    private readonly getUpdatesForFile: (filePath: string) => AgentUpdate[];
    private readonly scheduleFileContentLoad: (entry: CodeFileEntry) => void;
    private readonly isPromptVisible: () => boolean;
    private readonly refreshPromptView: () => void;

    private dividerByFilePath = new Map<string, TextRenderable>();

    constructor(options: AppRendererOptions) {
        this.renderer = options.renderer;
        this.root = options.root;
        this.chipsRow = options.chipsRow;
        this.scrollbox = options.scrollbox;
        this.promptComposer = options.promptComposer;
        this.state = options.state;
        this.cursor = options.cursor;
        this.lineModel = options.lineModel;
        this.visualHighlights = options.visualHighlights;
        this.fileExplorer = options.fileExplorer;
        this.virtualCodeBlocks = options.virtualCodeBlocks;
        this.agentTimeline = options.agentTimeline;
        this.documentBlocks = options.documentBlocks;
        this.getEntries = options.getEntries;
        this.getSortedTypes = options.getSortedTypes;
        this.getGroupChips = options.getGroupChips;
        this.getTypeCounts = options.getTypeCounts;
        this.isTypeEnabled = options.isTypeEnabled;
        this.getFocusMode = options.getFocusMode;
        this.onChipSelected = options.onChipSelected;
        this.onToggleSelectedChip = options.onToggleSelectedChip;
        this.getUpdatesForFile = options.getUpdatesForFile;
        this.scheduleFileContentLoad = options.scheduleFileContentLoad;
        this.isPromptVisible = options.isPromptVisible;
        this.refreshPromptView = options.refreshPromptView;
    }

    public applyTheme(): void {
        this.root.backgroundColor = theme.getBackgroundColor();
        this.chipsRow.backgroundColor = theme.getBackgroundColor();
        this.scrollbox.backgroundColor = theme.getBackgroundColor();
        this.promptComposer.applyTheme();
        this.root.requestRender();
    }

    public renderAll(options: RenderContentOptions = {}): void {
        this.applyTheme();
        this.renderChips();
        this.renderContent(options);
        this.applyLineHighlights();
        if (this.isPromptVisible()) {
            this.refreshPromptView();
        }
        this.root.requestRender();
    }

    public renderChips(): void {
        this.state.chipWindowStartIndex = renderTypeChips({
            renderer: this.renderer,
            chipsRow: this.chipsRow,
            sortedTypes: this.getSortedTypes(),
            groupChips: this.getGroupChips(),
            selectedChipIndex: this.state.selectedChipIndex,
            chipWindowStartIndex: this.state.chipWindowStartIndex,
            chipsFocused: this.getFocusMode() === "chips",
            getTypeCounts: this.getTypeCounts,
            isTypeEnabled: this.isTypeEnabled,
            onChipSelected: this.onChipSelected,
            onToggleSelectedChip: this.onToggleSelectedChip,
        });
    }

    public renderContent(options: RenderContentOptions = {}): void {
        const entries = this.getEntries();
        const restorePoint = this.captureCursorRestorePoint();
        this.documentBlocks.beginRender();

        try {
            clearChildren(this.scrollbox);
            this.lineModel.reset();
            this.visualHighlights.reset();
            this.dividerByFilePath = new Map();
            this.agentTimeline.resetForRender();
            this.fileExplorer.clearRows();

            if (entries.length === 0) {
                this.renderEmptyState("No code files found.");
                this.cursor.configure(0);
                return;
            }

            const filteredEntries = entries.filter((entry) => this.isTypeEnabled(entry.typeLabel));
            const virtualBlocks = this.virtualCodeBlocks.getRenderableBlocks(filteredEntries, this.isTypeEnabled);

            if (filteredEntries.length === 0 && virtualBlocks.length === 0) {
                this.renderEmptyState("No files for selected types.");
                this.cursor.configure(0);
                return;
            }

            const dividerWidth = Math.max(24, this.renderer.width);
            let nextLineNumber = 1;
            let nextDisplayRow = 0;

            for (const virtualBlock of virtualBlocks) {
                const dividerRow = nextDisplayRow;
                this.lineModel.markDivider(nextDisplayRow);
                const divider = new TextRenderable(this.renderer, {
                    width: "100%",
                    overflow: "hidden",
                    truncate: true,
                    wrapMode: "none",
                    content: makeSlashLine(virtualBlock.descriptor.title, dividerWidth),
                    fg: theme.getDividerForegroundColor(),
                    bg: theme.getDividerBackgroundColor(),
                });
                this.dividerByFilePath.set(virtualBlock.descriptor.anchorPath, divider);
                this.scrollbox.add(divider);
                nextDisplayRow += 1;

                const blockAnchorLine = nextLineNumber;
                this.virtualCodeBlocks.setAnchorLine(virtualBlock.descriptor.id, blockAnchorLine);

                if (virtualBlock.collapsed) {
                    const result = this.documentBlocks.addCollapsedPlaceholderBlock(
                        virtualBlock.descriptor.anchorPath,
                        undefined,
                        null,
                        dividerWidth,
                        1,
                        nextLineNumber,
                        nextDisplayRow,
                        "↑ virtual block collapsed ↓",
                    );
                    nextLineNumber = result.nextLineNumber;
                    nextDisplayRow = result.nextDisplayRow;
                } else if (virtualBlock.rows.length === 0) {
                    const result = this.documentBlocks.addCollapsedPlaceholderBlock(
                        virtualBlock.descriptor.anchorPath,
                        undefined,
                        0,
                        dividerWidth,
                        1,
                        nextLineNumber,
                        nextDisplayRow,
                        "↑ no files available ↓",
                    );
                    nextLineNumber = result.nextLineNumber;
                    nextDisplayRow = result.nextDisplayRow;
                } else {
                    for (const row of virtualBlock.rows) {
                        const rowResult = this.documentBlocks.addFileTreeRowBlock(
                            row,
                            nextLineNumber,
                            nextDisplayRow,
                            this.virtualCodeBlocks.getLineModelPathForRow(row),
                        );
                        nextLineNumber = rowResult.nextLineNumber;
                        nextDisplayRow = rowResult.nextDisplayRow;
                    }
                }

                const updatesForVirtualBlock = this.getUpdatesForFile(virtualBlock.descriptor.promptFilePath);
                for (const update of updatesForVirtualBlock) {
                    const agentResult = this.agentTimeline.addUpdateWithMessages(
                        update,
                        nextLineNumber,
                        nextDisplayRow,
                    );
                    nextLineNumber = agentResult.nextLineNumber;
                    nextDisplayRow = agentResult.nextDisplayRow;
                }

                if (nextLineNumber > blockAnchorLine) {
                    this.lineModel.addFileAnchor({
                        line: blockAnchorLine,
                        dividerRow,
                        filePath: virtualBlock.descriptor.anchorPath,
                    });
                }
            }

            let entryIndex = 0;
            while (entryIndex < filteredEntries.length) {
                const entry = filteredEntries[entryIndex];
                if (!entry) {
                    entryIndex += 1;
                    continue;
                }

                const collapsedGroup = this.collectConsecutiveCollapsedEntries(filteredEntries, entryIndex);
                if (collapsedGroup.length > 1) {
                    const groupedResult = this.renderCollapsedEntriesGroup(
                        collapsedGroup,
                        dividerWidth,
                        nextLineNumber,
                        nextDisplayRow,
                    );
                    nextLineNumber = groupedResult.nextLineNumber;
                    nextDisplayRow = groupedResult.nextDisplayRow;
                    entryIndex += collapsedGroup.length;
                    continue;
                }

                const updatesForFile = this.getUpdatesForFile(entry.relativePath);
                let nextUpdateIndex = 0;
                const dividerRow = nextDisplayRow;
                this.lineModel.markDivider(nextDisplayRow);
                const divider = new TextRenderable(this.renderer, {
                    width: "100%",
                    overflow: "hidden",
                    truncate: true,
                    wrapMode: "none",
                    content: makeSlashLine(entry.relativePath, dividerWidth),
                    fg: theme.getDividerForegroundColor(),
                    bg: theme.getDividerBackgroundColor(),
                });
                this.dividerByFilePath.set(entry.relativePath, divider);
                this.scrollbox.add(divider);
                nextDisplayRow += 1;
                const fileAnchorLine = nextLineNumber;

                if (this.fileExplorer.isCollapsed(entry.relativePath)) {
                    const result = this.documentBlocks.addCollapsedPlaceholderBlock(
                        entry.relativePath,
                        entry.filetype,
                        entry.isContentLoaded ? entry.lineCount : null,
                        dividerWidth,
                        1,
                        nextLineNumber,
                        nextDisplayRow,
                    );
                    nextLineNumber = result.nextLineNumber;
                    nextDisplayRow = result.nextDisplayRow;
                    while (nextUpdateIndex < updatesForFile.length) {
                        const update = updatesForFile[nextUpdateIndex];
                        if (!update) break;
                        const agentResult = this.agentTimeline.addUpdateWithMessages(
                            update,
                            nextLineNumber,
                            nextDisplayRow,
                        );
                        nextLineNumber = agentResult.nextLineNumber;
                        nextDisplayRow = agentResult.nextDisplayRow;
                        nextUpdateIndex += 1;
                    }
                } else if (!entry.isContentLoaded) {
                    this.scheduleFileContentLoad(entry);
                    const result = this.documentBlocks.addCollapsedPlaceholderBlock(
                        entry.relativePath,
                        entry.filetype,
                        null,
                        dividerWidth,
                        1,
                        nextLineNumber,
                        nextDisplayRow,
                        "↑ loading file content... ↓",
                    );
                    nextLineNumber = result.nextLineNumber;
                    nextDisplayRow = result.nextDisplayRow;
                } else {
                    const sourceLines = entry.content.split("\n");
                    let fileLineCursor = 1;
                    while (nextUpdateIndex < updatesForFile.length) {
                        const update = updatesForFile[nextUpdateIndex];
                        if (!update) break;
                        const anchorLine = clamp(update.selectionEndFileLine, 1, Math.max(1, entry.lineCount));
                        if (anchorLine >= fileLineCursor) {
                            const chunkLines = sourceLines.slice(fileLineCursor - 1, anchorLine);
                            const result = this.documentBlocks.addCodeBlock(
                                entry,
                                chunkLines.join("\n"),
                                fileLineCursor,
                                chunkLines.length,
                                nextLineNumber,
                                nextDisplayRow,
                            );
                            nextLineNumber = result.nextLineNumber;
                            nextDisplayRow = result.nextDisplayRow;
                            fileLineCursor = anchorLine + 1;
                        }

                        const agentResult = this.agentTimeline.addUpdateWithMessages(
                            update,
                            nextLineNumber,
                            nextDisplayRow,
                        );
                        nextLineNumber = agentResult.nextLineNumber;
                        nextDisplayRow = agentResult.nextDisplayRow;
                        nextUpdateIndex += 1;
                    }

                    if (fileLineCursor <= entry.lineCount) {
                        const chunkLines = sourceLines.slice(fileLineCursor - 1);
                        const result = this.documentBlocks.addCodeBlock(
                            entry,
                            chunkLines.join("\n"),
                            fileLineCursor,
                            chunkLines.length,
                            nextLineNumber,
                            nextDisplayRow,
                        );
                        nextLineNumber = result.nextLineNumber;
                        nextDisplayRow = result.nextDisplayRow;
                    }
                }

                while (nextUpdateIndex < updatesForFile.length) {
                    const update = updatesForFile[nextUpdateIndex];
                    if (!update) break;
                    const agentResult = this.agentTimeline.addUpdateWithMessages(
                        update,
                        nextLineNumber,
                        nextDisplayRow,
                    );
                    nextLineNumber = agentResult.nextLineNumber;
                    nextDisplayRow = agentResult.nextDisplayRow;
                    nextUpdateIndex += 1;
                }

                if (nextLineNumber > fileAnchorLine) {
                    this.lineModel.addFileAnchor({ line: fileAnchorLine, dividerRow, filePath: entry.relativePath });
                }

                entryIndex += 1;
            }

            this.lineModel.setTotalLines(nextLineNumber - 1);
            const pendingPath = this.fileExplorer.consumePendingCodeTargetPath();
            const preferredAnchorPath = options.preferFirstAnchor
                ? this.lineModel.getFileAnchor(0)?.filePath
                : undefined;
            const targetPath = options.cursorTargetFilePath ?? pendingPath ?? preferredAnchorPath;
            const targetAnchor = targetPath ? this.lineModel.getFileAnchorByPath(targetPath) : undefined;
            if (targetAnchor) {
                this.cursor.configureWithTarget(this.lineModel.totalLines, targetAnchor.line, "keep");
            } else {
                const restoreTarget = this.resolveCursorRestoreTarget(restorePoint);
                this.cursor.configureWithTarget(
                    this.lineModel.totalLines,
                    restoreTarget.cursorLine,
                    "keep",
                    restoreTarget.visualAnchorLine,
                );
            }
            if (this.isPromptVisible()) {
                this.refreshPromptView();
            }
        } finally {
            this.documentBlocks.endRender();
        }
    }

    private collectConsecutiveCollapsedEntries(
        entries: readonly CodeFileEntry[],
        startIndex: number,
    ): CodeFileEntry[] {
        const groupedEntries: CodeFileEntry[] = [];
        for (let index = startIndex; index < entries.length; index += 1) {
            const entry = entries[index];
            if (!entry) break;
            if (!this.fileExplorer.isCollapsed(entry.relativePath)) break;
            groupedEntries.push(entry);
        }

        return groupedEntries;
    }

    private renderCollapsedEntriesGroup(
        groupedEntries: readonly CodeFileEntry[],
        dividerWidth: number,
        nextLineNumber: number,
        nextDisplayRow: number,
    ): { nextLineNumber: number; nextDisplayRow: number } {
        const firstEntry = groupedEntries[0];
        if (!firstEntry) {
            return {
                nextLineNumber,
                nextDisplayRow,
            };
        }

        const groupedPaths = groupedEntries.map((entry) => entry.relativePath);
        const groupExpanded = this.fileExplorer.isCollapsedGroupExpanded(groupedPaths);

        const dividerRow = nextDisplayRow;
        this.lineModel.markDivider(nextDisplayRow);
        const divider = new TextRenderable(this.renderer, {
            width: "100%",
            overflow: "hidden",
            truncate: true,
            wrapMode: "none",
            content: makeSlashLine(
                `${groupExpanded ? "^" : "v"} ${groupedEntries.length} collapsed files`,
                dividerWidth,
            ),
            fg: theme.getDividerForegroundColor(),
            bg: theme.getDividerBackgroundColor(),
        });
        this.dividerByFilePath.set(firstEntry.relativePath, divider);
        this.scrollbox.add(divider);
        nextDisplayRow += 1;
        const fileAnchorLine = nextLineNumber;

        const result = this.documentBlocks.addCollapsedPlaceholderBlock(
            firstEntry.relativePath,
            undefined,
            null,
            dividerWidth,
            1,
            nextLineNumber,
            nextDisplayRow,
            groupExpanded
                ? `^ ${groupedEntries.length} collapsed files (select one and press c)`
                : `v ${groupedEntries.length} collapsed files (press c to list)`,
        );
        this.fileExplorer.setCollapsedGroupAtLine(result.blockStartLine, groupedPaths);
        nextLineNumber = result.nextLineNumber;
        nextDisplayRow = result.nextDisplayRow;

        if (groupExpanded) {
            for (const entry of groupedEntries) {
                const collapsedItemResult = this.documentBlocks.addCollapsedPlaceholderBlock(
                    entry.relativePath,
                    entry.filetype,
                    entry.isContentLoaded ? entry.lineCount : null,
                    dividerWidth,
                    1,
                    nextLineNumber,
                    nextDisplayRow,
                    `- ${entry.relativePath}`,
                );
                nextLineNumber = collapsedItemResult.nextLineNumber;
                nextDisplayRow = collapsedItemResult.nextDisplayRow;

                const updatesForFile = this.getUpdatesForFile(entry.relativePath);
                for (const update of updatesForFile) {
                    const agentResult = this.agentTimeline.addUpdateWithMessages(
                        update,
                        nextLineNumber,
                        nextDisplayRow,
                    );
                    nextLineNumber = agentResult.nextLineNumber;
                    nextDisplayRow = agentResult.nextDisplayRow;
                }
            }
        }

        if (!groupExpanded) {
            for (const entry of groupedEntries) {
                const updatesForFile = this.getUpdatesForFile(entry.relativePath);
                for (const update of updatesForFile) {
                    const agentResult = this.agentTimeline.addUpdateWithMessages(
                        update,
                        nextLineNumber,
                        nextDisplayRow,
                    );
                    nextLineNumber = agentResult.nextLineNumber;
                    nextDisplayRow = agentResult.nextDisplayRow;
                }
            }
        }

        if (nextLineNumber > fileAnchorLine) {
            this.lineModel.addFileAnchor({ line: fileAnchorLine, dividerRow, filePath: firstEntry.relativePath });
        }

        return {
            nextLineNumber,
            nextDisplayRow,
        };
    }

    public getViewportHeight(): number {
        return Math.max(
            1,
            this.scrollbox.viewport.height || this.scrollbox.height || this.renderer.height - 2,
        );
    }

    public getMaxScrollTop(): number {
        const measuredRows = this.scrollbox.scrollHeight;
        const mappedRows = this.lineModel.mappedDisplayRowCount;
        const totalRows = Math.max(measuredRows, mappedRows);
        return Math.max(0, totalRows - this.getViewportHeight());
    }

    public resolvePromptComposerLayout(
        target: PromptTarget | null,
        fallbackAnchorLine: number | null,
    ): PromptComposerLayout {
        return resolvePromptComposerLayoutForSelection({
            target,
            fallbackAnchorLine,
            lineModel: this.lineModel,
            cursorLine: this.cursor.cursorLine,
            scrollboxY: this.scrollbox.y,
            scrollTop: this.scrollbox.scrollTop,
            viewportHeight: this.getViewportHeight(),
        });
    }

    public applyLineHighlights(): void {
        const { start: selectionStart, end: selectionEnd } = this.cursor.selectionRange;
        const cursorLine = this.cursor.cursorLine;
        this.visualHighlights.apply(
            this.lineModel.blocks,
            selectionStart,
            selectionEnd,
            cursorLine,
            this.cursor.isVisualModeEnabled,
        );
        this.agentTimeline.applyHighlights(selectionStart, selectionEnd, cursorLine);
    }

    public getAnchorDividerDisplayRow(anchor: { filePath: string; dividerRow: number }): number {
        const divider = this.dividerByFilePath.get(anchor.filePath);
        if (!divider) return anchor.dividerRow;

        const resolved = divider.y - this.scrollbox.content.y;
        if (!Number.isFinite(resolved)) return anchor.dividerRow;
        return Math.max(0, Math.round(resolved));
    }

    private renderEmptyState(message: string): void {
        clearChildren(this.scrollbox);
        this.scrollbox.add(
            new TextRenderable(this.renderer, {
                content: message,
                fg: theme.getEmptyStateColor(),
                attributes: TextAttributes.DIM,
            }),
        );
    }

    private captureCursorRestorePoint(): CursorRestorePoint {
        const cursorReference = this.captureRestoreLineReference(this.cursor.cursorLine);
        if (!this.cursor.isVisualModeEnabled) {
            return {
                cursor: cursorReference,
                visualMode: false,
                anchor: null,
            };
        }

        const { start, end } = this.cursor.selectionRange;
        const anchorGlobalLine = this.cursor.cursorLine === start ? end : start;
        return {
            cursor: cursorReference,
            visualMode: true,
            anchor: this.captureRestoreLineReference(anchorGlobalLine),
        };
    }

    private captureRestoreLineReference(globalLine: number): RestoreLineReference {
        const lineInfo = this.lineModel.getVisibleLineInfo(globalLine);
        const blockKind = lineInfo?.blockKind ?? null;
        const agentUpdateId =
      blockKind === "agent" ? this.agentTimeline.getUpdateIdAtLine(globalLine) ?? null : null;
        const promptLine =
      agentUpdateId !== null ? this.agentTimeline.getPromptLineForUpdateId(agentUpdateId) : undefined;

        return {
            globalLine,
            filePath: lineInfo?.filePath ?? null,
            fileLine: lineInfo?.fileLine ?? null,
            lineText: lineInfo?.text ?? null,
            blockKind,
            agentUpdateId,
            agentLineOffset: typeof promptLine === "number" ? Math.max(0, globalLine - promptLine) : null,
        };
    }

    private resolveCursorRestoreTarget(restorePoint: CursorRestorePoint): {
    cursorLine: number;
    visualAnchorLine?: number;
  } {
        const cursorLine = this.resolveGlobalLineForRestore(restorePoint.cursor);
        if (!restorePoint.visualMode) {
            return { cursorLine };
        }

        const anchorReference = restorePoint.anchor ?? restorePoint.cursor;
        return {
            cursorLine,
            visualAnchorLine: this.resolveGlobalLineForRestore(anchorReference),
        };
    }

    private resolveGlobalLineForRestore(reference: RestoreLineReference): number {
        const totalLines = this.lineModel.totalLines;
        if (totalLines <= 0) {
            return 1;
        }

        const stickyAgentLine = this.resolveAgentLineForRestore(reference);
        if (typeof stickyAgentLine === "number") {
            return stickyAgentLine;
        }

        const filePath = reference.filePath;
        if (!filePath) {
            return clamp(reference.globalLine, 1, totalLines);
        }

        const firstLineInFile = this.lineModel.findFirstGlobalLineForFilePath(filePath);
        if (typeof firstLineInFile !== "number") {
            return clamp(reference.globalLine, 1, totalLines);
        }

        const preferredFileLine = typeof reference.fileLine === "number" ? reference.fileLine : null;
        const normalizedLineText = normalizePersistedLineText(reference.lineText);

        if (preferredFileLine !== null) {
            const mappedByLine = this.lineModel.findGlobalLineForFileLine(filePath, preferredFileLine);
            if (typeof mappedByLine === "number") {
                if (normalizedLineText === null) {
                    return mappedByLine;
                }

                const mappedText = normalizePersistedLineText(
                    this.lineModel.getVisibleLineInfo(mappedByLine)?.text ?? null,
                );
                if (mappedText === normalizedLineText) {
                    return mappedByLine;
                }
            }
        }

        if (normalizedLineText !== null) {
            const matchedByText = this.findClosestLineByText(
                filePath,
                normalizedLineText,
                preferredFileLine,
                reference.globalLine,
                reference.blockKind,
            );
            if (typeof matchedByText === "number") {
                return matchedByText;
            }
        }

        if (preferredFileLine !== null) {
            const closestByFileLine = this.findClosestLineByFileLine(
                filePath,
                preferredFileLine,
                reference.globalLine,
                reference.blockKind,
            );
            if (typeof closestByFileLine === "number") {
                return closestByFileLine;
            }
        }

        return firstLineInFile;
    }

    private resolveAgentLineForRestore(reference: RestoreLineReference): number | undefined {
        if (!reference.agentUpdateId) return undefined;
        const range = this.agentTimeline.getLineRangeForUpdateId(reference.agentUpdateId);
        if (!range) return undefined;
        const offset = reference.agentLineOffset ?? 0;
        return clamp(range.start + offset, range.start, range.end);
    }

    private findClosestLineByText(
        filePath: string,
        normalizedLineText: string,
        preferredFileLine: number | null,
        preferredGlobalLine: number,
        preferredBlockKind: BlockKind | null,
    ): number | undefined {
        let bestLine: number | undefined;
        let bestScore: RestoreLineCandidateScore | undefined;

        for (const block of this.lineModel.blocks) {
            if (block.filePath !== filePath) continue;

            for (let offset = 0; offset < block.renderedLines.length; offset += 1) {
                const candidateText = normalizePersistedLineText(block.renderedLines[offset] ?? null);
                if (candidateText !== normalizedLineText) continue;

                const candidateGlobalLine = block.lineStart + offset;
                const candidateFileLine = block.fileLineStart === null ? null : block.fileLineStart + offset;
                const score = this.buildRestoreLineCandidateScore(
                    block.blockKind,
                    candidateFileLine,
                    candidateGlobalLine,
                    preferredBlockKind,
                    preferredFileLine,
                    preferredGlobalLine,
                );
                if (!this.isBetterRestoreLineCandidate(score, bestScore)) continue;
                bestScore = score;
                bestLine = candidateGlobalLine;
            }
        }

        return bestLine;
    }

    private findClosestLineByFileLine(
        filePath: string,
        preferredFileLine: number,
        preferredGlobalLine: number,
        preferredBlockKind: BlockKind | null,
    ): number | undefined {
        let bestLine: number | undefined;
        let bestScore: RestoreLineCandidateScore | undefined;

        for (const block of this.lineModel.blocks) {
            if (block.filePath !== filePath) continue;
            if (block.fileLineStart === null) continue;

            const blockLength = Math.max(1, block.lineEnd - block.lineStart + 1);
            for (let offset = 0; offset < blockLength; offset += 1) {
                const candidateGlobalLine = block.lineStart + offset;
                const candidateFileLine = block.fileLineStart + offset;
                const score = this.buildRestoreLineCandidateScore(
                    block.blockKind,
                    candidateFileLine,
                    candidateGlobalLine,
                    preferredBlockKind,
                    preferredFileLine,
                    preferredGlobalLine,
                );
                if (!this.isBetterRestoreLineCandidate(score, bestScore)) continue;
                bestScore = score;
                bestLine = candidateGlobalLine;
            }
        }

        return bestLine;
    }

    private buildRestoreLineCandidateScore(
        candidateBlockKind: BlockKind,
        candidateFileLine: number | null,
        candidateGlobalLine: number,
        preferredBlockKind: BlockKind | null,
        preferredFileLine: number | null,
        preferredGlobalLine: number,
    ): RestoreLineCandidateScore {
        return {
            blockKindPenalty: resolveBlockKindPenalty(candidateBlockKind, preferredBlockKind),
            fileLineDistance:
        typeof preferredFileLine === "number" && typeof candidateFileLine === "number"
            ? Math.abs(candidateFileLine - preferredFileLine)
            : typeof preferredFileLine === "number"
                ? Number.MAX_SAFE_INTEGER
                : 0,
            globalLineDistance: Math.abs(candidateGlobalLine - preferredGlobalLine),
            globalLine: candidateGlobalLine,
        };
    }

    private isBetterRestoreLineCandidate(
        candidate: RestoreLineCandidateScore,
        currentBest: RestoreLineCandidateScore | undefined,
    ): boolean {
        if (!currentBest) return true;
        if (candidate.blockKindPenalty !== currentBest.blockKindPenalty) {
            return candidate.blockKindPenalty < currentBest.blockKindPenalty;
        }
        if (candidate.fileLineDistance !== currentBest.fileLineDistance) {
            return candidate.fileLineDistance < currentBest.fileLineDistance;
        }
        if (candidate.globalLineDistance !== currentBest.globalLineDistance) {
            return candidate.globalLineDistance < currentBest.globalLineDistance;
        }
        return candidate.globalLine < currentBest.globalLine;
    }
}