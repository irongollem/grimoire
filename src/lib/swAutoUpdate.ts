/**
 * Keeps open sessions on the newest deploy.
 *
 * The table patches mid-session precisely because a feature is wanted at the
 * table NOW, and every player runs the installed PWA. Left alone, an open PWA
 * lags a deploy twice over: the browser only re-checks sw.js on a navigation
 * or roughly daily, and once the new worker does take control main.ts used to
 * park the update behind a "Reload to update" menu action nobody opens
 * mid-game. This module closes both gaps:
 *
 *   discovery — polls registration.update() every few minutes and on every
 *               return to the foreground (a phone unlocking is the common
 *               case), so an idle PWA notices a deploy in minutes, not hours;
 *   adoption  — when the fresh worker takes control, reloads onto the new
 *               build immediately, UNLESS the reload would visibly interrupt:
 *               active text entry, an in-flight mutation (reloading would
 *               drop the write), or live soundboard/Spotify audio (a reload
 *               kills the audio graph and autoplay policy blocks resuming it
 *               without a gesture). A deferred reload retries every minute,
 *               on backgrounding, and stays available via the existing
 *               "Reload to update" menu action.
 *
 * A page whose reload is deferred can still hit the stale-chunk window in the
 * meantime — staleChunkRecovery remains the backstop for that.
 */

const UPDATE_POLL_MS = 5 * 60_000;
const RETRY_MS = 60_000;

/** Input types where keyboard focus does not mean the user is mid-entry. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button", "checkbox", "radio", "range", "submit", "reset", "color", "file",
]);

/** True while the focused element is accepting text the user could lose. */
export function isTextEntryActive(doc: Document = document): boolean {
  const el = doc.activeElement;
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

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
  /** A new build took control — reload now, or defer and keep trying. */
  requestReload: () => Promise<void>;
}

export function createReloadCoordinator(opts: ReloadCoordinatorOptions): ReloadCoordinator {
  const doc = opts.doc ?? document;
  const reload = opts.reload ?? (() => window.location.reload());
  let pending = false;
  let retryTimer: ReturnType<typeof setInterval> | undefined;

  async function attempt(): Promise<boolean> {
    if (await opts.isBusy()) return false;
    // Typing only blocks a visible reload — a backgrounded page has no
    // keyboard, its focus state is just whatever was left behind.
    if (doc.visibilityState !== "hidden" && isTextEntryActive(doc)) return false;
    if (retryTimer !== undefined) clearInterval(retryTimer);
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    reload();
    return true;
  }

  async function onVisibilityChange(): Promise<void> {
    // Backgrounding is the ideal moment: the reload is invisible and the
    // fresh build greets the user on return. (Still gated on isBusy — the
    // soundboard's music beds keep playing from the background/CarPlay.)
    if (doc.visibilityState === "hidden") await attempt();
  }

  return {
    async requestReload(): Promise<void> {
      if (await attempt()) return;
      opts.onDeferred();
      if (pending) return;
      pending = true;
      doc.addEventListener("visibilitychange", onVisibilityChange);
      retryTimer = setInterval(() => void attempt(), RETRY_MS);
    },
  };
}

export interface SwAutoUpdateOptions extends Pick<ReloadCoordinatorOptions, "isBusy" | "onDeferred"> {
  pollMs?: number;
}

export function installSwAutoUpdate(opts: SwAutoUpdateOptions): void {
  if (!("serviceWorker" in navigator)) return;
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
}
