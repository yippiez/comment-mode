export type StoreListener<State> = (state: State) => void;

export type StoreApi<State> = {
  get: () => State;
  set: (nextState: State) => void;
  update: (mutate: (state: State) => void) => void;
  subscribe: (listener: StoreListener<State>) => () => void;
};

export function createStore<State>(initialState: State): StoreApi<State> {
  let state = initialState;
  const listeners = new Set<StoreListener<State>>();

  const notify = (): void => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  return {
    get: () => state,
    set: (nextState) => {
      state = nextState;
      notify();
    },
    update: (mutate) => {
      mutate(state);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
