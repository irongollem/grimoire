import type { Router } from "vue-router";

/**
 * Recovers a page stranded by a deploy.
 *
 * The service worker updates aggressively (skipWaiting + clients.claim), and
 * its activate handler deletes the previous build's cache. A tab or installed
 * PWA that was already open keeps running the OLD build's code — main.ts
 * deliberately does not force-reload it — so its next lazy route import asks
 * for a hashed chunk filename that no longer exists in the cache or on the
 * host. The import rejects, the navigation dies, and the view reads as
 * "failed to load" until the user refreshes by hand.
 *
 * This module does that refresh for them, exactly once: a chunk-load failure
 * triggers a hard navigation to the route the user was trying to reach, which
 * picks up the fresh index.html and the fresh chunk graph. The once-guard
 * lives in sessionStorage so a genuinely broken deploy degrades to the old
 * behaviour (a visible failure) instead of a reload loop, and is cleared on
 * the next successful navigation so the page can recover again after a future
 * deploy.
 */

const RELOADED_KEY = "grimoire-stale-chunk-reloaded";

/**
 * True for the errors a failed dynamic import produces. Message text is the
 * only signal there is: Chrome/Edge throw a TypeError "Failed to fetch
 * dynamically imported module", Firefox "error loading dynamically imported
 * module", Safari "Importing a module script failed".
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
    error.message,
  );
}

function defaultNavigate(targetPath?: string): void {
  if (targetPath) window.location.assign(targetPath);
  else window.location.reload();
}

/** Returns an uninstall function (removes the window listener; used by tests). */
export function installStaleChunkRecovery(
  router: Router,
  navigate: (targetPath?: string) => void = defaultNavigate,
): () => void {
  function recover(targetPath?: string): void {
    let storage: Storage;
    try {
      storage = window.sessionStorage;
      if (storage.getItem(RELOADED_KEY) !== null) return;
      storage.setItem(RELOADED_KEY, "1");
    } catch {
      // Storage unavailable — we cannot tell a first failure from a loop, so
      // surface the failure rather than risk reloading forever.
      return;
    }
    navigate(targetPath);
  }

  // A failed route-component import surfaces here with the navigation target,
  // so the hard reload can land directly on the page the user asked for.
  router.onError((error, to) => {
    if (isChunkLoadError(error)) recover(to?.fullPath);
  });

  // Vite dispatches this when a chunk's preloaded dependency (its CSS or a
  // shared import) fails, which the router never sees. preventDefault stops
  // Vite from also throwing the original error at the caller.
  const onPreloadError = (event: Event) => {
    event.preventDefault();
    recover();
  };
  window.addEventListener("vite:preloadError", onPreloadError);

  // Reaching any route successfully proves the current build is loadable —
  // re-arm the once-guard for the next deploy.
  router.afterEach(() => {
    try {
      window.sessionStorage.removeItem(RELOADED_KEY);
    } catch {
      // Same storage failure as above; nothing to re-arm.
    }
  });

  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
