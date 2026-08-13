/**
 * Catches the one auth failure RLS makes invisible (#727).
 *
 * When a request reaches PostgREST without a usable JWT, reads do not fail —
 * every RLS-protected table answers `200 []`. So a session that dies without
 * emitting SIGNED_OUT renders as a fully working app containing none of the
 * user's data, and nothing in the client can tell that apart from a brand-new
 * account. A real user sat in that state for 35 minutes.
 *
 * The one request that does speak up is an RPC `anon` may not execute:
 * PostgREST maps `42501 insufficient_privilege` to **401 when the caller is
 * unauthenticated** (403 once it is authenticated). Nothing on a logged-out
 * path 401s under `/rest/v1/` — `validate_app_invite` and the four
 * `get_library_*_sources` are deliberately anon-executable and answer 200 — so
 * a 401 there means exactly one thing: we believed we were signed in and we
 * are not.
 *
 * This wrapper turns that into a signal. It deliberately ignores `/auth/v1/`,
 * where a 401 is an ordinary failed refresh that supabase-js already reports
 * through SIGNED_OUT.
 */

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** A 401 here means the session is gone, not that the caller lacks a right. */
function isDataRequest(input: RequestInfo | URL): boolean {
  return requestUrl(input).includes("/rest/v1/");
}

/**
 * Wraps `baseFetch` so that an unauthenticated PostgREST response invokes
 * `onUnauthenticated`. The response itself is passed through untouched — the
 * caller still sees the 401 and fails normally; this only adds the notification.
 */
export function createAuthAwareFetch(
  baseFetch: typeof fetch,
  onUnauthenticated: () => void,
): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    if (response.status === 401 && isDataRequest(input)) onUnauthenticated();
    return response;
  };
}
