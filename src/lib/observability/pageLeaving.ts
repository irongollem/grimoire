/**
 * Whether the page is going away: from `beforeunload` or `pagehide` until a
 * `pageshow` that brings it back from the back-forward cache.
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
 *
 * `pagehide` alone was not early enough. Chrome can reject the in-flight
 * requests between the start of the navigation and `pagehide`, and the
 * rejection still reaches Sentry: on 28 and 29 Oct 2026 the background index
 * reported `embed-monsters` and the audit unreachable while the server went on
 * to answer 200 and write the vectors, and the next page's audit arrived a
 * second later (DUNGEON-GRIMOIRE-W, DUNGEON-GRIMOIRE-X). `beforeunload` fires
 * before the navigation starts, for a script's `location.reload()` /
 * `assign()` as well as the user's own reload, so the flag is raised there.
 *
 * `beforeunload` does not promise the page will go: a "stay on this page"
 * answer, or a link that turns out to be a download, leaves it alive. So that
 * flag lapses after `UNLOAD_GRACE_MS`; a page that really is leaving is gone
 * long before, and one restored from the back-forward cache is reset by
 * `pageshow`.
 */
let hidden = false;
let unloading = false;
let unloadTimer: ReturnType<typeof setTimeout> | null = null;
let watching = false;

/** How long `beforeunload` silences reporting if the page then stays. */
export const UNLOAD_GRACE_MS = 10_000;

export function watchPageLeaving(): void {
  if (watching) return;
  watching = true;
  window.addEventListener("beforeunload", () => {
    unloading = true;
    if (unloadTimer) clearTimeout(unloadTimer);
    unloadTimer = setTimeout(() => {
      unloading = false;
      unloadTimer = null;
    }, UNLOAD_GRACE_MS);
  });
  window.addEventListener("pagehide", () => (hidden = true));
  // Restored from the back-forward cache: the page is live again.
  window.addEventListener("pageshow", () => {
    hidden = false;
    unloading = false;
  });
}

export function isLeavingPage(): boolean {
  return hidden || unloading;
}
