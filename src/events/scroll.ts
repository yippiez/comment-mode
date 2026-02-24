import { subscribeToEvent, type EventSource } from "./subscription";

type ScrollBarChangePayload = { position?: number } | undefined;
type VerticalScrollBarSource = EventSource<"change", (event: ScrollBarChangePayload) => void>;

export type ScrollAction = { type: "vertical_scroll"; position: number };

/**
 * Registers scroll event handlers for a vertical scroll bar source.
 * Listens for "change" events and dispatches scroll actions when the scroll position changes.
 *
 * @param source - The vertical scroll bar event source to subscribe to
 * @param dispatch - Function to dispatch scroll actions
 * @returns Unsubscribe function to remove the event listener
 */
export function registerScrollEvents(
  source: VerticalScrollBarSource,
  dispatch: (action: ScrollAction) => void,
): () => void {
  const onChange = (event: ScrollBarChangePayload): void => {
    const position = event?.position;
    if (typeof position !== "number") return;
    dispatch({ type: "vertical_scroll", position });
  };

  return subscribeToEvent(source, "change", onChange);
}
