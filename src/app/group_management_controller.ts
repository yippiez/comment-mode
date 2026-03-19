import type { PersistedUiGroup } from "../groups";
import type { PersistedUiState } from "../persistence";
import type { AppKeyInput } from "../types";
import { GroupNameModal } from "./group_name_modal";

type GroupManagementControllerOptions = {
  initialGroups: readonly PersistedUiGroup[];
  groupNameModal: GroupNameModal;
  onPersistedGroupsChanged?: (groups: PersistedUiGroup[]) => void;
  getTypeChipCount: () => number;
  getSelectedChipIndex: () => number;
  setSelectedChipIndex: (index: number) => void;
  getPersistenceSnapshot: () => PersistedUiState;
  applyPersistedUiState: (state: PersistedUiState) => void;
  recomputeTypesState: () => void;
  renderChips: () => void;
  renderAll: () => void;
  restorePersistedCursorState: () => void;
};

export class GroupManagementController {
    private readonly options: GroupManagementControllerOptions;
    private readonly groupNameModal: GroupNameModal;
    private groups: PersistedUiGroup[];
    private pendingGroupNameGroupId: string | null = null;

    constructor(options: GroupManagementControllerOptions) {
        this.options = options;
        this.groupNameModal = options.groupNameModal;
        this.groups = this.cloneGroups(options.initialGroups);
    }

    public getGroups(): readonly PersistedUiGroup[] {
        return this.groups;
    }

    public getGroupChipDescriptors(): Array<{ id: string; name: string }> {
        return this.groups.map((group) => ({
            id: group.id,
            name: group.name,
        }));
    }

    public getSelectedGroup(): PersistedUiGroup | null {
        const groupIndex = this.options.getSelectedChipIndex() - this.options.getTypeChipCount();
        if (groupIndex < 0 || groupIndex >= this.groups.length) {
            return null;
        }
        return this.groups[groupIndex] ?? null;
    }

    public saveOrUpdateSelectedGroup(): void {
        const selectedGroup = this.getSelectedGroup();
        if (selectedGroup) {
            this.updateGroupSnapshot(selectedGroup.id);
            return;
        }
        this.createGroupFromCurrentState();
    }

    public deleteSelectedGroup(): void {
        const selectedIndex = this.options.getSelectedChipIndex();
        const groupIndex = selectedIndex - this.options.getTypeChipCount();
        if (groupIndex < 0 || groupIndex >= this.groups.length) return;

        const removedGroup = this.groups[groupIndex];
        if (!removedGroup) return;
        this.groups.splice(groupIndex, 1);

        if (this.pendingGroupNameGroupId === removedGroup.id) {
            this.pendingGroupNameGroupId = null;
            this.groupNameModal.close();
        }

        this.options.recomputeTypesState();
        const chipCount = this.options.getTypeChipCount() + this.groups.length;
        this.options.setSelectedChipIndex(chipCount <= 0 ? 0 : Math.min(selectedIndex, chipCount - 1));
        this.notifyGroupsChanged();
        this.options.renderChips();
    }

    public applyGroupSnapshot(groupId: string): void {
        const group = this.getGroupById(groupId);
        if (!group) return;

        this.options.applyPersistedUiState(group.snapshot);
        this.selectGroupChipById(group.id);
        this.options.renderAll();
        this.options.restorePersistedCursorState();
    }

    public submitName(): void {
        if (!this.groupNameModal.isVisible) return;

        const groupId = this.pendingGroupNameGroupId;
        this.pendingGroupNameGroupId = null;
        const requestedName = this.groupNameModal.getName();
        this.groupNameModal.close();

        if (!groupId) return;

        if (requestedName.length > 0) {
            const groupIndex = this.groups.findIndex((group) => group.id === groupId);
            const group = groupIndex >= 0 ? this.groups[groupIndex] : null;
            if (group) {
                const uniqueName = this.ensureUniqueGroupName(requestedName, groupId);
                if (group.name !== uniqueName) {
                    this.groups[groupIndex] = {
                        ...group,
                        name: uniqueName,
                        updatedAt: new Date().toISOString(),
                    };
                    this.notifyGroupsChanged();
                }
            }
        }

        this.selectGroupChipById(groupId);
        this.options.renderChips();
    }

    public cancelName(): void {
        if (!this.groupNameModal.isVisible) return;
        this.pendingGroupNameGroupId = null;
        this.groupNameModal.close();
        this.options.renderChips();
    }

    public handleGroupNameInputKey(key: AppKeyInput): boolean {
        return this.groupNameModal.handleInputKey(key);
    }

    private cloneGroups(groups: readonly PersistedUiGroup[]): PersistedUiGroup[] {
        const seenIds = new Set<string>();
        const normalized: PersistedUiGroup[] = [];

        for (let index = 0; index < groups.length; index += 1) {
            const source = groups[index];
            if (!source) continue;

            let id = typeof source.id === "string" ? source.id.trim() : "";
            if (id.length === 0 || seenIds.has(id)) {
                id = crypto.randomUUID();
            }
            seenIds.add(id);

            const rawName = typeof source.name === "string" ? source.name.trim() : "";
            const name = rawName.length > 0 ? rawName : `group-${index + 1}`;
            const now = new Date().toISOString();
            const createdAt = toIsoTimestamp(source.createdAt, now);
            const updatedAt = toIsoTimestamp(source.updatedAt, createdAt);

            normalized.push({
                id,
                name,
                snapshot: source.snapshot,
                createdAt,
                updatedAt,
            });
        }

        return normalized;
    }

    private getGroupById(groupId: string): PersistedUiGroup | null {
        return this.groups.find((group) => group.id === groupId) ?? null;
    }

    private selectGroupChipById(groupId: string): void {
        const groupIndex = this.groups.findIndex((group) => group.id === groupId);
        if (groupIndex < 0) return;
        this.options.setSelectedChipIndex(this.options.getTypeChipCount() + groupIndex);
    }

    private createGroupFromCurrentState(): void {
        const snapshot = this.options.getPersistenceSnapshot();
        const now = new Date().toISOString();
        const group: PersistedUiGroup = {
            id: crypto.randomUUID(),
            name: this.generateDefaultGroupName(),
            snapshot,
            createdAt: now,
            updatedAt: now,
        };

        this.groups = [...this.groups, group];
        this.options.recomputeTypesState();
        this.selectGroupChipById(group.id);
        this.notifyGroupsChanged();
        this.options.renderChips();

        this.pendingGroupNameGroupId = group.id;
        this.groupNameModal.open(group.name);
    }

    private updateGroupSnapshot(groupId: string): void {
        const groupIndex = this.groups.findIndex((group) => group.id === groupId);
        if (groupIndex < 0) return;

        const currentGroup = this.groups[groupIndex];
        if (!currentGroup) return;

        this.groups[groupIndex] = {
            ...currentGroup,
            snapshot: this.options.getPersistenceSnapshot(),
            updatedAt: new Date().toISOString(),
        };

        this.selectGroupChipById(groupId);
        this.notifyGroupsChanged();
        this.options.renderChips();
    }

    private generateDefaultGroupName(): string {
        const existingNames = new Set(this.groups.map((group) => group.name.toLowerCase()));
        let index = 1;
        while (existingNames.has(`group-${index}`)) {
            index += 1;
        }
        return `group-${index}`;
    }

    private ensureUniqueGroupName(candidateName: string, excludedGroupId?: string): string {
        const trimmed = candidateName.replace(/\s+/g, " ").trim();
        const baseName = trimmed.length > 0 ? trimmed : "group";
        const usedNames = new Set(
            this.groups
                .filter((group) => group.id !== excludedGroupId)
                .map((group) => group.name.toLowerCase()),
        );

        if (!usedNames.has(baseName.toLowerCase())) {
            return baseName;
        }

        let suffix = 2;
        while (usedNames.has(`${baseName}-${suffix}`.toLowerCase())) {
            suffix += 1;
        }
        return `${baseName}-${suffix}`;
    }

    private notifyGroupsChanged(): void {
        if (!this.options.onPersistedGroupsChanged) return;
        this.options.onPersistedGroupsChanged(this.cloneGroups(this.groups));
    }
}

function toIsoTimestamp(value: unknown, fallback: string): string {
    if (typeof value !== "string") return fallback;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return fallback;
    return new Date(parsed).toISOString();
}
