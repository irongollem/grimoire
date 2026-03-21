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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
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
