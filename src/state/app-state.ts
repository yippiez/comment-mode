import type { FocusMode } from "../types";

export class AppStateStore {
  public focusMode: FocusMode = "code";
  public diffMode = false;
  public helpVisible = false;
  public selectedChipIndex = 0;
}
