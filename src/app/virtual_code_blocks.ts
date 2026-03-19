import type { SupplementalTypeState } from "../controllers/state";
import type { CodeFileEntry } from "../types";
import { FileExplorer } from "./file_explorer";
import type { FileTreeRow } from "./view_modes";

export type VirtualCodeBlockId = "FILE";

export type VirtualCodeBlockDescriptor = {
  id: VirtualCodeBlockId;
  title: string;
  typeLabel: string;
  typePriority: number;
  anchorPath: string;
  promptFilePath: string;
};

export type VirtualCodeBlockRenderModel = {
  descriptor: VirtualCodeBlockDescriptor;
  collapsed: boolean;
  rows: FileTreeRow[];
};

const FILE_BLOCK_DESCRIPTOR: VirtualCodeBlockDescriptor = {
    id: FileExplorer.FILE_PAGE_ID,
    title: "FILE",
    typeLabel: FileExplorer.FILE_PAGE_TYPE_LABEL,
    typePriority: FileExplorer.FILE_PAGE_PRIORITY,
    anchorPath: FileExplorer.FILE_PAGE_ANCHOR_PATH,
    promptFilePath: ".",
};

export class VirtualCodeBlocks {
    private readonly descriptors: readonly VirtualCodeBlockDescriptor[] = [FILE_BLOCK_DESCRIPTOR];

    constructor(private readonly fileExplorer: FileExplorer) {}

    public getSupplementalTypes(): SupplementalTypeState[] {
        return this.descriptors.map((descriptor) => ({
            typeLabel: descriptor.typeLabel,
            typePriority: descriptor.typePriority,
            count: 1,
        }));
    }

    public getRenderableBlocks(
        entries: readonly CodeFileEntry[],
        isTypeEnabled: (typeLabel: string) => boolean,
    ): VirtualCodeBlockRenderModel[] {
        const blocks: VirtualCodeBlockRenderModel[] = [];
        for (const descriptor of this.descriptors) {
            if (!isTypeEnabled(descriptor.typeLabel)) continue;
            if (descriptor.id !== FileExplorer.FILE_PAGE_ID) continue;

            this.fileExplorer.ensureDirectoryVisible(entries);
            blocks.push({
                descriptor,
                collapsed: this.fileExplorer.isFilePageCollapsed(),
                rows: this.fileExplorer.buildRows(entries),
            });
        }
        return blocks.sort((a, b) => a.descriptor.typePriority - b.descriptor.typePriority);
    }

    public getDefaultAnchorPath(): string {
        return this.descriptors[0]?.anchorPath ?? FileExplorer.FILE_PAGE_ANCHOR_PATH;
    }

    public getDefaultPromptFilePath(): string {
        return this.descriptors[0]?.promptFilePath ?? ".";
    }

    public setAnchorLine(blockId: VirtualCodeBlockId, line: number): void {
        if (blockId !== FileExplorer.FILE_PAGE_ID) return;
        this.fileExplorer.setFilePageAnchorLine(line);
    }

    public setFileBlockCollapsed(collapsed: boolean): void {
        this.fileExplorer.setFilePageCollapsed(collapsed);
    }

    public toggleFileBlockCollapseAtLine(line: number): boolean {
        if (!this.isLineInFileBlock(line)) return false;
        this.fileExplorer.toggleFilePageCollapsed();
        return true;
    }

    public isLineInFileBlock(line: number): boolean {
        if (this.fileExplorer.getRowAtLine(line)) return true;
        return this.fileExplorer.getFilePageAnchorLine() === line;
    }

    public getRowAtLine(line: number): FileTreeRow | undefined {
        return this.fileExplorer.getRowAtLine(line);
    }

    public getRowsByLine(): ReadonlyMap<number, FileTreeRow> {
        return this.fileExplorer.getRowsByLine();
    }

    public getLineModelPathForRow(row: FileTreeRow): string {
        const safePath = row.path.length > 0 ? row.path : "__root__";
        return `${FILE_BLOCK_DESCRIPTOR.anchorPath}/${row.kind}/${safePath}`;
    }

    public openAtLine(line: number): { openedFilePath?: string; enteredDirectory: boolean } {
        const row = this.fileExplorer.getRowAtLine(line);
        if (!row) return { enteredDirectory: false };
        if (row.kind === "dir") {
            const enteredDirectory = this.fileExplorer.enterCurrentDirectoryAtLine(line);
            return { enteredDirectory };
        }

        this.fileExplorer.openFile(row.filePath);
        return {
            openedFilePath: row.filePath,
            enteredDirectory: false,
        };
    }

    public enterDirectoryAtLine(line: number): boolean {
        return this.fileExplorer.enterCurrentDirectoryAtLine(line);
    }

    public goToParentDirectoryForLine(line: number): boolean {
        if (!this.isLineInFileBlock(line)) return false;
        return this.fileExplorer.goToParentDirectory();
    }

    public resolveEditorTargetAtLine(line: number): { filePath: string; fileLine: number } | null {
        const row = this.fileExplorer.getRowAtLine(line);
        if (!row) return null;
        const filePath = row.filePath.length > 0 ? row.filePath : ".";
        return { filePath, fileLine: 1 };
    }
}
