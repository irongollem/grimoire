import { captureEdgeError, functionNameFromUrl } from "./observability/sentryEdge.ts";

// Shared CORS helper.
//
// Instead of a blanket `Access-Control-Allow-Origin: *`, reflect the request's
// Origin only when it's in the allowlist (production app + local dev origins).
// Unknown/missing origins fall back to the production origin so the headers are
// always well-formed but never permissively echo an arbitrary caller.

// The app lives on the app subdomain after the marketing split. The apex
// (dungeongrimoire.com) is kept allowed so the app keeps working during the
// transition — pre-cutover the app is still served from the apex, and these
// edge functions are a single shared deployment that must accept both.
const APP_ORIGIN = "https://app.dungeongrimoire.com";
const APEX_ORIGIN = "https://dungeongrimoire.com";

const ALLOWED_ORIGINS = new Set<string>([
  APP_ORIGIN,
  APEX_ORIGIN,
  "http://localhost:5173",
  "http://localhost:4173", // vite preview
  "http://127.0.0.1:5173",
  // Fixed local dev origin (e.g. via a local TLS proxy / mkcert) — stable
  // across Vite port shuffles, unlike the localhost:<port> entries above.
  "https://grimoire.localhost",
]);

// Error tracking (#644). Unset in local development, where reporting is off.
const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
const SENTRY_ENVIRONMENT = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";

/**
 * Report an unhandled edge-function error, if error tracking is configured.
 *
 * `withCors` is the only place worth doing this: all but four of the 45
 * functions are wrapped in it, so one call here covers the lot and no new
 * function can forget to opt in.
 */
async function reportEdgeError(err: unknown, req: Request): Promise<void> {
  if (!SENTRY_DSN) return;

  const capture = captureEdgeError(
    err,
    { functionName: functionNameFromUrl(req.url), url: req.url, method: req.method },
    { dsn: SENTRY_DSN, environment: SENTRY_ENVIRONMENT },
  );

  // Hand the POST to the runtime where possible so the caller's 500 is not held
  // behind an ingest round trip. Without `waitUntil` the isolate can be torn
  // down mid-flight and the report is simply lost, so the fallback awaits —
  // that path is local dev, where the latency costs nothing. `captureEdgeError`
  // never rejects, so neither branch can turn a handled error into a crash.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(capture);
  else await capture;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

/**
 * Wrap a handler so EVERY response — success, early-return error, thrown
 * exception — carries the CORS headers, and OPTIONS preflights are answered
 * centrally. Without this, any `return new Response(..., { status: 4xx })`
 * that forgets `{ headers: cors }` surfaces in the browser as an opaque
 * "blocked by CORS policy: No 'Access-Control-Allow-Origin' header" instead
 * of its actual error message (this is exactly what hid the chronicle-text
 * prompt-limit 400 during the app-subdomain cutover).
 *
 * Usage: `serve(withCors(async (req) => { ... }));`
 */
export function withCors(
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    let res: Response;
    try {
      res = await handler(req);
    } catch (err) {
      console.error("unhandled edge-function error:", err);
      await reportEdgeError(err, req);
      res = new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", cors["Access-Control-Allow-Origin"]);
    headers.set("Access-Control-Allow-Headers", cors["Access-Control-Allow-Headers"]);
    if (!(headers.get("Vary") ?? "").toLowerCase().includes("origin")) headers.append("Vary", "Origin");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
}
