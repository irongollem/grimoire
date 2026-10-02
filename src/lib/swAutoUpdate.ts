/**
 * Keeps open sessions on the newest deploy.
 *
 * The table patches mid-session precisely because a feature is wanted at the
 * table NOW, and every player runs the installed PWA. Left alone, an open PWA
 * lags a deploy: the browser only re-checks sw.js on a navigation or roughly
 * daily. This module closes that gap without ever moving a page the user is
 * looking at:
 *
 *   discovery - polls registration.update() every few minutes and on every
 *               return to the foreground (a phone unlocking is the common
 *               case), so an idle PWA notices a deploy in minutes, not hours;
 *   adoption  - when the fresh worker takes control, a HIDDEN page reloads at
 *               once, because nobody sees it. A VISIBLE page is never reloaded
 *               by a timer or by the worker taking control: reloading a page
 *               the user has just returned to is exactly what people
 *               experience as the app being slow. It adopts the new build at
 *               the first of: the page being backgrounded, the user's next
 *               route navigation (the caller turns it into a full page load of
 *               the destination, see takeNavigationReload, a moment when a
 *               full load costs them nothing they were looking at), or the
 *               "Reload to update" menu action. A navigation onto the new
 *               build also avoids the stale-chunk window that
 *               staleChunkRecovery otherwise has to repair.
 *
 * isBusy (an in-flight mutation, which a reload would drop, or live
 * soundboard/Spotify audio, which a reload kills and autoplay policy will not
 * resume without a gesture) blocks both the background reload and the
 * navigation one. A hidden page that was busy retries every minute, so it
 * catches up once the audio stops.
 */

const UPDATE_POLL_MS = 5 * 60_000;
const RETRY_MS = 60_000;

export interface ReloadCoordinatorOptions {
  /** True while reloading would interrupt something the user cares about. */
  isBusy: () => boolean | Promise<boolean>;
  /** Called when a reload is deferred — surfaces the manual fallback. */
  onDeferred: () => void;
  /** Injection points for tests. */
  reload?: () => void;
  doc?: Document;
}

export interface ReloadCoordinator {
  /** A new build took control: reload now if hidden, otherwise defer. */
  requestReload: () => Promise<void>;
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
  const doc = opts.doc ?? document;
  const reload = opts.reload ?? (() => window.location.reload());
  let pending = false;
  let retryTimer: ReturnType<typeof setInterval> | undefined;

  function standDown(): void {
    pending = false;
    if (retryTimer !== undefined) clearInterval(retryTimer);
    retryTimer = undefined;
    doc.removeEventListener("visibilitychange", onVisibilityChange);
  }

  // Only a hidden page reloads: a visible one is being looked at, and moving it
  // is the slowness users report. The visible page adopts the build through
  // takeNavigationReload or the manual menu action instead.
  async function attempt(): Promise<boolean> {
    if (doc.visibilityState !== "hidden") return false;
    if (await opts.isBusy()) return false;
    // isBusy may be asynchronous, and the user can come back while it is being
    // answered: a page that is visible again is not reloaded.
    if (doc.visibilityState !== "hidden") return false;
    standDown();
    reload();
    return true;
  }

  async function onVisibilityChange(): Promise<void> {
    // Backgrounding is the ideal moment: the reload is invisible and the
    // fresh build greets the user on return.
    if (doc.visibilityState === "hidden") await attempt();
  }

  return {
    async requestReload(): Promise<void> {
      if (await attempt()) return;
      opts.onDeferred();
      if (pending) return;
      pending = true;
      doc.addEventListener("visibilitychange", onVisibilityChange);
      // Catches a hidden page that was busy (background audio) once it idles.
      // attempt() only reloads while hidden, so this never moves a visible page.
      retryTimer = setInterval(() => void attempt(), RETRY_MS);
    },

    async takeNavigationReload(): Promise<boolean> {
      if (!pending) return false;
      if (await opts.isBusy()) return false;
      // Re-check: a background reload may have won while isBusy was awaited.
      if (!pending) return false;
      standDown();
      return true;
    },
  };
}

export interface SwAutoUpdateOptions extends Pick<ReloadCoordinatorOptions, "isBusy" | "onDeferred"> {
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
    void coordinator.requestReload();
  });

  return { takeNavigationReload: coordinator.takeNavigationReload };
}
