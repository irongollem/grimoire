import { captureEdgeError, functionNameFromUrl } from "./sentryEdge.ts";

/**
 * The Deno-facing half of edge error reporting (#644).
 *
 * `sentryEdge.ts` and `scrub.ts` are deliberately free of runtime APIs so they
 * can be unit tested under vitest like every other `_shared` logic module. This
 * file is where the impurity lives — reading `Deno.env`, and reaching for
 * `EdgeRuntime.waitUntil` — which is why it is the one file in this folder that
 * `tsconfig.app.json` does not include.
 */

// Unset in local development, where reporting is off.
const SENTRY_DSN = Deno.env.get("SENTRY_DSN");
const SENTRY_ENVIRONMENT = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";

/** Report an unhandled edge-function error, if error tracking is configured. */
export async function reportEdgeError(err: unknown, req: Request): Promise<void> {
  if (!SENTRY_DSN) return;

  const capture = captureEdgeError(
    err,
    { functionName: functionNameFromUrl(req.url), url: req.url, method: req.method },
    { dsn: SENTRY_DSN, environment: SENTRY_ENVIRONMENT },
  );

  // Hand the POST to the runtime where possible so the caller's response is not
  // held behind an ingest round trip. Without `waitUntil` the isolate can be
  // torn down mid-flight and the report is simply lost, so the fallback awaits —
  // that path is local dev, where the latency costs nothing. `captureEdgeError`
  // never rejects, so neither branch can turn a handled error into a crash.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(capture);
  else await capture;
}

/**
 * Report unhandled errors from a handler that does **not** use `withCors`.
 *
 * `withCors` already reports (and answers 500) for the 41 functions it wraps.
 * The remaining four own their own `Deno.serve` handler and their own response
 * shapes, so this reports and then **rethrows** rather than substituting a
 * response of its own. Behaviour is therefore byte-identical to before: an
 * unhandled throw still reaches `Deno.serve` and still produces its default
 * 500. The only change is that we now hear about it.
 *
 * Usage: `Deno.serve(withErrorReporting(async (req) => { ... }));`
 */
export function withErrorReporting(
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      console.error("unhandled edge-function error:", err);
      await reportEdgeError(err, req);
      throw err;
    }
  };
}
