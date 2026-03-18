import { wrapIndex } from "../utils/math";

export type SelectedChipTarget =
  | { kind: "type"; type: string }
  | { kind: "group"; groupId: string };

type ChipSelectionControllerOptions = {
  getChipCount: () => number;
  getSelectedChipIndex: () => number;
  setSelectedChipIndex: (index: number) => void;
  resolveSelectedTarget: () => SelectedChipTarget | null;
  isTypeEnabled: (type: string) => boolean;
  setTypeEnabled: (type: string, enabled: boolean) => void;
  applyGroupSnapshot: (groupId: string) => void;
  renderChips: () => void;
  renderContent: () => void;
};

export class ChipSelectionController {
  private readonly options: ChipSelectionControllerOptions;

  constructor(options: ChipSelectionControllerOptions) {
    this.options = options;
  }

  public moveSelection(delta: number): void {
    const chipCount = this.options.getChipCount();
    if (chipCount === 0) return;

    const nextIndex = this.options.getSelectedChipIndex() + delta;
    this.options.setSelectedChipIndex(wrapIndex(nextIndex, chipCount));
    this.options.renderChips();
  }

  public toggleSelected(): void {
    const selectedTarget = this.options.resolveSelectedTarget();
    if (!selectedTarget) return;

    if (selectedTarget.kind === "type") {
      this.options.setTypeEnabled(
        selectedTarget.type,
        !this.options.isTypeEnabled(selectedTarget.type),
      );
      this.options.renderChips();
      this.options.renderContent();
      return;
    }

    this.options.applyGroupSnapshot(selectedTarget.groupId);
  }
}
