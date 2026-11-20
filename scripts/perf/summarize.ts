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

/**
 * Requests the app deliberately starts after the page has painted and the main thread is idle (`afterFirstPaint`,
 * `useBackgroundIndexing`). Nobody waits on them, so they are left out of `serialDepth`; they stay in every count,
 * in the settled time and in `apiWaves`. Without this, the idle callback firing a moment before or after one wave of
 * the boot burst was answered moved `dm-cold` a whole wave on the same commit (#1226): CI read 4 to 7 on main.
 *
 * Each entry names the code that defers it. A request belongs here only when the app itself holds it back until
 * idle, never because it is slow or deep: a dependent read that merely lands late is exactly what the depth is for.
 */
export const BACKGROUND_REQUESTS: readonly { method: string; path: string; query?: string; deferredBy: string }[] = [
  {
    method: "GET",
    path: "/rest/v1/app_settings",
    query: "key=eq.placeholder_focal_points",
    deferredBy: "initPlaceholderFocalPoints, through afterFirstPaint in DefaultLayout.vue",
  },
  { method: "POST", path: "/functions/v1/embed-content", deferredBy: "useBackgroundIndexing's audit, after first paint" },
  { method: "POST", path: "/functions/v1/embed-monsters", deferredBy: "useBackgroundIndexing's audit, after first paint" },
];

/** True when the request is one the app holds back until idle (`BACKGROUND_REQUESTS`). */
export function isBackgroundRequest(request: Pick<RawRequest, "url" | "method">): boolean {
  const url = new URL(request.url);
  return BACKGROUND_REQUESTS.some(
    (entry) =>
      entry.method === request.method &&
      entry.path === url.pathname &&
      (entry.query === undefined || url.search.slice(1).split("&").includes(entry.query)),
  );
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
  /** Code chunks and stylesheets: what grows when the chunk graph fragments (#999 2.14). The gated static count. */
  codeRequests: number;
  /**
   * Every real request (preflights excluded), API and static alike. Reported, never gated: it includes fonts and
   * images, which load or not depending on what is painted while the window is open (a web font, the loading
   * flag's image), so it moved by one between runs of the same commit (#1146).
   */
  totalRequests: number;
  /** The longest chain of API requests the page waits on; `BACKGROUND_REQUESTS` are left out. */
  serialDepth: number;
  settledMs: number;
  apiPaths: string[];
  /**
   * Each API request's link in the longest chain ending at it, parallel to `apiPaths` (see `chainPositions`). Every
   * request, background ones included, so its largest value can exceed `serialDepth`.
   */
  apiWaves: number[];
  /**
   * Every other request counted in `totalRequests` (code chunks, stylesheets, fonts, images, the document), as a
   * path without origin or query, in start order. Without it a `totalRequests` regression names no culprit: #1138
   * had to rebuild the budgets' commit to find which chunks were new.
   */
  assetPaths: string[];
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
  let codeRequests = 0;
  let totalRequests = 0;
  const apiIntervals: Interval[] = [];
  const foregroundIntervals: Interval[] = [];
  const allIntervals: Interval[] = [];
  const apiPaths: string[] = [];
  const assetPaths: string[] = [];

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
      if (!isBackgroundRequest(request)) foregroundIntervals.push(interval);
      apiPaths.push(describeRequest(request));
      continue;
    }
    assetPaths.push(new URL(request.url).pathname);
    if (kind === "js") {
      jsBytes += request.encodedBytes;
      codeRequests++;
    } else if (kind === "css") {
      cssBytes += request.encodedBytes;
      codeRequests++;
    }
  }

  const apiWaves = chainPositions(apiIntervals);
  return {
    apiRequests: apiIntervals.length,
    optionsRequests,
    apiBytes,
    jsBytes,
    cssBytes,
    codeRequests,
    totalRequests,
    serialDepth: Math.max(0, ...chainPositions(foregroundIntervals)),
    settledMs: settledTime(allIntervals, windowStartMs, quietMs),
    apiPaths,
    apiWaves,
    assetPaths,
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
