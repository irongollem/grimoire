/**
 * Catches the auth failures RLS makes invisible (#727, #731).
 *
 * When a request reaches PostgREST without a usable JWT, reads do not fail —
 * every RLS-protected table answers `200 []`. So a session that dies without
 * emitting SIGNED_OUT renders as a fully working app containing none of the
 * user's data, and nothing downstream can tell that apart from a brand-new
 * account. A real user sat in that state for 35 minutes.
 *
 * There are two detectable shapes, and this wrapper owns both.
 *
 * ## 1. The 401 on the way back
 *
 * The one *response* that speaks up is an RPC `anon` may not execute:
 * PostgREST maps `42501 insufficient_privilege` to **401 when the caller is
 * unauthenticated** (403 once it is authenticated). Nothing on a logged-out
 * path 401s under `/rest/v1/` — `validate_app_invite` and the four
 * `get_library_*_sources` are deliberately anon-executable and answer 200 — so
 * a 401 there means exactly one thing: we believed we were signed in and we
 * are not. That feeds `sessionRecovery`.
 *
 * This wrapper deliberately ignores `/auth/v1/`, where a 401 is an ordinary
 * failed refresh that supabase-js already reports through SIGNED_OUT.
 *
 * ## 2. The anon key on the way out
 *
 * A 401 can only ever catch the RPC case. A plain table read *cannot* produce
 * one — it produces `200 []` — so for months the commonest shape of this bug
 * was undetectable by design, and an earlier revision of this file said so:
 * "an empty result ... is indistinguishable from a new account at this layer".
 *
 * That was wrong, and the request tells us. `supabase-js` does not fail when it
 * has no session: `fetchWithAuth` falls back to `bearer = realToken ?? supabaseKey`,
 * sending the **anon key** as the credential. So an outgoing `/rest/v1/` request
 * bearing the anon key, at a moment when the app believes it is signed in, is
 * proof that the answer coming back will be a lie — before it is asked.
 *
 * How the client gets there without noticing: on a mobile wake the access token
 * has expired, `getSession()` calls `_callRefreshToken()`, the radio is not up
 * yet, and the refresh fails with a *retryable* fetch error. auth-js keeps the
 * session (correctly — the refresh token is still good) and emits no
 * SIGNED_OUT, but returns `session: null` and caches that failure under
 * `REFRESH_FAILURE_COOLDOWN_MS` (60s), replaying it to every caller without
 * retrying. Every query in the wake burst therefore resolves anon.
 *
 * So we refuse to send it. Throwing turns an authoritative-looking `[]` into an
 * ordinary query error: TanStack retries it with backoff and — this is the
 * point — never caches it as a real answer. Recovery then arrives on its own,
 * because auth-js's ticker keeps trying while the tab is visible and emits
 * TOKEN_REFRESHED when it succeeds (see `main.ts`, which refetches on that).
 *
 * Note what this case deliberately does *not* do: notify `onUnauthenticated`.
 * That callback drives a ladder which signs the user out after three failures
 * in 30s, and this detection fires on *every* affected request rather than the
 * occasional RPC — a wake burst would trip it instantly and boot a user whose
 * refresh token is perfectly valid, out of an app that was about to recover by
 * itself. Deciding a session is truly dead stays where it already works:
 * auth-js emits SIGNED_OUT and `App.vue` redirects.
 */

/** Thrown instead of letting a request go out with no usable credential. */
export class AnonymousReadError extends Error {
  constructor() {
    super(
      "Request blocked: the session is not usable yet, so this read would return an empty result rather than an answer.",
    );
    this.name = "AnonymousReadError";
  }
}

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
 * The bearer credential this request will actually present, or null if it
 * carries none. `supabase-js` sets the header on `init`, but a caller may hand
 * us a fully-formed `Request` instead, so both are checked.
 */
function outgoingBearer(
  input: RequestInfo | URL,
  init?: RequestInit,
): string | null {
  const fromInit = init?.headers
    ? new Headers(init.headers).get("Authorization")
    : null;
  const header =
    fromInit ??
    (input instanceof Request ? input.headers.get("Authorization") : null);
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

export interface AuthAwareFetchOptions {
  /** The publishable key, which is also what supabase-js falls back to. */
  anonKey: string;
  /**
   * Whether the app currently believes a user is signed in. Reads the auth
   * store's in-memory cache — when this is false, anon requests are the login
   * page and the invite/library endpoints doing their job.
   */
  believesSignedIn: () => boolean;
  /** Called for each refused request, so recovery knows reads were starved. */
  onRefused?: () => void;
}

/**
 * Wraps `baseFetch` so that an unauthenticated PostgREST response invokes
 * `onUnauthenticated`, and an unauthenticated PostgREST *request* is refused
 * outright. Responses are passed through untouched — the caller still sees the
 * 401 and fails normally; that path only adds the notification.
 */
export function createAuthAwareFetch(
  baseFetch: typeof fetch,
  onUnauthenticated: () => void,
  options?: AuthAwareFetchOptions,
): typeof fetch {
  return async (input, init) => {
    if (options && isDataRequest(input) && options.believesSignedIn()) {
      const bearer = outgoingBearer(input, init);
      if (bearer === null || bearer === options.anonKey) {
        options.onRefused?.();
        throw new AnonymousReadError();
      }
    }
    const response = await baseFetch(input, init);
    if (response.status === 401 && isDataRequest(input)) onUnauthenticated();
    return response;
  };
}
