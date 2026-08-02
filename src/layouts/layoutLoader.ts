import type { RouteLocationNormalized } from "vue-router";

/**
 * Lazy loaders for the three shells, plus the preload hook the router uses.
 *
 * App.vue used to import all three statically, so every DM shipped the whole
 * player portal and every player shipped the DM sidebar and chat. Splitting
 * them is only a win if the chunk is not fetched *after* the route chunk —
 * the app mounts on `router.isReady()`, so a naive async layout would resolve
 * one serial round trip later and show a blank frame on a cold visit.
 *
 * So the router drives it: `preloadLayout` is fired at the end of beforeEach
 * (once the redirect checks have passed, so nothing is fetched for a route we
 * are about to navigate away from) and awaited in beforeResolve. That puts the
 * layout request in flight alongside the route component request rather than
 * behind it, and guarantees the shell is resolved before navigation confirms.
 *
 * Repeat visits do not pay even that: the service worker precaches every built
 * asset on install, so these chunks are cache hits from the second load on.
 */
const loaders = {
  auth: () => import("@/layouts/AuthLayout.vue"),
  player: () => import("@/layouts/PlayerLayout.vue"),
  default: () => import("@/layouts/DefaultLayout.vue"),
} as const;

export type LayoutName = keyof typeof loaders;

export const layoutLoaders = loaders;

/** Which shell a route renders in. Mirrors the branch in App.vue. */
export function layoutNameFor(meta: RouteLocationNormalized["meta"]): LayoutName {
  if (meta.layout === "auth") return "auth";
  if (meta.layout === "player") return "player";
  return "default";
}

/**
 * Warm the chunk for the shell `to` will render in.
 *
 * Safe to call repeatedly — `import()` is memoised per specifier, so the second
 * call returns the first call's promise rather than issuing another request.
 */
export function preloadLayout(to: RouteLocationNormalized): Promise<unknown> {
  return loaders[layoutNameFor(to.meta)]();
}
