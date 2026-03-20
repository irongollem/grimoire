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

// When the tab becomes visible after being hidden, the browser may have paused
// or dropped the WebSocket. Force-reconnect so all realtime subscriptions
// (presence, postgres_changes, broadcast) resume immediately.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      supabase.realtime.connect();
    }
  });
}

/**
 * Returns the current user from the cached session — no network request,
 * no navigator.locks acquisition. Safe to call from mutation functions.
 * (getUser() validates with the server on every call, causing lock contention.)
 */
export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
}
