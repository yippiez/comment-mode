import { SIGNALS } from "./catalog";
import { emit } from "./core";
import { subscribeToSource, type EventSource } from "./subscription";

type ScrollBarChangePayload = { position?: number } | undefined;
type VerticalScrollBarSource = EventSource<"change", (event: ScrollBarChangePayload) => void>;

export function registerScrollSignalBindings(source: VerticalScrollBarSource): () => void {
  const onChange = (event: ScrollBarChangePayload): void => {
    const position = event?.position;
    if (typeof position !== "number") return;
    emit(SIGNALS.scrollVertical, position);
  };

  return subscribeToSource(source, "change", onChange);
}
