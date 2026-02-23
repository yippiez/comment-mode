import type { FocusMode, ViewMode } from "../types";

export class AppStateStore {
  public focusMode: FocusMode = "code";
  public viewMode: ViewMode = "code";
  public diffMode = false;
  public helpVisible = false;
  public selectedChipIndex = 0;
}
