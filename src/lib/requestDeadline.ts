/**
 * Gives Supabase requests a deadline, so one that never answers cannot hang the
 * app.
 *
 * iOS suspends a home-screen app within seconds of it leaving the screen, and a
 * request in flight at that moment can stay pending after the app comes back:
 * no response, no error, ever. auth-js has no timeout of its own, and every
 * auth operation runs one at a time through the client's lock (`singleTabLock`
 * in `supabase.ts`), which also has none. So a token refresh caught by the
 * freeze held that lock for good, every query waits on `getSession()` behind
 * it, and the app sat on its splash until it was killed.
 *
 * A deadline turns that hang into a network error, which every caller already
 * handles: auth-js classifies a failed fetch as retryable, keeps the session
 * and tries again, and TanStack Query retries a failed read.
 *
 * Only `/auth/v1/` and `/rest/v1/` get one. Edge functions (AI generation) and
 * storage uploads can legitimately run for a minute, and a deadline there would
 * cut off work that was going to succeed.
 */

/**
 * A refresh answers in well under a second. Kept below the server's ten-second
 * refresh-token reuse interval: if the request did reach the server and only
 * the answer was lost, auth-js's retry lands inside the window and receives the
 * same rotated token rather than tripping reuse detection.
 */
export const AUTH_DEADLINE_MS = 8_000;

/**
 * PostgREST runs a logged-in request under an eight-second statement timeout,
 * so nothing that can succeed takes this long. Generous on purpose: a slow
 * phone network is not a hang.
 */
export const DATA_DEADLINE_MS = 30_000;

/** The deadline for a request to this URL, or null for none. */
export function deadlineFor(url: string): number | null {
  const { pathname } = new URL(url, "http://localhost");
  if (pathname.startsWith("/auth/v1/")) return AUTH_DEADLINE_MS;
  if (pathname.startsWith("/rest/v1/")) return DATA_DEADLINE_MS;
  return null;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** The error a request that ran out of time rejects with. */
export function deadlineError(url: string, ms: number): DOMException {
  return new DOMException(`No answer from ${url} within ${ms} ms`, "TimeoutError");
}

/**
 * Wraps `baseFetch` so a request with a deadline rejects once it passes. A
 * caller's own abort signal still works and keeps its own reason.
 */
export function withRequestDeadline(
  baseFetch: typeof fetch,
  deadline: (url: string) => number | null = deadlineFor,
): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input);
    const ms = deadline(url);
    if (ms === null) return baseFetch(input, init);

    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) forwardAbort();
    else callerSignal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(() => controller.abort(deadlineError(url, ms)), ms);

    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forwardAbort);
    }
  };
}
