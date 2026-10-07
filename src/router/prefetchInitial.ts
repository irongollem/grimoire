import type { RouteLocationResolved, RouteRecordNormalized, Router } from "vue-router";
import { preloadLayout } from "@/layouts/layoutLoader";

/**
 * A lazy route component is a plain arrow around `import()`. A real function
 * component has a prototype (or is a compiled SFC object), and calling one of
 * those as a loader would be wrong, so only prototype-less functions qualify.
 */
function isLazyLoader(component: unknown): component is () => Promise<unknown> {
  return typeof component === "function" && !("prototype" in component);
}

function lazyLoaders(matched: readonly RouteRecordNormalized[]): Array<() => Promise<unknown>> {
  return matched.flatMap((record) => Object.values(record.components ?? {}).filter(isLazyLoader));
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
  let resolved: RouteLocationResolved;
  try {
    resolved = router.resolve(location);
  } catch {
    return;
  }
  const start = (load: () => Promise<unknown>) => {
    try {
      void load().catch(() => undefined);
    } catch {
      /* a loader that throws synchronously is the real navigation's to report */
    }
  };
  start(() => preloadLayout(resolved));
  for (const load of lazyLoaders(resolved.matched)) start(load);
}
