import { flushSync } from 'react-dom';

// Run a state update inside a View Transition so the DOM change cross-fades instead of snapping.
// Falls back to a plain update where the API is missing.
export function transition(update) {
  if (typeof document === 'undefined' || !document.startViewTransition) return update();
  const t = document.startViewTransition(() => flushSync(update));
  // A transition that gets superseded by the next one rejects; that's expected, not an error.
  t.ready.catch(() => {});
  t.finished.catch(() => {});
}
