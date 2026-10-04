/**
 * Keeps open sessions on the newest deploy.
 *
 * The table patches mid-session precisely because a feature is wanted at the
 * table NOW, and every player runs the installed PWA. Left alone, an open PWA
 * lags a deploy: the browser only re-checks sw.js on a navigation or roughly
 * daily. This module closes that gap without ever moving a page under the
 * user:
 *
 *   discovery - polls registration.update() every few minutes and on every
 *               return to the foreground (a phone unlocking is the common
 *               case), so an idle PWA notices a deploy in minutes, not hours;
 *   adoption  - once the fresh worker takes control, the page adopts the new
 *               build at the first of: the user's next route navigation (the
 *               caller turns it into a full page load of the destination, see
 *               takeNavigationReload, a moment when a full load costs them
 *               nothing they were looking at) or the "Reload to update" menu
 *               action. A navigation onto the new build also avoids the
 *               stale-chunk window that staleChunkRecovery otherwise has to
 *               repair.
 *
 * NEVER WHILE HIDDEN. This used to reload a backgrounded page at once, on the
 * theory that nobody sees it. iOS suspends a home-screen app within seconds of
 * it leaving the screen, so that reload ran the next boot into the freeze: a
 * token refresh sent and never answered, which on return either held the auth
 * lock forever (an app stuck on its splash) or had spent the refresh token
 * whose rotated successor never arrived (signed out on the next start). Every
 * push produced that for anyone who glanced at the app and switched away, and
 * the way out was to kill the app and sign in again, sometimes twice. A boot
 * belongs in the foreground, where the network is up and the user is waiting
 * for it. Nor does a visible page reload by timer or on the worker taking
 * control: reloading a page the user has just returned to is exactly what
 * people experience as the app being slow (#945).
 *
 * isBusy (an in-flight mutation, which a reload would drop, or live
 * soundboard/Spotify audio, which a reload kills and autoplay policy will not
 * resume without a gesture) blocks the navigation reload and leaves it pending
 * for a later one.
 */

import type { Router } from "vue-router";

const UPDATE_POLL_MS = 5 * 60_000;

export interface ReloadCoordinatorOptions {
  /** True while reloading would interrupt something the user cares about. */
  isBusy: () => boolean | Promise<boolean>;
  /** Called when a new build is waiting — surfaces the manual fallback. */
  onDeferred: () => void;
}

export interface ReloadCoordinator {
  /** A new build took control: hold it for the next navigation. */
  requestReload: () => void;
  /**
   * Called on a route navigation. Resolves true exactly when a reload is
   * pending and nothing is busy; the coordinator then stands down because the
   * caller is about to leave the page by turning the navigation into a full
   * load of the destination. It never reloads itself. Otherwise resolves
   * false and changes nothing.
   */
  takeNavigationReload: () => Promise<boolean>;
}

export function createReloadCoordinator(opts: ReloadCoordinatorOptions): ReloadCoordinator {
  let pending = false;

  return {
    requestReload(): void {
      opts.onDeferred();
      pending = true;
    },

    async takeNavigationReload(): Promise<boolean> {
      if (!pending) return false;
      if (await opts.isBusy()) return false;
      // Re-check: another navigation may have taken it while isBusy was awaited.
      if (!pending) return false;
      pending = false;
      return true;
    },
  };
}

/**
 * The navigation half of adoption: a guard that turns a route navigation into a
 * full page load of its destination when `take` says a new build is waiting.
 * Register it before the app's own guards, so a navigation that is about to
 * become a page load does not do the auth and lens work first.
 *
 * Returns a probe that is true once the guard has handed the page to the
 * browser. The caller needs it for exactly one case: the FIRST navigation. A
 * cold start after a deploy boots the previous build from the worker's cache,
 * the update check replaces the worker while the auth guard is still awaiting
 * the session, and when that guard then redirects (a player's `/` goes to
 * `/play`), the redirect is a second pass through this guard, which now takes
 * the reload. vue-router reports an aborted first navigation by REJECTING
 * `router.isReady()`, so whoever mounts on it must not treat that as a boot
 * failure: the page is already on its way to the new build
 * (DUNGEON-GRIMOIRE-G, 2 Oct 2026, an unhandled rejection with no message).
 */
export function installNavigationReload(
  router: Router,
  take: () => Promise<boolean>,
  assign: (href: string) => void = (href) => window.location.assign(href),
): () => boolean {
  let leaving = false;
  router.beforeEach(async (to) => {
    if (!(await take())) return true;
    leaving = true;
    assign(router.resolve(to).href);
    return false;
  });
  return () => leaving;
}

export interface SwAutoUpdateOptions extends ReloadCoordinatorOptions {
  pollMs?: number;
}

export interface SwAutoUpdateHandle {
  /** See ReloadCoordinator.takeNavigationReload. */
  takeNavigationReload: () => Promise<boolean>;
}

export function installSwAutoUpdate(opts: SwAutoUpdateOptions): SwAutoUpdateHandle {
  if (!("serviceWorker" in navigator)) {
    return { takeNavigationReload: () => Promise.resolve(false) };
  }
  const sw = navigator.serviceWorker;
  const coordinator = createReloadCoordinator(opts);

  window.addEventListener("load", () => {
    sw.register("/sw.js")
      .then((registration) => {
        const check = () => void registration.update().catch(() => {});
        setInterval(check, opts.pollMs ?? UPDATE_POLL_MS);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
      })
      .catch(() => {});
  });

  // controllerchange also fires on the very first install (clients.claim) —
  // only a page that already HAD a controller is looking at an update. After
  // that first claim the page IS controlled, so later changes are updates.
  let hadController = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    coordinator.requestReload();
  });

  return { takeNavigationReload: coordinator.takeNavigationReload };
}
