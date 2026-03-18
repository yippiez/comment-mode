
export interface SignalListener<T> {
    (payload: T): void;
}

export interface SignalDispatcher<T> {
    (payload: T): void;
}

export interface SignalSubscriber<T> {
    (listener: SignalListener<T>): SignalUnsubscriber;
}

export interface SignalUnsubscriber {
    (): void;
}

export type Signal<T> = SignalSubscriber<T> & SignalDispatcher<T>;
export type SignalReturn = SignalUnsubscriber & void;

export function signalCreate<T=void>(): Signal<T> {
    let subscribers: SignalListener<T>[] = [];

    // Signal function with subscribers scoped
    return (signalArgOrListener: any): any => {
        if (typeof signalArgOrListener === "function") {
            // Cast as SignalListener<T> and add to subscribers
            const listener = signalArgOrListener as SignalListener<T>;
            subscribers.push(listener);

            // Return an unsubscriber function
            return () => {
                subscribers = subscribers.filter((l) => l !== listener);
            };
        } else {
            // If it's a value run it through all subscribers
            const payload = signalArgOrListener as T;
            subscribers.forEach((listener) => listener(payload));
        }
    }
}

export const SIGNALS: Record<string, Signal<any>> = {

} as const;
