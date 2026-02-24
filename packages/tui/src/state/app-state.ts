import type { UiState } from "./types";

export class AppStateStore implements UiState {
  public focusMode: UiState["focusMode"] = "code";
  public viewMode: UiState["viewMode"] = "code";
  public selectedChipIndex = 0;
}
