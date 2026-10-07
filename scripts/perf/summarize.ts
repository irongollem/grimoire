import { type Interval, chainPositions, settledTime } from "./serialDepth";

/** One request as the CDP recorder saw it. Times are ms on the recorder's monotonic clock. */
export interface RawRequest {
  url: string;
  method: string;
  /** CDP `Network.ResourceType`: Document, Script, Stylesheet, Fetch, XHR, Preflight, ... */
  resourceType: string;
  startMs: number;
  /** null when the request had not finished when the window closed. */
  endMs: number | null;
  /** Bytes over the wire (headers + encoded body); 0 for cache and service-worker hits. */
  encodedBytes: number;
}

export type RequestKind = "api" | "preflight" | "js" | "css" | "other" | "ignored";

/**
 * Sorts a request into the buckets the metrics are reported in.
 *
 * Preflights come first and are never "api": Chromium sends a CORS `OPTIONS`
 * to the Supabase origin before the real call, and counting it as a request
 * made #945's numbers look like every call fired twice. Only the origin of the
 * local Supabase stack counts as API; static assets are classified by
 * extension first because modulepreload fetches report a resource type of
 * "Other", not "Script".
 */
export function classifyRequest(request: Pick<RawRequest, "url" | "method" | "resourceType">, apiOrigin: string): RequestKind {
  if (!/^https?:/.test(request.url)) return "ignored";
  const isApi = request.url === apiOrigin || request.url.startsWith(`${apiOrigin}/`);
  if (request.resourceType === "Preflight" || (isApi && request.method === "OPTIONS")) return "preflight";
  if (isApi) return "api";
  const path = new URL(request.url).pathname;
  if (/\.(m?js)$/.test(path) || request.resourceType === "Script") return "js";
  if (path.endsWith(".css") || request.resourceType === "Stylesheet") return "css";
  return "other";
}

/** `GET /rest/v1/quests?select=*&campaign_id=eq.1`: method, path and query only, never headers or origin. */
export function describeRequest(request: Pick<RawRequest, "url" | "method">): string {
  const url = new URL(request.url);
  return `${request.method} ${url.pathname}${url.search}`;
}

export interface RequestSummary {
  apiRequests: number;
  optionsRequests: number;
  apiBytes: number;
  jsBytes: number;
  cssBytes: number;
  /** Every real request (preflights excluded), API and static alike. */
  totalRequests: number;
  serialDepth: number;
  settledMs: number;
  apiPaths: string[];
  /** Each API request's link in the longest chain ending at it, parallel to `apiPaths` (see `chainPositions`). */
  apiWaves: number[];
}

/**
 * Reduces the requests of one measurement window to the network metrics.
 * `windowStartMs` and `windowEndMs` are on the same clock as the requests; a
 * request still open at the end is treated as finishing at `windowEndMs`.
 */
export function summarizeRequests(
  requests: readonly RawRequest[],
  apiOrigin: string,
  windowStartMs: number,
  windowEndMs: number,
  quietMs = 500,
): RequestSummary {
  let optionsRequests = 0;
  let apiBytes = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let totalRequests = 0;
  const apiIntervals: Interval[] = [];
  const allIntervals: Interval[] = [];
  const apiPaths: string[] = [];

  for (const request of [...requests].sort((a, b) => a.startMs - b.startMs)) {
    const kind = classifyRequest(request, apiOrigin);
    if (kind === "ignored") continue;
    if (kind === "preflight") {
      optionsRequests++;
      continue;
    }
    const interval = { start: request.startMs, end: request.endMs ?? windowEndMs };
    totalRequests++;
    allIntervals.push(interval);
    if (kind === "api") {
      apiBytes += request.encodedBytes;
      apiIntervals.push(interval);
      apiPaths.push(describeRequest(request));
    } else if (kind === "js") jsBytes += request.encodedBytes;
    else if (kind === "css") cssBytes += request.encodedBytes;
  }

  const apiWaves = chainPositions(apiIntervals);
  return {
    apiRequests: apiIntervals.length,
    optionsRequests,
    apiBytes,
    jsBytes,
    cssBytes,
    totalRequests,
    serialDepth: Math.max(0, ...apiWaves),
    settledMs: settledTime(allIntervals, windowStartMs, quietMs),
    apiPaths,
    apiWaves,
  };
}

export interface LongTask {
  startMs: number;
  durationMs: number;
}

/**
 * Total blocking time: for every main-thread task longer than 50 ms that began
 * after first contentful paint, the part beyond 50 ms. Lighthouse's definition
 * (FCP to time-to-interactive) with the end of the measurement window standing
 * in for TTI. Null when FCP is unknown (a client-side navigation paints nothing
 * new), because a made-up 0 would read as "no blocking".
 */
export function totalBlockingTime(tasks: readonly LongTask[], fcpMs: number | null): number | null {
  if (fcpMs === null) return null;
  let total = 0;
  for (const task of tasks) {
    if (task.startMs >= fcpMs) total += Math.max(0, task.durationMs - 50);
  }
  return total;
}
