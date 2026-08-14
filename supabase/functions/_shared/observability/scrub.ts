/**
 * PII scrubbing for error-tracking events (#644).
 *
 * Pure TS — no Deno, Node or browser APIs, and no Sentry dependency — so it is
 * imported by the edge functions with a relative path and by the browser
 * through the `@edge-shared` alias. Same arrangement as `provenance/consent.ts`,
 * and for the same reason: the two worlds must not drift.
 *
 * ## What this file is
 *
 * Sentry is declared in the privacy policy as a sub-processor for *technical
 * error data only*, processed under legitimate interest with no consent banner.
 * The thing that makes that statement true is this module, which runs on every
 * event before it leaves the device. A change to the deny lists below is a
 * change to a published legal statement, not a tweak — if you widen what gets
 * through, the policy text has to move with it.
 *
 * ## Why a deny-by-key walker rather than a field allowlist
 *
 * The Sentry event shape grows between SDK versions. An allowlist over known
 * fields would silently pass anything a future version adds; this walks the
 * whole event and redacts *every* surviving string, so a new field arrives
 * already filtered. The named keys below are the ones whose values are dropped
 * outright because their name tells you the content is user data.
 *
 * The SDK config is the first layer (`dataCollection` in
 * `src/lib/observability/sentry.ts` switches off bodies, gen-AI inputs and user
 * info at collection time). This is the second, and it assumes the first one
 * failed.
 */

export const REDACTED = "[redacted]";

/** Bounds an accidental blob — a leaked prompt is long before it is anything else. */
const MAX_STRING = 4096;
const MAX_DEPTH = 8;
const MAX_ARRAY = 100;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Anything shaped like a JWT. Catches Supabase access/refresh tokens, which are
 * the highest-value thing that can end up in an error string here — one of them
 * is a working session.
 */
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;

const AUTH_SCHEME = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Provider key shapes. BYOK means a user's *own* OpenAI/Anthropic key can pass
 * through an edge function, so these are not hypothetical — a provider error
 * that echoes the request would otherwise carry the key into the event.
 */
const KEY_SHAPES: readonly RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic
  /\bsk-proj-[A-Za-z0-9_-]{8,}/g, // OpenAI (project)
  /\bsk-[A-Za-z0-9]{20,}/g, // OpenAI (classic)
  /\b[sprk]k_(?:live|test)_[A-Za-z0-9]{8,}/g, // Stripe
  /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{8,}/g, // Supabase
  /\bAIza[A-Za-z0-9_-]{20,}/g, // Google
  /\br8_[A-Za-z0-9]{20,}/g, // Replicate
];

/**
 * Keys whose value is dropped wholesale, because the name is enough to know it
 * is user content, a credential, or an identifier we have no business sending.
 *
 * Note `messages`/`input`/`prompt` (AI request payloads) sit here while
 * `message` (the error's own text) deliberately does not — that singular/plural
 * distinction is load-bearing and is covered by a test.
 */
const DROP_KEYS: ReadonlySet<string> = new Set([
  // AI request/response payloads — campaign content by definition
  "prompt",
  "prompts",
  "messages",
  "input",
  "inputs",
  "output",
  "outputs",
  "completion",
  "system",
  // Generic content carriers
  "body",
  "payload",
  "content",
  "text",
  "description",
  "notes",
  // Credentials
  "password",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "apiKey",
  "authorization",
  "cookie",
  "cookies",
  "set-cookie",
  // Whole bags, not just the named credential inside them: naming
  // `authorization` alone left `headers: {}` standing, which would have passed
  // a custom `x-api-key` straight through. Neither bag has debugging value
  // here worth that risk.
  "headers",
  // Direct identifiers
  "email",
  "username",
  "ip",
  "ip_address",
  // Local variables captured per stack frame — the single richest leak vector,
  // since a frame inside a generator holds the whole prompt in scope.
  "vars",
]);

/** Keys whose string value is a URL and is rewritten rather than dropped. */
const URL_KEYS: ReadonlySet<string> = new Set([
  "url",
  "href",
  "referrer",
  "referer",
  "to",
  "from",
]);

/**
 * Redact secrets and direct identifiers out of a free-text string.
 *
 * Applied to every string that survives the key deny list, including error
 * messages and breadcrumb text.
 */
export function redactText(value: string): string {
  let out = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  // Scheme-prefixed first: "Bearer eyJ…" should read as "Bearer [redacted]"
  // rather than "Bearer [jwt]", so the scheme survives for debugging.
  out = out.replace(AUTH_SCHEME, (_m, scheme: string) => `${scheme} ${REDACTED}`);
  out = out.replace(JWT, "[jwt]");
  for (const shape of KEY_SHAPES) out = out.replace(shape, "[key]");
  out = out.replace(EMAIL, "[email]");
  return out;
}

/**
 * Reduce a URL to its shape: origin plus path, with uuid segments masked, no
 * query and no fragment.
 *
 * Three separate reasons, all of them real in this app:
 *
 * 1. **The fragment.** Supabase returns from magic-link, OAuth and recovery
 *    flows with `#access_token=…&refresh_token=…`. That URL is the page URL at
 *    the moment an error fires, and it is the payload Sentry attaches first.
 * 2. **The query.** Signed storage URLs carry `?token=…`, and search boxes put
 *    what the user typed into it.
 * 3. **UUID path segments.** Storage paths are `{bucket}/{userId}/{uuid}.webp`,
 *    so the raw path names the user (see the storage-path convention in
 *    CLAUDE.md). The path *shape* is what has debugging value; the ids do not.
 */
export function redactUrl(value: string): string {
  const hashAt = value.indexOf("#");
  const withoutHash = hashAt === -1 ? value : value.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  const path = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const masked = redactText(path).replace(UUID, "{id}");
  return queryAt === -1 ? masked : `${masked}?${REDACTED}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(value: unknown, key: string | null, depth: number, inFrames: boolean): unknown {
  if (depth > MAX_DEPTH) return REDACTED;

  if (typeof value === "string") {
    if (key !== null && URL_KEYS.has(key)) return redactUrl(value);
    return redactText(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY)
      .map((entry) => walk(entry, key, depth + 1, inFrames || key === "frames"));
  }

  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP_KEYS.has(k)) continue;
      // Stack frames are exempt from URL rewriting: `filename` and `abs_path`
      // are how Sentry pairs a frame with its uploaded source map, and a
      // rewritten one un-minifies to nothing. They address our own bundle, not
      // user content — `vars` is the part of a frame that carries user data,
      // and DROP_KEYS already removed it above.
      if (inFrames && (k === "filename" || k === "abs_path" || k === "module")) {
        out[k] = v;
        continue;
      }
      out[k] = walk(v, k, depth + 1, inFrames || k === "frames");
    }
    return out;
  }

  // number | boolean | null | undefined — nothing to redact.
  return value;
}

/**
 * Scrub a Sentry event in place of the original, preserving its type.
 *
 * Generic over the event so callers keep their SDK types; the single cast is
 * contained here because the walker is deliberately written against `unknown`
 * (it must compile without the Sentry types, for the edge functions).
 */
export function scrubEvent<T>(event: T): T {
  const walked = walk(event, null, 0, false);

  if (isPlainObject(walked) && isPlainObject(walked["user"])) {
    // Allowlisted rather than left to DROP_KEYS. `user` is the field most
    // likely to gain a new identifying subkey in an SDK upgrade, and a deny
    // list cannot anticipate the name. The account id is pseudonymous, is not
    // resolvable to a person without the database, and is what makes "one user
    // or everyone?" answerable — so it is the one thing kept.
    const id = walked["user"]["id"];
    walked["user"] = id === undefined ? {} : { id };
  }

  return walked as T;
}
