import { createClient } from "@supabase/supabase-js";

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

/**
 * Returns the current user from the cached session — no network request,
 * no navigator.locks acquisition. Safe to call from mutation functions.
 * (getUser() validates with the server on every call, causing lock contention.)
 */
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}
