export type EventSource<EventName extends string, Handler extends (...args: any[]) => void> = {
  on: (event: EventName, handler: Handler) => unknown;
  off?: (event: EventName, handler: Handler) => unknown;
  removeListener?: (event: EventName, handler: Handler) => unknown;
};

export function subscribeToEvent<EventName extends string, Handler extends (...args: any[]) => void>(
  source: EventSource<EventName, Handler>,
  eventName: EventName,
  handler: Handler,
): () => void {
  source.on(eventName, handler);
  return () => {
    if (typeof source.off === "function") {
      source.off(eventName, handler);
      return;
    }
    if (typeof source.removeListener === "function") {
      source.removeListener(eventName, handler);
    }
  };
}
