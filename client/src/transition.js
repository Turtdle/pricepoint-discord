import { flushSync } from 'react-dom';

// Run a state update inside a View Transition so the DOM change cross-fades instead of snapping.
// Falls back to a plain update where the API is missing.
export function transition(update) {
  if (typeof document === 'undefined' || !document.startViewTransition) return update();
  document.startViewTransition(() => flushSync(update));
}
