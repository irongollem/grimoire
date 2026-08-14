/**
 * Recovers from the silent-unauthenticated state that `authAwareFetch` detects (#727).
 *
 * The important thing this must NOT do is sign the user out. A 401 from
 * PostgREST proves a request went out without a usable JWT — it does not prove
 * the session is gone, and the likeliest cause says it usually isn't: iOS
 * freezes timers in a backgrounded tab, so supabase-js's auto-refresh never
 * fires, the one-hour access token quietly expires, and the requests sent on
 * wake-up are stale **while the refresh token is still valid**. That is why a
 * manual page reload has been enough to fix it — a fresh boot calls
 * `getSession()`, which spends the refresh token and carries on. Signing out on
 * that evidence would discard a working session and force a pointless re-login.
 *
 * So the ladder is: re-read the session first, and only give up if there truly
 * isn't one. Recovery deliberately goes through `getSession()` rather than
 * `refreshSession()` — see the `ensureFreshSession` note in `stores/auth.ts`:
 * calling refresh in parallel with the SDK's own timer sends the same
 * single-use refresh token twice, trips reuse detection, and kills the very
 * session we are trying to save. `getSession()` refreshes only when actually
 * expired, which is precisely what the manual reload did.
 *
 * Refetching afterwards is not optional. The queries that ran while
 * unauthenticated resolved to `200 []` and are cached as legitimately-empty
 * results, so without an explicit invalidate the user keeps looking at an empty
 * app even once the session is back.
 */

/** Consecutive recoveries before we accept the session is genuinely dead. */
const MAX_ATTEMPTS = 3;

/**
 * Attempts further apart than this are treated as unrelated. A tab that wakes
 * once an hour should get a fresh budget every time; only a tight loop —
 * recovery reports success and the next request 401s anyway — should escalate.
 */
const ATTEMPT_WINDOW_MS = 30_000;

export interface SessionRecoveryDeps {
  /** Re-reads the session, refreshing an expired token; true when usable again. */
  hasUsableSession: () => Promise<boolean>;
  /** Re-runs queries that resolved empty while unauthenticated. */
  refetchAll: () => void;
  /** Last resort, only once we know there is no session left to recover. */
  signOutAndRedirect: () => void;
  /** Injectable clock, for tests. */
  now?: () => number;
}

/**
 * Returns a handler safe to call on every failing request: concurrent calls
 * coalesce into one attempt, since a lost session produces a burst of 401s
 * rather than a single one.
 */
export function createSessionRecovery(deps: SessionRecoveryDeps): () => void {
  const now = deps.now ?? (() => Date.now());
  let inFlight: Promise<void> | null = null;
  let attempts = 0;
  let lastAttemptAt = -Infinity;

  async function attempt(): Promise<void> {
    const startedAt = now();
    if (startedAt - lastAttemptAt > ATTEMPT_WINDOW_MS) attempts = 0;
    lastAttemptAt = startedAt;

    // Repeated 401s despite a successful re-read mean the token we recovered is
    // not being accepted, so re-reading again will not help either.
    if (attempts >= MAX_ATTEMPTS) {
      deps.signOutAndRedirect();
      return;
    }
    attempts += 1;

    if (await deps.hasUsableSession()) {
      deps.refetchAll();
      return;
    }
    deps.signOutAndRedirect();
  }

  return function recoverSession(): void {
    if (inFlight) return;
    inFlight = attempt().finally(() => {
      inFlight = null;
    });
  };
}
