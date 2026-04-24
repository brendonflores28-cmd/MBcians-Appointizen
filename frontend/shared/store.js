export function createStore(initialState) {
  let state = initialState;
  const subscribers = new Set();

  function getState() {
    return state;
  }

  function setState(update) {
    state = typeof update === 'function' ? update(state) : { ...state, ...update };
    subscribers.forEach((subscriber) => subscriber(state));
  }

  function subscribe(subscriber) {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return {
    getState,
    setState,
    subscribe,
  };
}
