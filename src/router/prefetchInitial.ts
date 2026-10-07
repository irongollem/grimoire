import type { Router } from "vue-router";
import { preloadLayout } from "@/layouts/layoutLoader";
import { prefetchRouteComponents, startChunk } from "./routeChunks";

/**
 * Starts downloading the chunks a navigation to `location` will need, layout
 * included, without navigating. Used by the first-navigation prefetch below and
 * the idle prefetch of the main destinations (`idlePrefetch.ts`); prefetch on
 * intent uses `prefetchRouteComponents` alone (see `routeChunks.ts` for why).
 */
export function prefetchRouteChunks(router: Router, location: string): void {
  const resolved = prefetchRouteComponents(router, location);
  if (resolved !== null) startChunk(() => preloadLayout(resolved));
}

/**
 * Starts downloading the chunks the first navigation will need, right now,
 * without waiting for the router's guards (#999).
 *
 * The first navigation's guard awaits `auth.initialize()`, which on a device
 * with no auth snapshot is the identity round trip, and only after it does the
 * router ask for the layout (`preloadLayout` at the end of beforeEach) and the
 * route component. Those chunks do not depend on who the user is, so they were
 * queued behind a network answer for no reason. `import()` is memoised per
 * specifier, so the router's own later request joins this one.
 *
 * The cost is one wasted chunk when a guard then redirects (a signed-out visitor
 * sent to /login downloads the page they asked for first). That is accepted:
 * the common case is a returning user landing where they asked to land.
 *
 * Errors are swallowed on purpose. A stale chunk is recovered by
 * `installStaleChunkRecovery`, and an offline first load fails again through the
 * real navigation, which is where it is reported.
 */
export function prefetchInitialChunks(router: Router, location: string): void {
  prefetchRouteChunks(router, location);
}
