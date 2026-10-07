/**
 * Sends PostgREST traffic through the app's own origin, so the browser stops
 * sending a CORS preflight before every distinct query.
 *
 * Every `https://<ref>.supabase.co/rest/v1/...` call is cross-origin, and a
 * request carrying `Authorization` triggers an `OPTIONS` the browser must wait
 * on before the real call leaves. On a dashboard that is 33 preflights, and
 * each link of a dependent request chain pays one. The same call to
 * `/api/db/rest/v1/...` is same-origin and needs none. Production serves the
 * path with a Vercel external rewrite (`vercel.json`), local dev and preview
 * with a Vite proxy (`vite.config.ts`).
 *
 * Only `/rest/v1` moves, deliberately:
 * - `/auth/v1` stays direct. Supabase Auth rate-limits sign-in and token
 *   refresh per client IP, and behind a proxy every user would share Vercel's
 *   egress addresses and so one budget.
 * - `/storage/v1` carries large uploads, `/functions/v1` long-running AI calls,
 *   and realtime is a websocket, which a Vercel rewrite cannot carry.
 *
 * This is the innermost fetch wrapper: `createAuthAwareFetch` and
 * `withRequestDeadline` recognise a data request by its `/rest/v1/` path and
 * must still see the original Supabase URL.
 */

/** The same-origin prefix that stands in for the Supabase origin. */
export const SAME_ORIGIN_DB_PREFIX = "/api/db";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The same-origin URL for a PostgREST URL, or null when the URL is anything else. */
export function toSameOriginUrl(url: string, supabaseUrl: string, origin: string): string | null {
  const restBase = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/`;
  if (!url.startsWith(restBase)) return null;
  return `${origin}${SAME_ORIGIN_DB_PREFIX}/rest/v1/${url.slice(restBase.length)}`;
}

/**
 * Wraps `baseFetch` so a PostgREST request goes to `${origin}/api/db/rest/v1/...`
 * with its query string, method, headers and body intact. Anything else, and
 * every call made without a `window`, passes through unchanged.
 */
export function withSameOriginRest(baseFetch: FetchLike, supabaseUrl: string): FetchLike {
  return (input, init) => {
    if (typeof window === "undefined") return baseFetch(input, init);
    const origin = window.location.origin;
    if (typeof input === "string") {
      return baseFetch(toSameOriginUrl(input, supabaseUrl, origin) ?? input, init);
    }
    if (input instanceof URL) {
      const mapped = toSameOriginUrl(input.href, supabaseUrl, origin);
      return baseFetch(mapped ?? input, init);
    }
    const mapped = toSameOriginUrl(input.url, supabaseUrl, origin);
    // `new Request(url, request)` carries the method, headers, body and signal over.
    return baseFetch(mapped === null ? input : new Request(mapped, input), init);
  };
}
