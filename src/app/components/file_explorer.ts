import { ensureExplorerDirectoryVisible } from "../../controllers/state";
import { buildFileTreeRows, type FileTreeRow } from "../view_modes";
import type { CodeFileEntry } from "../../types";
import { getParentPosixPath } from "../../utils/path";

export class FileExplorer {
    public static readonly FILE_PAGE_ID = "FILE";
    public static readonly FILE_PAGE_TYPE_LABEL = "FILE";
    public static readonly FILE_PAGE_PRIORITY = -100;
    public static readonly FILE_PAGE_ANCHOR_PATH = "virtual://FILE";

    private collapsedFiles = new Set<string>();
    private collapsedGroupPathsByLine = new Map<number, readonly string[]>();
    private expandedCollapsedGroupKeys = new Set<string>();
    private directoryPath = "";
    private fileTreeRowsByLine = new Map<number, FileTreeRow>();
    private filePageCollapsed = false;
    private filePageAnchorLine: number | null = null;
    private pendingCodeTargetFilePath: string | null = null;

    public clearRows(): void {
        this.fileTreeRowsByLine = new Map();
        this.collapsedGroupPathsByLine = new Map();
        this.filePageAnchorLine = null;
    }

    public getRowsByLine(): ReadonlyMap<number, FileTreeRow> {
        return this.fileTreeRowsByLine;
    }

    public setRowAtLine(line: number, row: FileTreeRow): void {
        this.fileTreeRowsByLine.set(line, row);
    }

    public getRowAtLine(line: number): FileTreeRow | undefined {
        return this.fileTreeRowsByLine.get(line);
    }

    public setFilePageAnchorLine(line: number): void {
        this.filePageAnchorLine = line;
    }

    public getFilePageAnchorLine(): number | null {
        return this.filePageAnchorLine;
    }

    public isFilePageCollapsed(): boolean {
        return this.filePageCollapsed;
    }

    public setFilePageCollapsed(collapsed: boolean): void {
        this.filePageCollapsed = collapsed;
    }

    public getDirectoryPath(): string {
        return this.directoryPath;
    }

    public setDirectoryPath(directoryPath: string): void {
        this.directoryPath = directoryPath;
    }

    public getCollapsedFiles(): string[] {
        return [...this.collapsedFiles].sort((a, b) => a.localeCompare(b));
    }

    public setCollapsedFiles(filePaths: readonly string[]): void {
        this.collapsedFiles = new Set(filePaths.filter((filePath) => filePath.length > 0));
        this.expandedCollapsedGroupKeys = new Set();
    }

    public setCollapsedGroupAtLine(line: number, filePaths: readonly string[]): void {
        if (filePaths.length <= 1) return;
        this.collapsedGroupPathsByLine.set(line, [...filePaths]);
    }

    public getCollapsedGroupAtLine(line: number): readonly string[] | undefined {
        return this.collapsedGroupPathsByLine.get(line);
    }

    public isCollapsedGroupExpanded(filePaths: readonly string[]): boolean {
        if (filePaths.length <= 1) return false;
        return this.expandedCollapsedGroupKeys.has(this.buildCollapsedGroupKey(filePaths));
    }

    public toggleCollapsedGroupExpanded(filePaths: readonly string[]): boolean {
        if (filePaths.length <= 1) return false;
        const key = this.buildCollapsedGroupKey(filePaths);
        if (this.expandedCollapsedGroupKeys.has(key)) {
            this.expandedCollapsedGroupKeys.delete(key);
            return false;
        }

        this.expandedCollapsedGroupKeys.add(key);
        return true;
    }

    public toggleFilePageCollapsed(): boolean {
        this.filePageCollapsed = !this.filePageCollapsed;
        return this.filePageCollapsed;
    }

    public pruneCollapsedFiles(entries: readonly CodeFileEntry[]): void {
        const existing = new Set(entries.map((entry) => entry.relativePath));
        let removed = false;
        for (const filePath of this.collapsedFiles) {
            if (existing.has(filePath)) continue;
            this.collapsedFiles.delete(filePath);
            removed = true;
        }
        if (removed) {
            this.expandedCollapsedGroupKeys = new Set();
        }
    }

    public collapseAll(entries: readonly CodeFileEntry[]): void {
        this.collapsedFiles = new Set(entries.map((entry) => entry.relativePath));
        this.expandedCollapsedGroupKeys = new Set();
    }

    public expandAll(): boolean {
        const hadCollapsedFiles = this.collapsedFiles.size > 0;
        const wasFilePageCollapsed = this.filePageCollapsed;
        this.collapsedFiles = new Set();
        this.expandedCollapsedGroupKeys = new Set();
        this.filePageCollapsed = false;
        return hadCollapsedFiles || wasFilePageCollapsed;
    }

    public ensureDirectoryVisible(entries: readonly CodeFileEntry[]): void {
        this.directoryPath = ensureExplorerDirectoryVisible(entries, this.directoryPath);
    }

    public buildRows(entries: readonly CodeFileEntry[]): FileTreeRow[] {
        return buildFileTreeRows(entries, this.directoryPath);
    }

    public enterCurrentDirectoryAtLine(line: number): boolean {
        const row = this.fileTreeRowsByLine.get(line);
        if (!row || row.kind !== "dir") return false;
        this.directoryPath = row.path;
        return true;
    }

    public goToParentDirectory(): boolean {
        const parent = getParentPosixPath(this.directoryPath);
        if (parent === this.directoryPath) return false;
        this.directoryPath = parent;
        return true;
    }

    public openFile(filePath: string): void {
        this.collapsedFiles.delete(filePath);
        this.expandedCollapsedGroupKeys = new Set();
        this.pendingCodeTargetFilePath = filePath;
    }

    public consumePendingCodeTargetPath(): string | null {
        const next = this.pendingCodeTargetFilePath;
        this.pendingCodeTargetFilePath = null;
        return next;
    }

    public isCollapsed(filePath: string): boolean {
        return this.collapsedFiles.has(filePath);
    }

    public expandFile(filePath: string): boolean {
        const changed = this.collapsedFiles.delete(filePath);
        if (changed) {
            this.expandedCollapsedGroupKeys = new Set();
        }
        return changed;
    }

    public toggleCollapse(currentFilePath: string | undefined): boolean {
        if (!currentFilePath) return false;
        if (this.collapsedFiles.has(currentFilePath)) {
            this.collapsedFiles.delete(currentFilePath);
        } else {
            this.collapsedFiles.add(currentFilePath);
        }
        this.expandedCollapsedGroupKeys = new Set();
        return true;
    }

    private buildCollapsedGroupKey(filePaths: readonly string[]): string {
        return filePaths.join("\n");
    }
}
