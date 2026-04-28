import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

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
type LockFunc = (name: string, acquireTimeout: number, fn: () => Promise<unknown>) => Promise<unknown>;
const _lockQueues: Record<string, Promise<unknown>> = {};
const singleTabLock: LockFunc = (name, _timeout, fn) => {
  const prev = _lockQueues[name] ?? Promise.resolve();
  const current = prev.then(() => fn(), () => fn());
  _lockQueues[name] = current.then(() => {}, () => {});
  return current;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    lock: singleTabLock,
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
