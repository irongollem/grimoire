import type { Router } from "vue-router";

/**
 * Recovers a page stranded by a deploy.
 *
 * The service worker updates aggressively (skipWaiting + clients.claim), and
 * its activate handler deletes the previous build's cache. A tab or installed
 * PWA that was already open keeps running the OLD build's code — swAutoUpdate
 * reloads it onto the new build, but that reload is deferred while the user
 * is typing, saving, or playing audio — so in that window its next lazy route
 * import asks for a hashed chunk filename that no longer exists in the cache
 * or on the host. The import rejects, the navigation dies, and the view reads
 * as "failed to load" until something reloads the page.
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

/**
 * Set by the `vite:preloadError` listener below. Never cleared while the page
 * lives: once this build's chunk graph has a hole in it, every later import
 * failure is the same deploy, and the only way out is the reload we are
 * already performing. Reset on install so tests start from a clean page.
 */
let preloadFailed = false;

/**
 * True for the *symptom* a swallowed chunk failure leaves behind.
 *
 * `isChunkLoadError` matches what the engine throws, but in a Vite build a
 * route's `import()` is wrapped in `__vitePreload`, whose error path is:
 *
 *     return baseModule().catch(handlePreloadError)
 *
 * and `handlePreloadError` re-throws *only* if nothing called `preventDefault`
 * on the `vite:preloadError` event. We do call it (that is the point — see the
 * listener below), so the helper returns `undefined`, the import resolves to
 * `undefined`, and vue-router throws `Couldn't resolve component "<name>" at
 * "<path>"` instead. That, not the engine's message, is what a stale chunk
 * looks like by the time `router.onError` sees it — DUNGEON-GRIMOIRE-3, where
 * a three-builds-old tab clicking Admin filed a Sentry issue the `beforeSend`
 * filter was written to suppress.
 *
 * Gated on `preloadFailed` so a genuine route misconfiguration — a component
 * loader that really does resolve to nothing, with no preload failure in sight
 * — still reports. That is a bug we want to hear about.
 */
export function isStaleChunkError(error: unknown): boolean {
  if (isChunkLoadError(error)) return true;
  return preloadFailed && error instanceof Error && /couldn't resolve component/i.test(error.message);
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
  preloadFailed = false;

  // The `vite:preloadError` event carries no route context, and it fires
  // *before* vue-router turns the undefined resolution into an error — so the
  // preload listener would otherwise reload the page the user is leaving
  // rather than the one they asked for. Remembering the in-flight target here
  // is what lets it land on the right route.
  let pendingTarget: string | undefined;
  router.beforeEach((to) => {
    pendingTarget = to.fullPath;
  });

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
  // so the hard reload can land directly on the page the user asked for. This
  // is the path for imports Vite did *not* wrap in `__vitePreload` (no
  // preloaded deps); a wrapped one is swallowed and reaches us as the
  // "couldn't resolve component" symptom instead — hence isStaleChunkError.
  router.onError((error, to) => {
    if (isStaleChunkError(error)) recover(to?.fullPath);
  });

  // Vite dispatches this when the chunk or one of its preloaded dependencies
  // (its CSS, a shared import) fails. preventDefault stops Vite from also
  // throwing the original error at the caller — at the cost of the import
  // resolving to `undefined`, which is what isStaleChunkError exists for.
  const onPreloadError = (event: Event) => {
    event.preventDefault();
    preloadFailed = true;
    recover(pendingTarget);
  };
  window.addEventListener("vite:preloadError", onPreloadError);

  // Reaching any route successfully proves the current build is loadable —
  // re-arm the once-guard for the next deploy. A thrown guard error does not
  // reach afterEach (vue-router rejects out of the chain via triggerError), so
  // pendingTarget survives long enough for the listener above to use it.
  router.afterEach(() => {
    pendingTarget = undefined;
    try {
      window.sessionStorage.removeItem(RELOADED_KEY);
    } catch {
      // Same storage failure as above; nothing to re-arm.
    }
  });

  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
