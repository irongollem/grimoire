import { scrubEvent, redactText, redactUrl } from "./scrub.ts";

/**
 * Minimal Sentry client for the edge functions (#644).
 *
 * ## Why this is hand-rolled rather than `@sentry/deno`
 *
 * Adding the SDK would put an npm dependency into all 45 function bundles, and
 * edge deploys resolve every dependency over the network at deploy time — the
 * `Deploy Edge Functions` step in test.yml retries three times precisely
 * because an esm.sh blip has already killed a release *after* `db push` had
 * landed, leaving production schema ahead of function code. Paying that risk on
 * every deploy, for the error reporter, is the wrong trade.
 *
 * The Sentry ingest contract is small and stable: an envelope of three
 * newline-separated JSON lines, POSTed. What the SDK would add on top —
 * breadcrumbs, sessions, tracing, auto-instrumentation — is either unwanted
 * here or unavailable in an isolate that handles one request and exits.
 *
 * ## Deliberately free of Deno APIs
 *
 * Every export is pure or takes its effects as arguments, so this is unit
 * tested under vitest like the other `_shared` logic modules. The caller reads
 * `Deno.env` and passes the config in.
 */

export interface EdgeSentryConfig {
  /** `SENTRY_DSN` secret. Absent disables reporting — see `edgeSentryConfig`. */
  dsn: string;
  environment: string;
}

export interface EdgeErrorContext {
  /** The edge function that threw, e.g. `generate-npc`. Becomes a Sentry tag. */
  functionName: string;
  url?: string;
  method?: string;
}

interface StackFrame {
  filename: string;
  function?: string;
  lineno: number;
  colno: number;
  in_app: boolean;
}

const SDK_NAME = "grimoire.edge";
const SDK_VERSION = "1.0.0";

/** `https://<publicKey>@<host>/<projectId>` → the envelope endpoint for it. */
export function parseDsn(dsn: string): { endpoint: string; publicKey: string } | null {
  const match = /^https:\/\/([0-9a-f]+)@([^/]+)\/(\d+)$/i.exec(dsn.trim());
  if (!match) return null;
  const [, publicKey, host, projectId] = match;
  return { endpoint: `https://${host}/api/${projectId}/envelope/`, publicKey };
}

/**
 * Parse a V8 stack into Sentry frames.
 *
 * Without this the whole trace arrives as one opaque string and every error in
 * a function groups into a single issue. Sentry orders frames oldest-first,
 * which is the reverse of how V8 prints them.
 */
export function parseStackFrames(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];

  for (const line of stack.split("\n")) {
    // `at fn (file:///a/b.ts:1:2)` | `at file:///a/b.ts:1:2` | `at async fn (…)`
    const match = /^\s*at\s+(?:(?<fn>.+?)\s+\()?(?<loc>.+?):(?<line>\d+):(?<col>\d+)\)?\s*$/.exec(
      line,
    );
    if (!match?.groups) continue;

    const fn = match.groups["fn"]?.replace(/^async\s+/, "");
    const filename = match.groups["loc"] ?? "";
    frames.push({
      filename,
      ...(fn ? { function: fn } : {}),
      lineno: Number(match.groups["line"]),
      colno: Number(match.groups["col"]),
      // Our own code is what is worth expanding by default; anything resolved
      // from a registry is a dependency's frame.
      in_app: !/(^|\/)(deno\.land|esm\.sh|jsr\.io|cdn\.jsdelivr\.net|node_modules)\//.test(
        filename,
      ),
    });
  }

  return frames.reverse();
}

/**
 * Build the scrubbed event payload.
 *
 * `eventId` and `timestamp` are arguments rather than generated here so the
 * result is a pure function of its inputs and can be asserted in a test.
 */
export function buildEdgeEvent(
  error: unknown,
  context: EdgeErrorContext,
  config: EdgeSentryConfig,
  eventId: string,
  timestamp: number,
): Record<string, unknown> {
  const isError = error instanceof Error;
  const stack = isError ? (error.stack ?? "") : "";
  const frames = parseStackFrames(stack);

  return scrubEvent({
    event_id: eventId,
    timestamp,
    platform: "javascript",
    level: "error",
    environment: config.environment,
    logger: "edge",
    sdk: { name: SDK_NAME, version: SDK_VERSION },
    tags: {
      // Not `function` — that key names a *stack frame* elsewhere in the
      // schema, and reusing it here makes a tag and a frame read alike in
      // search. `edge_function` says which of the 45 threw.
      edge_function: context.functionName,
      runtime: "supabase-edge",
    },
    ...(context.url ? { request: { url: context.url, method: context.method } } : {}),
    exception: {
      values: [
        {
          type: isError ? error.name : "UnknownError",
          value: redactText(isError ? error.message : String(error)),
          ...(frames.length > 0 ? { stacktrace: { frames } } : {}),
          // `handled: true` — withCors caught it and answered 500. It is a
          // failed request, not a dead isolate, and the inbox should say so.
          mechanism: { type: "withCors", handled: true },
        },
      ],
    },
  });
}

/** Serialise an event as a Sentry envelope: header, item header, payload. */
export function buildEnvelope(event: Record<string, unknown>, dsn: string): string {
  const header = JSON.stringify({ event_id: event["event_id"], dsn });
  const payload = JSON.stringify(event);
  const itemHeader = JSON.stringify({ type: "event", content_type: "application/json" });
  return `${header}\n${itemHeader}\n${payload}`;
}

/**
 * Report an error to Sentry. Never throws and never rejects — a failure to
 * report an error must not become a second error.
 *
 * The caller decides whether to await: `withCors` hands this to
 * `EdgeRuntime.waitUntil` where available, so the 500 is not held up behind an
 * ingest round trip.
 */
export async function captureEdgeError(
  error: unknown,
  context: EdgeErrorContext,
  config: EdgeSentryConfig,
  deps: {
    fetch?: typeof fetch;
    eventId?: string;
    now?: () => number;
  } = {},
): Promise<void> {
  try {
    const parsed = parseDsn(config.dsn);
    if (!parsed) {
      console.error("SENTRY_DSN is set but malformed; error not reported");
      return;
    }

    const doFetch = deps.fetch ?? fetch;
    const eventId = deps.eventId ?? crypto.randomUUID().replaceAll("-", "");
    const timestamp = (deps.now ?? Date.now)() / 1000;

    const event = buildEdgeEvent(
      error,
      { ...context, url: context.url ? redactUrl(context.url) : undefined },
      config,
      eventId,
      timestamp,
    );

    await doFetch(parsed.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=${SDK_NAME}/${SDK_VERSION}, sentry_key=${parsed.publicKey}`,
      },
      body: buildEnvelope(event, config.dsn),
      // The isolate may be torn down the moment the response is returned; a
      // hung ingest connection must not hold it open.
      signal: AbortSignal.timeout(3000),
    });
  } catch (reportingError) {
    console.error("failed to report error to Sentry:", reportingError);
  }
}

/**
 * Derive the function name from the request URL.
 *
 * Supabase routes an invocation to `/<function-name>` (and `/functions/v1/<name>`
 * when called through the gateway), so the last of those two segments is the
 * name. Falls back to `unknown` rather than throwing inside an error handler.
 */
export function functionNameFromUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    if (segments[0] === "functions" && segments[1] === "v1") return segments[2] ?? "unknown";
    return segments[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}
