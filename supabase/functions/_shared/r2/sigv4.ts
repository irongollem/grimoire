// AWS Signature Version 4, as R2's S3-compatible API requires it (#577 stage 2).
//
// WHY HAND-ROLLED RATHER THAN AN SDK:
// `@aws-sdk/*` is tens of megabytes of transitive dependency for one signature,
// on a runtime (Deno edge, cold-started per request) where import cost is the
// dominant latency. SigV4 itself is ~120 lines of HMAC-SHA256 over a string
// built to a fixed shape. The risk in hand-rolling it is getting the shape
// subtly wrong — which is why this file is pinned to AWS's own published
// known-answer vectors in sigv4.test.ts rather than to "it worked once".
//
// Nothing here is Deno-specific: WebCrypto only, so the same module signs from
// an edge function, from the Node copy script, and under vitest.
//
// TWO S3 DEVIATIONS from the generic SigV4 rules, both deliberate:
//
//  1. **The path is URI-encoded once, not twice.** Generic SigV4 encodes the
//     canonical URI a second time; S3 (and therefore R2) does not. Our keys
//     contain user-supplied filenames, so this is not academic: a key with a
//     space or a `+` signs wrong under the generic rule and R2 answers 403.
//  2. **No path normalisation.** `.`/`..` segments are signed as written.
//     `authorizePath` in ../storage-policy.ts has already refused those, so the
//     two rules agree in practice — but the signer must not quietly rewrite a
//     key, or the object would land somewhere other than where it was authorised.
//
// CONTRACT: the `URL` handed to these functions must already carry an
// AWS-encoded path — build it with `encodeKeyPath`. The signer does NOT encode
// it again, because by the time a raw key has been through `new URL(...)` the
// WHATWG parser has already percent-encoded it under *its* rules, and a second
// AWS pass would turn `a%20b` into `a%2520b` and sign a key that does not exist.
// `encodeKeyPath` output is pure ASCII unreserved + `%XX`, which the URL parser
// leaves untouched, so encoding exactly once at the caller round-trips cleanly.

export interface SigV4Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
  /** `s3` for R2. */
  readonly service: string;
}

const ALGORITHM = "AWS4-HMAC-SHA256";
const encoder = new TextEncoder();

/**
 * A `Uint8Array` in the one shape both of this repo's tsconfig projects accept.
 *
 * `BufferSource` is a DOM-lib name, and the scripts project (lib: ES2023 +
 * @types/node, which the copy script compiles under) cannot see it. Meanwhile the
 * app project has DOM but, since TS 5.7, types `Uint8Array` as
 * `Uint8Array<ArrayBufferLike>`, which `BufferSource` rejects anyway — the same
 * widening already worked around in src/lib/storage/upload.ts. Stating it once
 * here beats widening either project's `lib` to accommodate one signature.
 */
export function asBinary(view: Uint8Array): ArrayBuffer {
  return view as unknown as ArrayBuffer;
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const b of view) out += b.toString(16).padStart(2, "0");
  return out;
}

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  return hex(await crypto.subtle.digest("SHA-256", asBinary(bytes)));
}

async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asBinary(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data)));
}

/**
 * AWS's `UriEncode`, which is *not* `encodeURIComponent`: the unreserved set is
 * exactly `A-Za-z0-9-._~`, everything else is percent-encoded with uppercase hex,
 * and a space becomes `%20` rather than `+`. `encodeURIComponent` leaves `!*'()`
 * alone, so using it directly produces a signature AWS/R2 will reject for any key
 * containing those characters.
 */
export function uriEncode(value: string, encodeSlash: boolean): string {
  let out = "";
  for (const byte of encoder.encode(value)) {
    const ch = String.fromCharCode(byte);
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/" && !encodeSlash) {
      out += "/";
    } else {
      out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/** `20150830T123600Z` and `20150830` — the two forms SigV4 wants. */
export function amzDates(date: Date): { amzDate: string; dateStamp: string } {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

/**
 * `AWS4<secret>` → date → region → service → `aws4_request`, each step keyed by
 * the previous result. The chain is what scopes a leaked signature to one day,
 * one region and one service.
 */
const signingKeyCache = new Map<string, Promise<Uint8Array>>();

async function signingKey(creds: SigV4Credentials, dateStamp: string): Promise<Uint8Array> {
  // The chain only changes when the UTC date or the credentials do, so it is
  // derived once per (day, key id, scope) rather than per request — the copy
  // script signs thousands of requests inside one date. Keyed WITHOUT the
  // secret (a Map keyed by secret material would pin it in more places than
  // necessary); the access key id identifies the credential set.
  const cacheKey = `${dateStamp}/${creds.accessKeyId}/${creds.region}/${creds.service}`;
  let key = signingKeyCache.get(cacheKey);
  if (!key) {
    key = (async () => {
      const kDate = await hmac(encoder.encode(`AWS4${creds.secretAccessKey}`), dateStamp);
      const kRegion = await hmac(kDate, creds.region);
      const kService = await hmac(kRegion, creds.service);
      return hmac(kService, "aws4_request");
    })();
    signingKeyCache.clear(); // at most one live entry — yesterday's key is dead weight
    signingKeyCache.set(cacheKey, key);
  }
  return key;
}

function canonicalQuery(params: Iterable<[string, string]>): string {
  // Sorted by encoded key, then encoded value — AWS sorts *after* encoding.
  return [...params]
    .map(([k, v]) => [uriEncode(k, true), uriEncode(v, true)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

function canonicalHeaders(headers: Record<string, string>): {
  canonical: string;
  signed: string;
} {
  const normalised = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return {
    canonical: normalised.map(([k, v]) => `${k}:${v}\n`).join(""),
    signed: normalised.map(([k]) => k).join(";"),
  };
}

/**
 * `/<bucket>/<key>`, AWS-encoded exactly once with `/` separators preserved.
 * This is the only place a raw object key should be turned into a path.
 */
export function encodeKeyPath(...segments: string[]): string {
  return "/" + segments.map((s) => uriEncode(s, false)).join("/").replace(/^\/+/, "");
}

interface CanonicalRequestInput {
  method: string;
  /** Absolute path, **already** AWS-encoded — see the contract note at the top. */
  path: string;
  query: string;
  headers: Record<string, string>;
  payloadHash: string;
}

function canonicalRequest(input: CanonicalRequestInput): { text: string; signedHeaders: string } {
  const { canonical, signed } = canonicalHeaders(input.headers);
  return {
    text: [input.method, input.path, input.query, canonical, signed, input.payloadHash].join("\n"),
    signedHeaders: signed,
  };
}

async function stringToSign(
  creds: SigV4Credentials,
  amzDate: string,
  dateStamp: string,
  canonical: string,
): Promise<{ text: string; scope: string }> {
  const scope = `${dateStamp}/${creds.region}/${creds.service}/aws4_request`;
  return {
    scope,
    text: [ALGORITHM, amzDate, scope, await sha256Hex(canonical)].join("\n"),
  };
}

export interface SignRequestInput {
  method: string;
  url: URL;
  /** Headers to sign. `host` is derived from `url` and must not be passed. */
  headers?: Record<string, string>;
  /**
   * Hex SHA-256 of the body, or the literal `UNSIGNED-PAYLOAD`. R2 accepts
   * `UNSIGNED-PAYLOAD` for streamed bodies; hashing is preferable when the
   * bytes are already in memory, because then the signature covers them.
   */
  payloadHash: string;
  date: Date;
}

/**
 * Sign a request with an `Authorization` header. Returns the headers to send —
 * including `host`, which some fetch implementations set for you and some do
 * not; sending it explicitly keeps the signed set and the sent set identical.
 */
export async function signRequest(
  creds: SigV4Credentials,
  input: SignRequestInput,
): Promise<Record<string, string>> {
  const { amzDate, dateStamp } = amzDates(input.date);

  const headers: Record<string, string> = {
    ...input.headers,
    host: input.url.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": input.payloadHash,
  };

  const { text: canonical, signedHeaders } = canonicalRequest({
    method: input.method,
    path: input.url.pathname,
    query: canonicalQuery(input.url.searchParams),
    headers,
    payloadHash: input.payloadHash,
  });

  const { text: toSign, scope } = await stringToSign(creds, amzDate, dateStamp, canonical);
  const signature = hex(await hmac(await signingKey(creds, dateStamp), toSign));

  return {
    ...headers,
    Authorization:
      `${ALGORITHM} Credential=${creds.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export interface PresignInput {
  method: string;
  url: URL;
  /**
   * Headers the client MUST send verbatim. Every one of these is folded into
   * `X-Amz-SignedHeaders`, so a request that omits or alters any of them fails
   * R2's signature check — that is how `content-length` and `content-type`
   * become enforceable rather than advisory.
   */
  headers?: Record<string, string>;
  expiresInSeconds: number;
  date: Date;
  /** Defaults to `UNSIGNED-PAYLOAD`; a presigner never sees the bytes. */
  payloadHash?: string;
}

/**
 * Produce a presigned URL carrying the signature in the query string.
 *
 * The returned URL is a bearer credential for exactly one method, one key and
 * whatever headers were signed, until it expires. Keep `expiresInSeconds` short
 * and never log the result.
 */
export async function presignUrl(creds: SigV4Credentials, input: PresignInput): Promise<string> {
  const { amzDate, dateStamp } = amzDates(input.date);
  const scope = `${dateStamp}/${creds.region}/${creds.service}/aws4_request`;

  const headers: Record<string, string> = { ...input.headers, host: input.url.host };
  const { signed: signedHeaders } = canonicalHeaders(headers);

  const query: [string, string][] = [
    ...[...input.url.searchParams].map(([k, v]) => [k, v] as [string, string]),
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${creds.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresInSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];

  const { text: canonical } = canonicalRequest({
    method: input.method,
    path: input.url.pathname,
    query: canonicalQuery(query),
    headers,
    payloadHash: input.payloadHash ?? "UNSIGNED-PAYLOAD",
  });

  const { text: toSign } = await stringToSign(creds, amzDate, dateStamp, canonical);
  const signature = hex(await hmac(await signingKey(creds, dateStamp), toSign));

  // Built by hand rather than via URLSearchParams: that encodes a space as `+`
  // and leaves `!*'()` alone, neither of which matches what was signed. The
  // pathname goes out exactly as signed — see the encoding contract up top.
  return `${input.url.origin}${input.url.pathname}?${canonicalQuery(query)}&X-Amz-Signature=${signature}`;
}

export { sha256Hex };

/** Exported for the known-answer tests, which pin the canonical request itself. */
export const __testing = { canonicalRequest, canonicalQuery, stringToSign, signingKey, hex };
