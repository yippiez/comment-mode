import { emit, SIGNALS } from "../signals";
import { subscribeToSource, type EventSource } from "./subscription";

type StdoutSource = EventSource<"resize", () => void>;

export function registerSystemSignalBindings(source: StdoutSource): () => void {
  const onResize = (): void => {
    emit(SIGNALS.systemStdoutResize);
  };

  return subscribeToSource(source, "resize", onResize);
}
