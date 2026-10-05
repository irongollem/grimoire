/**
 * Gives Supabase requests a deadline, so one that never answers cannot hang the
 * app.
 *
 * iOS suspends a home-screen app within seconds of it leaving the screen, and a
 * request in flight at that moment can stay pending after the app comes back:
 * no response, no error, ever. auth-js has no timeout of its own, and every
 * `getSession()` that finds the token expired waits on the refresh already in
 * flight. So a token refresh caught by the freeze never settled, every query
 * waited behind it, and the app sat on its splash until it was killed.
 *
 * The deadline covers the whole exchange, body included: headers can arrive
 * just before the freeze, and postgrest-js then waits on `res.text()` forever.
 * The timer runs until the body is read to the end, errors or is cancelled.
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
 * Wraps `baseFetch` so a request with a deadline rejects once it passes, whether
 * it is still waiting for headers or for the end of the body. A caller's own
 * abort signal still works and keeps its own reason.
 */
/** Statuses the Fetch spec forbids a Response body for. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

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
    const settle = () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forwardAbort);
    };

    let response: Response;
    try {
      response = await baseFetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      settle();
      throw error;
    }
    // A browser hands a 204 a body stream, empty but not null, and a Response
    // with a null-body status may not be given one: rebuilding it threw on
    // every delete, minimal-return update and void RPC. There is no body to
    // time, so it passes through as it came.
    if (response.body === null || NULL_BODY_STATUSES.has(response.status)) {
      settle();
      return response;
    }
    const timed = new Response(deadlineBody(response.body, controller.signal, settle), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    // The constructor cannot set these, and a caller may read them.
    Object.defineProperties(timed, {
      url: { value: response.url },
      redirected: { value: response.redirected },
    });
    return timed;
  };
}

/**
 * A pass-through of `source` that calls `settle` once it ends, errors or is
 * cancelled, and errors with the signal's reason if it aborts first.
 */
function deadlineBody(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  settle: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    start(stream) {
      const onAbort = () => {
        settle();
        stream.error(signal.reason);
        reader.cancel(signal.reason).catch(() => undefined);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    },
    async pull(stream) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          settle();
          stream.close();
        } else {
          stream.enqueue(value);
        }
      } catch (error) {
        settle();
        // Already errored by the abort listener: the reason is the deadline's.
        try {
          stream.error(error);
        } catch {
          // nothing left to tell
        }
      }
    },
    cancel(reason) {
      settle();
      return reader.cancel(reason);
    },
  });
}
