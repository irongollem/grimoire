import type { RouteLocationResolved, RouteRecordNormalized, Router } from "vue-router";

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
 * Starts a chunk download without waiting on it. Errors are swallowed on
 * purpose: a stale chunk is recovered by `installStaleChunkRecovery`, and a
 * chunk that cannot load fails again through the real navigation, which is
 * where it is reported.
 */
export function startChunk(load: () => Promise<unknown>): void {
  try {
    void load().catch(() => undefined);
  } catch {
    /* a loader that throws synchronously is the real navigation's to report */
  }
}

/** `router.resolve`, or null for a location the router cannot resolve. */
export function resolveQuietly(router: Router, location: string): RouteLocationResolved | null {
  try {
    return router.resolve(location);
  } catch {
    return null;
  }
}

/**
 * Starts downloading the route components a navigation to `location` will
 * need, without navigating (#999). `import()` is memoised per specifier, so
 * asking twice costs nothing.
 *
 * Deliberately not the layout: this is what in-app intent uses (hovering a nav
 * link), where the layout is already mounted. It also keeps this module free of
 * `layoutLoader`, whose lazy imports reach the layouts that render the nav
 * links, which would close an import cycle through every nav component.
 * `prefetchInitial.ts` adds the layout for the first navigation.
 */
export function prefetchRouteComponents(router: Router, location: string): RouteLocationResolved | null {
  const resolved = resolveQuietly(router, location);
  if (resolved === null) return null;
  for (const load of lazyLoaders(resolved.matched)) startChunk(load);
  return resolved;
}
