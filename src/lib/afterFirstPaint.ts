/**
 * Run background work once the page has painted and the main thread is idle.
 *
 * For work nobody is waiting on: a fallback lookup, an automation that fires
 * things whose date has already passed. Started during setup it competes with
 * the requests that draw the page (#999); started from here it queues behind
 * them. `requestIdleCallback` is missing in Safari, so there is a timer
 * fallback, and `timeoutMs` bounds the wait on a busy page so the work still
 * happens, only a little later.
 *
 * @returns a cancel function, for `onScopeDispose` or `onUnmounted`.
 */
export function afterFirstPaint(task: () => void, timeoutMs = 2000): () => void {
  if (typeof globalThis.requestIdleCallback === "function") {
    const handle = globalThis.requestIdleCallback(task, { timeout: timeoutMs });
    return () => globalThis.cancelIdleCallback(handle);
  }
  const timer = setTimeout(task, Math.min(timeoutMs, 1000));
  return () => clearTimeout(timer);
}
