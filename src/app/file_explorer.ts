import { ensureFilesModeDirectoryVisible } from "../controllers/state";
import { buildFileTreeRows, type FileTreeRow } from "./view_modes";
import type { CodeFileEntry, ViewMode } from "../types";
import { getParentPosixPath } from "../utils/path";

export class FileExplorer {
  private collapsedFiles = new Set<string>();
  private directoryPath = "";
  private fileTreeRowsByLine = new Map<number, FileTreeRow>();
  private pendingCodeTargetFilePath: string | null = null;

  public clearRows(): void {
    this.fileTreeRowsByLine = new Map();
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

  public pruneCollapsedFiles(entries: readonly CodeFileEntry[]): void {
    const existing = new Set(entries.map((entry) => entry.relativePath));
    for (const filePath of this.collapsedFiles) {
      if (existing.has(filePath)) continue;
      this.collapsedFiles.delete(filePath);
    }
  }

  public collapseAll(entries: readonly CodeFileEntry[]): void {
    this.collapsedFiles = new Set(entries.map((entry) => entry.relativePath));
  }

  public ensureDirectoryVisible(entries: readonly CodeFileEntry[]): void {
    this.directoryPath = ensureFilesModeDirectoryVisible(entries, this.directoryPath);
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

  public toggleCollapse(viewMode: ViewMode, currentFilePath: string | undefined): boolean {
    if (viewMode === "files" || !currentFilePath) return false;
    if (this.collapsedFiles.has(currentFilePath)) {
      this.collapsedFiles.delete(currentFilePath);
    } else {
      this.collapsedFiles.add(currentFilePath);
    }
    return true;
  }
}
