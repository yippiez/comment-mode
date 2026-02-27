import { ensureExplorerDirectoryVisible } from "../controllers/state";
import { buildFileTreeRows, type FileTreeRow } from "./view_modes";
import type { CodeFileEntry } from "../types";
import { getParentPosixPath } from "../utils/path";

export class FileExplorer {
  public static readonly FILE_PAGE_ID = "FILE";
  public static readonly FILE_PAGE_TYPE_LABEL = "FILE";
  public static readonly FILE_PAGE_PRIORITY = -100;
  public static readonly FILE_PAGE_ANCHOR_PATH = "virtual://FILE";

  private collapsedFiles = new Set<string>();
  private ignoredFiles = new Set<string>();
  private directoryPath = "";
  private fileTreeRowsByLine = new Map<number, FileTreeRow>();
  private filePageCollapsed = false;
  private filePageAnchorLine: number | null = null;
  private pendingCodeTargetFilePath: string | null = null;

  public clearRows(): void {
    this.fileTreeRowsByLine = new Map();
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

  public toggleFilePageCollapsed(): boolean {
    this.filePageCollapsed = !this.filePageCollapsed;
    return this.filePageCollapsed;
  }

  public pruneCollapsedFiles(entries: readonly CodeFileEntry[]): void {
    const existing = new Set(entries.map((entry) => entry.relativePath));
    for (const filePath of this.collapsedFiles) {
      if (existing.has(filePath)) continue;
      this.collapsedFiles.delete(filePath);
    }
  }

  public pruneIgnoredFiles(entries: readonly CodeFileEntry[]): void {
    const existing = new Set(entries.map((entry) => entry.relativePath));
    for (const filePath of this.ignoredFiles) {
      if (existing.has(filePath)) continue;
      this.ignoredFiles.delete(filePath);
    }
  }

  public collapseAll(entries: readonly CodeFileEntry[]): void {
    this.collapsedFiles = new Set(entries.map((entry) => entry.relativePath));
  }

  public expandAll(): boolean {
    const hadCollapsedFiles = this.collapsedFiles.size > 0;
    const wasFilePageCollapsed = this.filePageCollapsed;
    this.collapsedFiles = new Set();
    this.filePageCollapsed = false;
    return hadCollapsedFiles || wasFilePageCollapsed;
  }

  public ignoreFile(filePath: string | undefined): boolean {
    if (!filePath) return false;
    if (this.ignoredFiles.has(filePath)) return false;
    this.ignoredFiles.add(filePath);
    return true;
  }

  public isIgnored(filePath: string): boolean {
    return this.ignoredFiles.has(filePath);
  }

  public unignoreAll(): boolean {
    if (this.ignoredFiles.size === 0) return false;
    this.ignoredFiles = new Set();
    return true;
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

  public toggleCollapse(currentFilePath: string | undefined): boolean {
    if (!currentFilePath) return false;
    if (this.collapsedFiles.has(currentFilePath)) {
      this.collapsedFiles.delete(currentFilePath);
    } else {
      this.collapsedFiles.add(currentFilePath);
    }
    return true;
  }
}
