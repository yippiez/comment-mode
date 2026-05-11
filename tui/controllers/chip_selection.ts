/**
 * Chip selection controller: manages the current selected chip index,
 * toggling enabled type/group filters, and triggering re-renders.
 */
import { wrapIndex } from "../utils/math";

type ChipSelectionControllerOptions = {
  getChipCount: () => number;
  getSelectedChipIndex: () => number;
  setSelectedChipIndex: (index: number) => void;
  getSelectedType: () => string | null;
  isTypeEnabled: (type: string) => boolean;
  setTypeEnabled: (type: string, enabled: boolean) => void;
  renderChips: () => void;
  renderContent: () => void;
};

export class ChipSelectionController {
    private readonly options: ChipSelectionControllerOptions;

    constructor(options: ChipSelectionControllerOptions) {
        this.options = options;
    }

    // ------------------------------------------
    // Actions
    // ------------------------------------------

    public moveSelection(delta: number): void {
        const chipCount = this.options.getChipCount();
        if (chipCount === 0) { return; }

        const nextIndex = this.options.getSelectedChipIndex() + delta;
        this.options.setSelectedChipIndex(wrapIndex(nextIndex, chipCount));
        this.options.renderChips();
    }

    public toggleSelected(): void {
        const selectedType = this.options.getSelectedType();
        if (!selectedType) { return; }

        this.options.setTypeEnabled(
            selectedType,
            !this.options.isTypeEnabled(selectedType),
        );
        this.options.renderChips();
        this.options.renderContent();
    }
}
