import { createClient } from "@supabase/supabase-js";
import type { Session, User } from "@supabase/supabase-js";
import { createAuthAwareFetch } from "./authAwareFetch";
import { authStorageKey, readPersistedSession } from "./persistedSession";
import { withRequestDeadline } from "./requestDeadline";
import { TAB_ID } from "./tabId";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables.\n" +
      "Copy .env.example to .env.local and fill in your project credentials.",
  );
}

// No `lock` option, on purpose. auth-js has coordinated refreshes without one
// since 2.107 (in-tab single-flight on `refreshingDeferred`, cross-tab races
// settled by the server), and the option is deprecated. The in-process queue
// that used to sit here (April 2026) existed to escape `navigator.locks`' 5 s
// orphan steal, which put chat into AbortError storms on every device wake; the
// lockless default uses no lock at all, so it has neither that problem nor the
// queue's own (a refresh frozen by iOS held the queue, and every query behind it,
// for good). Do not reintroduce one.

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

const AUTH_STORAGE_KEY = authStorageKey(supabaseUrl);

/**
 * The session stored on this device, with no lock and no refresh. Only for
 * when `getSession()` could not reach the server; see persistedSession.ts.
 */
export function readStoredSession(): Session | null {
  return readPersistedSession(AUTH_STORAGE_KEY);
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
    // The key supabase-js would derive anyway, named so readStoredSession can
    // read it. See persistedSession.ts before changing it.
    storageKey: AUTH_STORAGE_KEY,
  },
  global: {
    // Lets the campaign doorbell tell this tab its own rings apart (tabId.ts).
    headers: { "x-grimoire-tab": TAB_ID },
    fetch: createAuthAwareFetch(
      // A request frozen by iOS never answers; see requestDeadline.ts.
      withRequestDeadline((input, init) => globalThis.fetch(input, init)),
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

// ── Synchronous user cache ───────────────────────────────────────────────────────
// supabase.auth.getSession() is async and may wait on a refresh in flight. Callers
// that only need "who is signed in" (authAwareFetch on every request, the query
// persistence key) must answer synchronously, so auth.ts calls setCachedUser()
// whenever the session changes (onAuthStateChange + initialize) and
// getCurrentUser() reads the in-memory value: no Promise, no network.
let _cachedUser: User | null = null;

export function setCachedUser(user: User | null): void {
  _cachedUser = user;
}

/**
 * Returns the current user from in-memory cache — no Promise, no network.
 * Updated by the auth store on every session change.
 */
export function getCurrentUser(): User | null {
  return _cachedUser;
}
