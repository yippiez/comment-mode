import { SIGNALS } from "./catalog";
import { emit } from "./core";
import { subscribeToSource, type EventSource } from "./subscription";

type StdoutSource = EventSource<"resize", () => void>;

export function registerSystemSignalBindings(source: StdoutSource): () => void {
  const onResize = (): void => {
    emit(SIGNALS.systemStdoutResize);
  };

  return subscribeToSource(source, "resize", onResize);
}
