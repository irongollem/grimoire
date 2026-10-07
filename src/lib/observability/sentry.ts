import type { App } from "vue";
import type { Router } from "vue-router";
import { isStaleChunkError } from "../staleChunkRecovery";
import type { CaptureHint, ErrorTrackingClient } from "./sentryClient";

/**
 * Error tracking (#644) — the public face of it, with no Sentry code in it.
 *
 * The SDK, its configuration and the privacy claim that goes with it live in
 * `sentryClient.ts`, which is loaded by a dynamic `import()` after first paint
 * (#999). Twenty-eight modules import this file, so a single static `@sentry`
 * import here would put ~40 kB gzip back on the startup critical path.
 *
 * What this file does instead is hold errors until the client exists. From
 * `initErrorTracking` on, it listens for Vue render errors, `window` errors,
 * unhandled rejections and router failures and queues them; the client loads
 * when the page has painted or when the first error arrives, whichever is first
 * (a boot that never mounts must still report). When the client starts, the
 * stand-in listeners are removed so Sentry's own are the only ones, and the
 * queue is replayed in order.
 */

type QueuedReport = { error: unknown; hint?: CaptureHint };

/** Bound on what is held while the client loads, so a render loop cannot grow it. */
const MAX_QUEUED = 50;

/** How long to wait for an idle moment after mount before loading anyway. */
const IDLE_TIMEOUT_MS = 3000;

let enabled = false;
let dsnInUse: string | null = null;
let appInUse: App | null = null;
let client: ErrorTrackingClient | null = null;
let loading: Promise<void> | null = null;
let failed = false;
let queue: QueuedReport[] = [];
/** `undefined` until a user is set; `null` is an explicit sign-out. */
let pendingUser: string | null | undefined;
let removeStandIns: (() => void) | null = null;

/**
 * A DSN Sentry can actually use.
 *
 * Emptiness is not the only way this value goes wrong, and the other way is
 * silent. On 22 Sep 2026 production shipped `dsn: "[SENSITIVE]"` — the literal
 * string Vercel writes for a Sensitive environment variable, which a CI build
 * receives in place of the value because `vercel pull` never returns it. It is
 * truthy, so a bare `if (!dsn)` let it through; `Sentry.init` then failed to
 * parse it and quietly disabled the client. `window.__SENTRY__` was present,
 * the app looked instrumented, and not one browser error was reported until
 * somebody noticed the Issues feed had gone quiet.
 *
 * So the guard checks the value is a URL rather than merely present, and says
 * so out loud when it is not. An inert client that looks alive is worse than
 * no client.
 */
function usableDsn(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("scheme");
    return value;
  } catch {
    console.error(
      `[sentry] VITE_SENTRY_DSN is set but is not a URL (${JSON.stringify(value)}); error reporting is OFF. ` +
      "In Vercel this usually means the variable is marked Sensitive — a CI build cannot read those, " +
      "so it receives the string \"[SENSITIVE]\". Store it as Config instead.",
    );
    return null;
  }
}

export { usableDsn };

function route(error: unknown, hint?: CaptureHint): void {
  if (!enabled || failed) return;
  if (client) {
    client.capture(error, hint);
    return;
  }
  if (queue.length < MAX_QUEUED) queue.push({ error, hint });
  void loadClient();
}

/**
 * Import the client, hand over from the stand-ins, and replay the queue.
 *
 * If the import fails (an offline first load, a chunk stranded by a deploy) the
 * failure is swallowed and the queue dropped: error reporting is not allowed to
 * become a reason the app misbehaves, and a stale chunk is already handled by
 * `installStaleChunkRecovery`. The stand-ins are removed so Vue's default
 * logging takes back over.
 */
function loadClient(): Promise<void> {
  if (loading) return loading;
  const giveUp = () => {
    failed = true;
    queue = [];
    removeStandIns?.();
    removeStandIns = null;
  };
  loading = import("./sentryClient")
    .then(({ startErrorTracking }) => {
      if (!appInUse || !dsnInUse) return;
      // Removed in the same tick Sentry installs its own, so no error falls in
      // the gap and none is seen by both.
      removeStandIns?.();
      removeStandIns = null;
      const started = startErrorTracking(appInUse, dsnInUse);
      if (pendingUser !== undefined) started.setUser(pendingUser);
      client = started;
      const held = queue;
      queue = [];
      for (const { error, hint } of held) started.capture(error, hint);
    })
    .catch(giveUp);
  return loading;
}

/**
 * Load the client once the page has painted. Called by `main.ts` right after
 * mount; an error that arrives earlier loads it sooner.
 */
export function loadErrorTrackingAfterPaint(): void {
  if (!enabled) return;
  const load = () => void loadClient();
  if (typeof requestIdleCallback === "function") requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
  else setTimeout(load, 0);
}

/**
 * Start listening for errors.
 *
 * A no-op when `VITE_SENTRY_DSN` is unset, which is the state of every local
 * dev run and every build made outside Vercel — so no configuration is needed
 * to work on this repo, and dev noise never reaches the production project.
 */
export function initErrorTracking(app: App, router: Router): void {
  const dsn = usableDsn(import.meta.env.VITE_SENTRY_DSN);
  if (!dsn) return;
  enabled = true;
  dsnInUse = dsn;
  appInUse = app;

  // Stand-in for the errorHandler that `Sentry.init({ app })` installs. Vue only
  // logs when no handler is set, so keep logging when there is nothing to chain.
  const previousHandler = app.config.errorHandler;
  const standInHandler: NonNullable<App["config"]["errorHandler"]> = (error, instance, info) => {
    route(error, { mechanism: { type: "vue", handled: false }, extra: { info } });
    if (previousHandler) previousHandler(error, instance, info);
    else console.error(error);
  };
  app.config.errorHandler = standInHandler;

  const onError = (event: ErrorEvent) => {
    // The benign ResizeObserver notice is in IGNORED and must not wake the SDK.
    if (/ResizeObserver loop/.test(event.message)) return;
    route(event.error ?? event.message, { mechanism: { type: "onerror", handled: false } });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    route(event.reason, { mechanism: { type: "onunhandledrejection", handled: false } });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  removeStandIns = () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    if (app.config.errorHandler === standInHandler) app.config.errorHandler = previousHandler;
  };

  // Vue's own errorHandler is covered above. Router failures bypass it — a
  // rejected async guard or a failed route-component import surfaces here and
  // nowhere else. This listener stays for the life of the page and routes to
  // the queue or the client, so it needs no hand-over.
  router.onError((error) => {
    if (isStaleChunkError(error)) return;
    route(error);
  });
}

/**
 * Report an error the app has already handled, so it is silent to the user and
 * visible to us.
 *
 * Written for the embed-on-write hooks (#846). Those are fire-and-forget by
 * design — the row is saved either way and a toast about a background embed
 * would be noise — but `.catch(() => {})` made the failure invisible to
 * everyone, including us. A row that already had a vector keeps its old one
 * when the call fails, so retrieval quietly matches on text the DM has since
 * rewritten, and nothing anywhere says it happened.
 *
 * This does not fix that; it measures it. #846 has three candidate fixes with
 * quite different costs, and which is worth building depends on whether this
 * happens once a month or once a minute — a question nothing could answer
 * while the failures were being swallowed.
 *
 * Transient network failures are already filtered by IGNORED above, so what
 * reaches the inbox is the kind worth reading.
 */
export function reportHandledError(error: unknown, where: string, extra?: Record<string, unknown>): void {
  route(error, { tags: { handled_at: where }, extra });
}

/**
 * Attach (or clear) the account id on subsequent events.
 *
 * The id alone — never email or username, which `dataCollection.userInfo:
 * false` stops the SDK collecting and `scrubEvent` strips even if it did. A
 * uuid that resolves to a person only through the database is what makes "is
 * this one user or everyone?" answerable, which is most of triage.
 */
export function setErrorTrackingUser(userId: string | null): void {
  if (!enabled || failed) return;
  if (client) client.setUser(userId);
  else pendingUser = userId;
}
