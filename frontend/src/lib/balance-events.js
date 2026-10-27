const EVENT = 'royal-reels:balance';

/** Lets any page push a fresh balance to the header without a route change. */
export function publishBalance(cents) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: cents }));
}

export function subscribeToBalance(listener) {
  const handler = (event) => listener(event.detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
