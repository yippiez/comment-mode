/**
 * Review TUI shell: renders the Review Diff Feed, routes vim-ish keyboard
 * input, opens inline composers, and mounts live Agent Run widgets.
 */
import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import {
    BoxRenderable,
    TextAttributes,
    TextRenderable,
    type CliRenderer,
    type KeyEvent,
} from "@opentui/core";
import { runAgent, DEFAULT_AGENT_MODEL, type AgentRunHandle } from "../agents/runner";
import { formatAgentRunEvent, type AgentId, type AgentRunEvent, type AgentRunEventKind } from "../agents/events";
import { buildPromptContext, type PromptContext } from "../domain/prompt_context";
import {
    buildReviewDiffFeed,
    findNextHunkRow,
    nearestSelectableRow,
    resolveReviewSelection,
    type AgentRunFeedItem,
    type ReviewDiffFeed,
    type ReviewFeedRow,
    type ReviewSelection,
} from "../domain/review_diff_feed";
import { collectDiffInfo } from "../integrations/version_control/interface";

type ReviewTuiMode = "feed" | "prompt";

type RunningAgent = {
  id: string;
  context: PromptContext;
  status: AgentRunFeedItem["status"];
  lines: string[];
  handle: AgentRunHandle | null;
  lastStreamKind: AgentRunEventKind | null;
};

type DisplayRow =
  | { readonly kind: "feed"; readonly row: ReviewFeedRow; readonly rowIndex: number }
  | { readonly kind: "prompt" };

const COLORS = {
    background: "#111111",
    foreground: "#d6d6d6",
    dim: "#777777",
    header: "#f0c674",
    hunk: "#8abeb7",
    insert: "#b5bd68",
    delete: "#cc6666",
    agent: "#81a2be",
    cursorBg: "#2a2a2a",
    selectionBg: "#303850",
    promptBg: "#263238",
    error: "#f07178",
};

/** Main review-oriented TUI application. */
export class ReviewTuiApp {
    private readonly renderer: CliRenderer;
    private readonly rootDir: string;
    private readonly root: BoxRenderable;
    private readonly header: TextRenderable;
    private readonly feedViewport: BoxRenderable;
    private readonly footer: TextRenderable;
    private feed: ReviewDiffFeed | null = null;
    private cursorRow = 0;
    private visualAnchorRow: number | null = null;
    private mode: ReviewTuiMode = "feed";
    private promptText = "";
    private promptSelection: ReviewSelection | null = null;
    private selectedAgent: AgentId = "opencode";
    private model = DEFAULT_AGENT_MODEL;
    private runs: RunningAgent[] = [];
    private viewportStartRow = 0;
    private readonly rowPool: TextRenderable[] = [];
    private readonly watchedDirectories = new Map<string, FSWatcher>();
    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private renderTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingG = false;

    /** Initializes renderables for the review TUI. */
    constructor(renderer: CliRenderer, rootDir: string) {
        this.renderer = renderer;
        this.rootDir = rootDir;
        this.root = new BoxRenderable(renderer, {
            id: "review-root",
            flexGrow: 1,
            flexDirection: "column",
            backgroundColor: COLORS.background,
        });
        this.header = new TextRenderable(renderer, {
            id: "review-header",
            width: "100%",
            height: 1,
            content: "comment — loading diff...",
            fg: COLORS.header,
            bg: COLORS.background,
            attributes: TextAttributes.BOLD,
        });
        this.feedViewport = new BoxRenderable(renderer, {
            id: "review-feed-viewport",
            flexGrow: 1,
            width: "100%",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: COLORS.background,
        });
        this.footer = new TextRenderable(renderer, {
            id: "review-footer",
            width: "100%",
            height: 1,
            content: "",
            fg: COLORS.dim,
            bg: COLORS.background,
        });
        this.root.add(this.header);
        this.root.add(this.feedViewport);
        this.root.add(this.footer);
        this.renderer.root.add(this.root);
    }

    /** Starts diff loading, key handling, and workspace watching. */
    public async start(): Promise<void> {
        this.registerKeyboard();
        await this.refreshFeed();
        this.startWatchingWorkspace();
        this.render();
    }

    /** Stops child processes, timers, and workspace watchers. */
    public shutdown(): void {
        for (const run of this.runs) {
            run.handle?.stop();
        }
        this.closeWatchedDirectories();
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.renderTimer) {
            clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }
    }

    /** Reloads the Review Diff Feed from the current VCS state. */
    public async refreshFeed(): Promise<void> {
        const diffInfo = await collectDiffInfo(this.rootDir);
        this.feed = buildReviewDiffFeed(diffInfo, this.toFeedRuns());
        this.cursorRow = nearestSelectableRow(this.feed, this.cursorRow);
        this.syncWatchedDirectories();
        this.render();
    }

    /** Registers global keyboard handlers. */
    private registerKeyboard(): void {
        this.renderer.keyInput.on("keypress", (key: KeyEvent) => {
            if (this.mode === "prompt") {
                this.handlePromptKey(key);
                return;
            }
            this.handleFeedKey(key);
        });

        this.renderer.on("destroy", () => {
            this.shutdown();
        });
    }

    /** Starts lightweight watchers for the root and currently changed file directories. */
    private startWatchingWorkspace(): void {
        this.syncWatchedDirectories();
    }

    /** Synchronizes lightweight watchers without traversing the full repository. */
    private syncWatchedDirectories(): void {
        const wanted = this.watchDirectoriesForCurrentFeed();
        for (const [directory, watcher] of this.watchedDirectories.entries()) {
            if (wanted.has(directory)) { continue; }
            watcher.close();
            this.watchedDirectories.delete(directory);
        }
        for (const directory of wanted) {
            if (this.watchedDirectories.has(directory)) { continue; }
            try {
                const watcher = watch(directory, () => {
                    this.scheduleRefresh();
                });
                watcher.on("error", () => {
                    this.watchedDirectories.delete(directory);
                    this.scheduleRefresh();
                });
                this.watchedDirectories.set(directory, watcher);
            } catch {
                // Ignore directories that disappear during a refresh race.
            }
        }
    }

    /** Returns the small directory set needed to observe the active diff. */
    private watchDirectoriesForCurrentFeed(): Set<string> {
        const directories = new Set<string>([this.rootDir]);
        const feed = this.feed;
        if (!feed) { return directories; }
        for (const row of feed.rows) {
            if (!row.filePath) { continue; }
            directories.add(path.dirname(path.join(this.rootDir, row.filePath)));
        }
        return directories;
    }

    /** Closes all active lightweight file watchers. */
    private closeWatchedDirectories(): void {
        for (const watcher of this.watchedDirectories.values()) {
            watcher.close();
        }
        this.watchedDirectories.clear();
    }

    /** Schedules a debounced feed refresh. */
    private scheduleRefresh(): void {
        if (this.refreshTimer) { clearTimeout(this.refreshTimer); }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            this.refreshFeed().catch((error: unknown) => {
                this.showTransientError(toErrorMessage(error));
            });
        }, 120);
    }

    /** Handles keyboard input while browsing the feed. */
    private handleFeedKey(key: KeyEvent): void {
        const name = key.name;
        if (name === "q" || name === "escape") {
            this.renderer.destroy();
            return;
        }
        if (name === "j" || name === "down") {
            this.moveCursor(1);
            return;
        }
        if (name === "k" || name === "up") {
            this.moveCursor(-1);
            return;
        }
        if (name === "pagedown") {
            this.moveCursor(Math.max(5, this.renderer.height - 4));
            return;
        }
        if (name === "pageup") {
            this.moveCursor(-Math.max(5, this.renderer.height - 4));
            return;
        }
        if (key.raw === "G" || (name === "g" && key.shift)) {
            this.jumpBottom();
            return;
        }
        if (name === "g") {
            if (this.pendingG) {
                this.jumpTop();
                this.pendingG = false;
                return;
            }
            this.pendingG = true;
            this.schedulePendingGClear();
            return;
        }
        if (name === "n") {
            this.jumpHunk(1);
            return;
        }
        if (name === "p") {
            this.jumpHunk(-1);
            return;
        }
        if (name === "v") {
            this.toggleVisualSelection();
            return;
        }
        if (name === "r") {
            this.refreshFeed().catch((error: unknown) => {
                this.showTransientError(toErrorMessage(error));
            });
            return;
        }
        if (name === "tab") {
            this.toggleSelectedAgent();
            return;
        }
        if (name === "enter" || name === "return") {
            this.openPrompt();
        }
    }

    /** Handles keyboard input while editing the inline prompt. */
    private handlePromptKey(key: KeyEvent): void {
        if (key.name === "escape") {
            this.mode = "feed";
            this.promptText = "";
            this.promptSelection = null;
            this.render();
            return;
        }
        if (key.name === "tab") {
            this.toggleSelectedAgent();
            this.render();
            return;
        }
        if (key.name === "backspace") {
            this.promptText = this.promptText.slice(0, -1);
            this.render();
            return;
        }
        if (key.ctrl && key.name === "u") {
            this.promptText = "";
            this.render();
            return;
        }
        if (key.name === "enter" || key.name === "return") {
            this.submitPrompt();
            return;
        }
        const printable = printableKeyText(key);
        if (printable) {
            this.promptText += printable;
            this.render();
        }
    }

    /** Moves the cursor by a row delta. */
    private moveCursor(delta: number): void {
        const feed = this.feed;
        if (!feed) { return; }
        this.cursorRow = nearestSelectableRow(feed, this.cursorRow + delta);
        this.render();
    }

    /** Jumps to the first selectable feed row. */
    private jumpTop(): void {
        const feed = this.feed;
        if (!feed) { return; }
        this.cursorRow = nearestSelectableRow(feed, 0);
        this.render();
    }

    /** Jumps to the last selectable feed row. */
    private jumpBottom(): void {
        const feed = this.feed;
        if (!feed) { return; }
        this.cursorRow = nearestSelectableRow(feed, feed.rows.length - 1);
        this.render();
    }

    /** Jumps to the next or previous Diff Hunk. */
    private jumpHunk(delta: number): void {
        const feed = this.feed;
        if (!feed) { return; }
        this.cursorRow = nearestSelectableRow(feed, findNextHunkRow(feed, this.cursorRow, delta));
        this.render();
    }

    /** Toggles visual Review Selection mode. */
    private toggleVisualSelection(): void {
        this.visualAnchorRow = this.visualAnchorRow === null ? this.cursorRow : null;
        this.render();
    }

    /** Opens an Inline Composer for the current Review Selection. */
    private openPrompt(): void {
        const feed = this.feed;
        if (!feed) { return; }
        const anchor = this.visualAnchorRow ?? this.cursorRow;
        const selection = resolveReviewSelection(feed, anchor, this.cursorRow);
        if (!selection) {
            this.showTransientError("No selectable diff line under cursor.");
            return;
        }
        this.promptSelection = selection;
        this.promptText = "";
        this.mode = "prompt";
        this.visualAnchorRow = null;
        this.render();
    }

    /** Submits the Inline Composer as a new Agent Run. */
    private submitPrompt(): void {
        const selection = this.promptSelection;
        if (!selection) { return; }
        const context = buildPromptContext({
            selection,
            userPrompt: this.promptText,
            agent: this.selectedAgent,
            model: this.model,
        });
        this.mode = "feed";
        this.promptText = "";
        this.promptSelection = null;
        this.startAgentRun(context);
    }

    /** Launches an Agent Run and anchors its widget into the Review Diff Feed. */
    private startAgentRun(context: PromptContext): void {
        const run: RunningAgent = {
            id: "pending",
            context,
            status: "running",
            lines: [`prompt: ${context.userPrompt}`],
            handle: null,
            lastStreamKind: null,
        };
        const handle = runAgent({
            agent: context.agent,
            rootDir: this.rootDir,
            model: context.model,
            prompt: context.message,
            autoApproveEdits: true,
        }, {
            onEvent: (event) => {
                this.recordRunEvent(run, event);
            },
            onExit: (result) => {
                run.status = result.success ? "completed" : "failed";
                if (result.error) { run.lines.push(`error: ${result.error}`); }
                this.scheduleRefresh();
                this.scheduleRender();
            },
        });
        run.id = handle.id;
        run.handle = handle;
        this.runs.push(run);
        this.refreshFeed().catch((error: unknown) => {
            this.showTransientError(toErrorMessage(error));
        });
    }

    /** Records one normalized Agent Run Event for inline display. */
    private recordRunEvent(run: RunningAgent, event: AgentRunEvent): void {
        const text = formatAgentRunEvent(event);
        if (!text) { return; }
        if ((event.kind === "assistant_text" || event.kind === "thinking") && run.lastStreamKind === event.kind) {
            const lastIndex = run.lines.length - 1;
            run.lines[lastIndex] = `${run.lines[lastIndex] ?? ""}${text}`;
        } else {
            run.lines.push(text);
        }
        run.lastStreamKind = event.kind;
        if (run.lines.length > 64) {
            run.lines = run.lines.slice(run.lines.length - 64);
        }
        this.scheduleRender();
    }

    /** Converts running agents into Review Diff Feed widgets. */
    private toFeedRuns(): readonly AgentRunFeedItem[] {
        return this.runs.map((run) => ({
            id: run.id,
            filePath: run.context.filePath,
            startLine: run.context.startLine,
            endLine: run.context.endLine,
            agent: run.context.agent,
            model: run.context.model,
            status: run.status,
            title: `${run.context.filePath}:${run.context.startLine}-${run.context.endLine}`,
            lines: run.lines,
        }));
    }

    /** Toggles the selected Agent Adapter. */
    private toggleSelectedAgent(): void {
        this.selectedAgent = this.selectedAgent === "opencode" ? "pi" : "opencode";
        this.footer.content = this.footerText();
        this.footer.requestRender();
    }

    /** Schedules a render without redrawing for every streamed token. */
    private scheduleRender(): void {
        if (this.renderTimer) { return; }
        this.renderTimer = setTimeout(() => {
            this.renderTimer = null;
            this.render();
        }, 80);
    }

    /** Renders the visible TUI window without rebuilding every feed row. */
    private render(): void {
        const feed = this.feed;
        this.header.content = this.headerText();
        this.footer.content = this.footerText();
        const viewportHeight = this.viewportHeight();
        this.ensureRowPool(viewportHeight);

        if (!feed) {
            this.renderLoadingRows(viewportHeight);
            this.root.requestRender();
            return;
        }

        this.viewportStartRow = computeReviewViewport(feed.rows.length, this.cursorRow, viewportHeight, this.viewportStartRow);
        const displayRows = this.visibleDisplayRows(feed, viewportHeight);
        for (let poolIndex = 0; poolIndex < this.rowPool.length; poolIndex += 1) {
            const renderable = this.rowPool[poolIndex];
            const displayRow = displayRows[poolIndex];
            if (!renderable) { continue; }
            if (!displayRow) {
                this.applyBlankRow(renderable);
                continue;
            }
            if (displayRow.kind === "prompt") {
                this.applyPromptRow(renderable);
                continue;
            }
            this.applyFeedRow(renderable, displayRow.row, displayRow.rowIndex);
        }

        this.root.requestRender();
    }

    /** Returns the number of feed rows that can be displayed. */
    private viewportHeight(): number {
        return Math.max(1, this.renderer.height - 2);
    }

    /** Ensures there is one stable TextRenderable per visible terminal row. */
    private ensureRowPool(viewportHeight: number): void {
        while (this.rowPool.length < viewportHeight) {
            const renderable = new TextRenderable(this.renderer, {
                id: `review-row-${this.rowPool.length}`,
                width: "100%",
                height: 1,
                content: "",
                fg: COLORS.foreground,
                bg: COLORS.background,
                overflow: "hidden",
                truncate: true,
                wrapMode: "none",
            });
            this.feedViewport.add(renderable);
            this.rowPool.push(renderable);
        }

        while (this.rowPool.length > viewportHeight) {
            const renderable = this.rowPool.pop();
            if (renderable) { this.feedViewport.remove(renderable.id); }
        }
    }

    /** Renders loading state into the stable row pool. */
    private renderLoadingRows(viewportHeight: number): void {
        for (let index = 0; index < viewportHeight; index += 1) {
            const renderable = this.rowPool[index];
            if (!renderable) { continue; }
            if (index === 0) {
                renderable.content = "Loading...";
                renderable.fg = COLORS.dim;
                renderable.bg = COLORS.background;
                renderable.attributes = TextAttributes.NONE;
            } else {
                this.applyBlankRow(renderable);
            }
        }
    }

    /** Builds display rows for the current visible feed window. */
    private visibleDisplayRows(feed: ReviewDiffFeed, viewportHeight: number): DisplayRow[] {
        const displayRows: DisplayRow[] = [];
        const promptAfter = this.mode === "prompt" && this.promptSelection ? this.promptSelection.rowEnd : null;
        const end = Math.min(feed.rows.length, this.viewportStartRow + viewportHeight);
        for (let rowIndex = this.viewportStartRow; rowIndex < end && displayRows.length < viewportHeight; rowIndex += 1) {
            const row = feed.rows[rowIndex];
            if (row) { displayRows.push({ kind: "feed", row, rowIndex }); }
            if (promptAfter === rowIndex && displayRows.length < viewportHeight) {
                displayRows.push({ kind: "prompt" });
            }
        }
        return displayRows;
    }

    /** Applies one Review Diff Feed row to an existing TextRenderable. */
    private applyFeedRow(renderable: TextRenderable, row: ReviewFeedRow, rowIndex: number): void {
        const cursor = rowIndex === this.cursorRow ? "▶" : " ";
        const selected = this.isRowSelected(rowIndex);
        const marker = selected ? "┃" : " ";
        renderable.content = `${cursor}${marker} ${row.text}`;
        renderable.fg = rowColor(row);
        renderable.bg = rowBackground(rowIndex, this.cursorRow, selected);
        renderable.attributes = row.kind === "file" || row.kind === "hunk" ? TextAttributes.BOLD : TextAttributes.NONE;
    }

    /** Applies the active Inline Composer row to an existing TextRenderable. */
    private applyPromptRow(renderable: TextRenderable): void {
        renderable.content = `   ✎ ${this.selectedAgent} ${this.model} > ${this.promptText}_`;
        renderable.fg = COLORS.foreground;
        renderable.bg = COLORS.promptBg;
        renderable.attributes = TextAttributes.BOLD;
    }

    /** Clears one pooled row. */
    private applyBlankRow(renderable: TextRenderable): void {
        renderable.content = "";
        renderable.fg = COLORS.foreground;
        renderable.bg = COLORS.background;
        renderable.attributes = TextAttributes.NONE;
    }

    /** Checks whether a feed row is in the active visual selection. */
    private isRowSelected(rowIndex: number): boolean {
        if (this.visualAnchorRow === null) { return false; }
        const first = Math.min(this.visualAnchorRow, this.cursorRow);
        const last = Math.max(this.visualAnchorRow, this.cursorRow);
        return rowIndex >= first && rowIndex <= last;
    }

    /** Builds the header line. */
    private headerText(): string {
        const feed = this.feed;
        const vcs = feed ? feed.vcsType : "loading";
        const hunks = feed ? feed.hunks.length : 0;
        const runs = this.runs.filter((run) => run.status === "running").length;
        return `comment — ${vcs} review diff feed — ${hunks} hunks — ${runs} running`;
    }

    /** Builds the footer help/status line. */
    private footerText(): string {
        if (this.mode === "prompt") {
            return `Enter submit · Esc cancel · Tab agent (${this.selectedAgent}) · Ctrl-U clear · model ${this.model}`;
        }
        return `j/k move · v select · Enter prompt · n/p hunks · r refresh · Tab agent (${this.selectedAgent}) · q quit`;
    }

    /** Displays a transient footer error. */
    private showTransientError(message: string): void {
        this.footer.content = `error: ${message}`;
        this.footer.fg = COLORS.error;
        this.footer.requestRender();
        setTimeout(() => {
            this.footer.fg = COLORS.dim;
            this.footer.content = this.footerText();
            this.footer.requestRender();
        }, 1800);
    }

    /** Clears a pending `g` chord after a short delay. */
    private schedulePendingGClear(): void {
        setTimeout(() => {
            this.pendingG = false;
        }, 650);
    }
}

/** Keeps the cursor inside a virtualized Review Diff Feed viewport. */
export function computeReviewViewport(
    totalRows: number,
    cursorRow: number,
    viewportHeight: number,
    currentStart: number,
): number {
    const safeHeight = Math.max(1, viewportHeight);
    const maxStart = Math.max(0, totalRows - safeHeight);
    const clampedStart = clamp(currentStart, 0, maxStart);
    const clampedCursor = clamp(cursorRow, 0, Math.max(0, totalRows - 1));
    if (clampedCursor < clampedStart) { return clampedCursor; }
    if (clampedCursor >= clampedStart + safeHeight) {
        return clamp(clampedCursor - safeHeight + 1, 0, maxStart);
    }
    return clampedStart;
}

/** Returns the display background for cursor and selection state. */
function rowBackground(rowIndex: number, cursorRow: number, selected: boolean): string {
    if (rowIndex === cursorRow) { return COLORS.cursorBg; }
    if (selected) { return COLORS.selectionBg; }
    return COLORS.background;
}

/** Returns the display color for a row kind. */
function rowColor(row: ReviewFeedRow): string {
    switch (row.kind) {
        case "file": return COLORS.header;
        case "hunk": return COLORS.hunk;
        case "insert": return COLORS.insert;
        case "delete": return COLORS.delete;
        case "agent": return COLORS.agent;
        case "context": return COLORS.foreground;
        case "empty": return COLORS.dim;
    }
}

/** Converts a KeyEvent into printable text for the simple Inline Composer. */
function printableKeyText(key: KeyEvent): string | null {
    if (key.ctrl || key.meta) { return null; }
    if (key.name === "space") { return " "; }
    const sequence = key.sequence;
    if (typeof sequence === "string" && sequence.length === 1 && sequence >= " ") {
        return sequence;
    }
    return null;
}

/** Converts unknown thrown values into displayable error messages. */
function toErrorMessage(error: unknown): string {
    if (error instanceof Error) { return error.message; }
    return String(error);
}

/** Clamps a number inside an inclusive range. */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
