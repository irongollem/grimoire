// The request plumbing every agent provider adapter shares (#1205): one streamed POST with a whole-stream timeout,
// the caller's abort signal, and every failure turned into an `AgentProviderError` that says whether a retry could
// help. Retrying itself is the caller's business, never the adapter's.

import { AgentProviderError } from "./types.ts";
import { iterateSse, type SseMessage } from "./sse.ts";
import { isRecord } from "./parse.ts";

export const DEFAULT_STREAM_TIMEOUT_MS = 120_000;

export interface StreamCall {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** What both provider adapters accept: a fetch to use and a cap for the whole stream (default 120 s). */
export interface AdapterDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** 408, 409, 429 and every 5xx can pass on their own; the rest are the request's fault and would fail again. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/** Parses one event's data. A broken event means the stream is damaged, which a fresh attempt may fix. */
export function parseEventJson(provider: string, data: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new AgentProviderError(`${provider} sent a malformed stream event`, null, true);
  }
  if (!isRecord(parsed)) throw new AgentProviderError(`${provider} sent an unexpected stream event`, null, true);
  return parsed;
}

async function httpError(provider: string, res: Response): Promise<AgentProviderError> {
  let message = `${provider} request failed with status ${res.status}`;
  try {
    const body: unknown = await res.json();
    if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
      message = body.error.message;
    }
  } catch {
    // A body that is not JSON leaves the generic message.
  }
  return new AgentProviderError(message, res.status, isRetryableStatus(res.status));
}

/**
 * Sends the request and hands the SSE messages to `consume`. Anything `consume` throws that is not already an
 * `AgentProviderError` is classified here, so adapters only throw their own provider-level errors.
 */
export async function runStream<T>(
  call: StreamCall,
  consume: (messages: AsyncGenerator<SseMessage>) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, call.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();

  const classify = (error: unknown): unknown => {
    if (error instanceof AgentProviderError) return error;
    if (call.signal?.aborted && !timedOut) {
      // The caller asked for this; it is not a provider failure and must not look retryable.
      return call.signal.reason instanceof Error ? call.signal.reason : new DOMException("Aborted", "AbortError");
    }
    if (timedOut) return new AgentProviderError(`${call.provider} request timed out`, null, true);
    // The underlying error can echo the request, so only its kind is reported.
    const kind = error instanceof Error ? error.name : "unknown";
    return new AgentProviderError(`${call.provider} network failure (${kind})`, null, true);
  };

  try {
    if (call.signal) {
      if (call.signal.aborted) throw classify(new DOMException("Aborted", "AbortError"));
      call.signal.addEventListener("abort", onCallerAbort, { once: true });
    }
    let res: Response;
    try {
      res = await (call.fetch ?? fetch)(call.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...call.headers },
        body: JSON.stringify(call.body),
        signal: controller.signal,
      });
    } catch (error) {
      throw classify(error);
    }
    if (!res.ok) throw await httpError(call.provider, res);
    if (!res.body) throw new AgentProviderError(`${call.provider} returned no stream`, res.status, true);
    try {
      return await consume(iterateSse(res.body));
    } catch (error) {
      throw classify(error);
    }
  } finally {
    clearTimeout(timer);
    call.signal?.removeEventListener("abort", onCallerAbort);
  }
}

/** A tool call's accumulated arguments as an object, or null when they are not a JSON object. Empty means "{}". */
export function parseToolInput(raw: string): Record<string, unknown> | null {
  const text = raw.trim() === "" ? "{}" : raw;
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
