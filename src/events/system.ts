import { subscribeToEvent, type EventSource } from "./subscription";

type StdoutSource = EventSource<"resize", () => void>;

export type SystemAction = { type: "stdout_resize" };

export function registerSystemEvents(
  source: StdoutSource,
  dispatch: (action: SystemAction) => void,
): () => void {
  const onResize = (): void => {
    dispatch({ type: "stdout_resize" });
  };

  return subscribeToEvent(source, "resize", onResize);
}
