import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createAuthAwareFetch } from "./authAwareFetch";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables.\n" +
      "Copy .env.example to .env.local and fill in your project credentials.",
  );
}

// Replace navigator.locks (the default) with a simple in-process promise queue.
//
// The browser's navigator.locks API has a hardcoded 5000ms orphan-recovery
// timeout: if any holder is suspended (device sleep, tab background) for >5s
// the lock is forcibly stolen, and every waiting operation gets AbortError.
// With many concurrent supabase.from() calls (each needs the auth token), a
// single device wake can produce 40+ AbortErrors and put chat into an 8s
// loading loop via the bail timer.
//
// The in-process queue serialises auth operations within this tab just as
// reliably, but purely via Promise chaining — no browser API, no timeout.
// Cross-tab token refresh is still safe: autoRefreshToken is the only writer,
// and each tab has its own GoTrueClient with its own queue, so two tabs
// refreshing simultaneously would use different refresh tokens (different
// users) or, for the rare same-user-two-tabs case, one would get a 400 and
// fall back to a new login — no worse than the current AbortError outcome.
const _lockQueues: Record<string, Promise<unknown>> = {};
const singleTabLock = <R>(name: string, _timeout: number, fn: () => Promise<R>): Promise<R> => {
  const prev = _lockQueues[name] ?? Promise.resolve();
  const current = prev.then(() => fn(), () => fn());
  _lockQueues[name] = current.then(() => {}, () => {});
  return current;
};

// Set by main.ts once the query client and auth store exist. Held as a mutable
// ref because the fetch wrapper is baked into the client at construction, long
// before there is anything to recover into.
let sessionLostHandler: (() => void) | null = null;

/** Whether any read has been refused for want of a usable session. */
let refusedReadSinceRefresh = false;

/**
 * Reports — and clears — whether reads were refused since the last check.
 *
 * TOKEN_REFRESHED fires on every routine hourly refresh, so refetching the whole
 * cache on it unconditionally would trade a wake-up bug for an hourly refetch
 * burst. This narrows it to the case worth paying for: a refresh that lands
 * after `authAwareFetch` has actually starved some queries.
 */
export function consumeRefusedRead(): boolean {
  const refused = refusedReadSinceRefresh;
  refusedReadSinceRefresh = false;
  return refused;
}

/**
 * Registers what to do when a PostgREST request comes back unauthenticated —
 * see `authAwareFetch` for why that is detectable and `sessionRecovery` for why
 * the answer is to re-read the session rather than sign the user out (#727).
 */
export function onSessionLost(handler: () => void): void {
  sessionLostHandler = handler;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    // Proactive refresh is the SDK's job and must stay that way. Never call
    // `refreshSession()` alongside this timer: a refresh token is single-use, so
    // two senders trip reuse detection and kill the session we were trying to
    // save. `getSession()` is the safe door — it refreshes only when actually
    // expired, and concurrent callers share one in-flight attempt
    // (`refreshingDeferred` in auth-js), which is what a manual page reload was
    // doing all along. `stores/auth.ts` used to carry an `ensureFreshSession()`
    // recording this; it had decayed to an empty function the router guard still
    // awaited, so the rule now lives next to the setting it constrains.
    autoRefreshToken: true,
    lock: singleTabLock,
  },
  global: {
    fetch: createAuthAwareFetch(
      (input, init) => globalThis.fetch(input, init),
      () => sessionLostHandler?.(),
      {
        anonKey: supabaseAnonKey,
        // The cache below, not `auth.getSession()`: this runs on every request
        // and must stay synchronous and lock-free. It is also exactly the right
        // question — "does the app believe it is signed in" — since that belief
        // is what makes an anon-key read a lie rather than a legitimate
        // logged-out call.
        believesSignedIn: () => getCurrentUser() !== null,
        onRefused: () => {
          refusedReadSinceRefresh = true;
        },
      },
    ),
  },
});

// NOTE: Do NOT call supabase.realtime.connect() here on visibilitychange.
// It closes all active channels which fires CLOSED on their subscribe callbacks,
// which then schedule a new subscribe() → removeChannel() → CLOSED → loop.

// ── Lock-free user cache ────────────────────────────────────────────────────────
// supabase.auth.getSession() acquires an exclusive navigator.lock on every call.
// Every DB query internally calls getSession() (via _getAccessToken), and so does
// the original getCurrentUser(). With many concurrent queries they all serialise
// through that lock — causing apparent hangs with no network activity.
//
// Fix: auth.ts calls setCachedUser() whenever the session changes (onAuthStateChange
// + initialize). getCurrentUser() then reads the in-memory value synchronously —
// no lock, no Promise, no network.
let _cachedUser: User | null = null;

export function setCachedUser(user: User | null): void {
  _cachedUser = user;
}

/**
 * Returns the current user from in-memory cache — no navigator.lock, no network.
 * Updated by the auth store on every session change.
 */
export function getCurrentUser(): User | null {
  return _cachedUser;
}
