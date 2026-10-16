/**
 * Whether the page is going away: from `pagehide` until a `pageshow` that
 * brings it back from the back-forward cache.
 *
 * A request still in flight when the page unloads is torn down by the browser,
 * and its promise rejects with a network error ("Failed to fetch", or
 * supabase-js's FunctionsFetchError) in the last moments the page's script
 * still runs. That is a reload or a navigation, never a fault: the request
 * itself usually completed on the server. It is common straight after a
 * release, when the service worker swaps in the new build and reloads. On
 * 16 Oct 2026 that reload cut off the background index audit mid-request, and
 * both Edge Functions it called answered 200 to a page that had already
 * reported them unreachable (DUNGEON-GRIMOIRE-N). So nothing is reported
 * while the page is leaving.
 */
let leaving = false;
let watching = false;

export function watchPageLeaving(): void {
  if (watching) return;
  watching = true;
  window.addEventListener("pagehide", () => (leaving = true));
  // Restored from the back-forward cache: the page is live again.
  window.addEventListener("pageshow", () => (leaving = false));
}

export function isLeavingPage(): boolean {
  return leaving;
}
