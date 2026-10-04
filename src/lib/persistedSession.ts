import type { Session } from "@supabase/supabase-js";

/**
 * The session auth-js has stored on this device, read without its lock and
 * without a refresh.
 *
 * `getSession()` answers `session: null` when the access token has expired and
 * the refresh cannot reach the server, although the session is still stored and
 * the refresh token is still good: auth-js keeps it and retries. On a phone that
 * is the ordinary cold start, with the radio still coming up, and the boot read
 * that null as "signed out" and sent a signed-in user to the login page. This
 * is what it reads instead.
 *
 * It is only a statement of who is signed in, the same kind of display hint as
 * `authSnapshot.ts`. Its access token may be expired, and nothing sends it:
 * every request still takes its token from `getSession()`, and `authAwareFetch`
 * refuses a data read that would go out without one. auth-js stays the only
 * judge of whether the session lives; if the refresh token turns out to be
 * dead it removes the session and emits SIGNED_OUT, and the app signs out then.
 */

/**
 * The key auth-js stores the session under. supabase-js derives exactly this
 * when none is given; `supabase.ts` passes it explicitly so the app owns the
 * name it reads, and `persistedSession.test.ts` holds the two equal. Changing
 * the value signs every user out once, since their session is under the old key.
 */
export function authStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

function isStoredSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Partial<Session>;
  return (
    typeof session.access_token === "string" &&
    typeof session.refresh_token === "string" &&
    typeof session.user?.id === "string"
  );
}

/** A miss on anything unreadable: absent, malformed, or storage unavailable. */
export function readPersistedSession(
  key: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): Session | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
