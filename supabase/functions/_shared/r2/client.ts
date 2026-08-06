// Minimal S3 client for R2 — only the four operations #577 stage 2 needs.
//
// Not an SDK wrapper: see sigv4.ts for why. Everything here is `fetch` plus a
// signature, which also means it runs unchanged in Deno (edge functions), Node
// (the copy script) and the browser-free test environment.

import { signRequest, presignUrl, encodeKeyPath, uriEncode, sha256Hex, asBinary } from "./sigv4.ts";
import { r2Credentials, type R2Config } from "./config.ts";

const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

/**
 * `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>` with the key
 * AWS-encoded exactly once. Never build this by string concatenation elsewhere —
 * the single-encode rule is what keeps a signature valid for keys containing
 * spaces or `+`.
 */
function objectUrl(config: R2Config, key: string): URL {
  return new URL(`${config.endpoint}${encodeKeyPath(config.bucket, key)}`);
}

/**
 * The bucket itself, with an AWS-encoded query string.
 *
 * Built by hand rather than via `URLSearchParams`, which encodes a space as `+`
 * where SigV4 requires `%20`. `uriEncode`'s output round-trips: it emits only
 * unreserved characters and `%XX`, so the URL parser leaves it alone and
 * `signRequest` re-derives the identical canonical query from `searchParams`.
 */
function bucketUrl(config: R2Config, query: Record<string, string>): URL {
  const search = Object.entries(query)
    .map(([k, v]) => `${uriEncode(k, true)}=${uriEncode(v, true)}`)
    .join("&");
  return new URL(`${config.endpoint}${encodeKeyPath(config.bucket)}?${search}`);
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  /**
   * `Cache-Control` stored on the object. The Worker overrides this on the way
   * out anyway, but storing it means a direct R2 URL (or a future signed URL)
   * carries the same policy.
   */
  cacheControl?: string;
}

export async function putObject(config: R2Config, input: PutObjectInput): Promise<void> {
  const url = objectUrl(config, input.key);
  // Hashed rather than UNSIGNED-PAYLOAD: the bytes are already in memory, so the
  // signature may as well cover them and catch a corrupted body at the store.
  const payloadHash = await sha256Hex(input.body);

  const headers = await signRequest(r2Credentials(config), {
    method: "PUT",
    url,
    headers: {
      "content-type": input.contentType,
      "content-length": String(input.body.byteLength),
      ...(input.cacheControl ? { "cache-control": input.cacheControl } : {}),
    },
    payloadHash,
    date: new Date(),
  });

  const response = await fetch(url, { method: "PUT", headers, body: asBinary(input.body) });
  if (!response.ok) {
    throw new Error(`R2 PUT ${input.key} failed (${response.status}): ${await safeText(response)}`);
  }
}

/**
 * Fetch an object's bytes with a signed GET. Exists for the copy script's
 * `--verify --deep` (byte-level comparison) — the serving path never uses it,
 * that is what the Worker binding is for.
 */
export async function getObject(config: R2Config, key: string): Promise<Uint8Array | null> {
  const url = objectUrl(config, key);
  const headers = await signRequest(r2Credentials(config), {
    method: "GET",
    url,
    payloadHash: await sha256Hex(new Uint8Array()),
    date: new Date(),
  });

  const response = await fetch(url, { method: "GET", headers });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 GET ${key} failed (${response.status}): ${await safeText(response)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export interface HeadResult {
  /** Null when the response carried no Content-Length — "unknown", never 0. */
  readonly size: number | null;
}

/** Null when the object does not exist — the "already copied?" check. */
export async function headObject(config: R2Config, key: string): Promise<HeadResult | null> {
  const url = objectUrl(config, key);
  const headers = await signRequest(r2Credentials(config), {
    method: "HEAD",
    url,
    payloadHash: await sha256Hex(new Uint8Array()),
    date: new Date(),
  });

  const response = await fetch(url, { method: "HEAD", headers });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 HEAD ${key} failed (${response.status})`);
  }
  // Absence stays null rather than coercing to 0 — the copy script compares
  // this against the source size to decide "already copied", and a fake zero
  // would turn "unknown" into "mismatched", or worse, match a real empty file.
  const contentLength = response.headers.get("content-length");
  return { size: contentLength === null ? null : Number(contentLength) };
}

/**
 * Delete objects one request each rather than via S3's batch `DeleteObjects`.
 *
 * The batch call requires a `Content-MD5` header, and MD5 is not in WebCrypto —
 * supporting it would mean vendoring a hash implementation to save round trips on
 * an operation that deletes at most five keys at a time (an original plus its four
 * width variants). Individual DELETEs are also idempotent: S3 answers 204 for a
 * key that was never there, so a re-run of a partially-failed delete is safe.
 */
export async function deleteObjects(config: R2Config, keys: string[]): Promise<void> {
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      const url = objectUrl(config, key);
      const headers = await signRequest(r2Credentials(config), {
        method: "DELETE",
        url,
        payloadHash: await sha256Hex(new Uint8Array()),
        date: new Date(),
      });
      const response = await fetch(url, { method: "DELETE", headers });
      if (!response.ok && response.status !== 404) {
        throw new Error(`R2 DELETE ${key} failed (${response.status})`);
      }
    }),
  );

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length) {
    throw new Error(failures.map((f) => String(f.reason)).join("; "));
  }
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/**
 * Undo XML escaping in a `<Key>` value.
 *
 * S3 escapes the five predefined entities in listing output, so a key containing
 * `&` comes back as `&amp;` — deleting it verbatim would target a key that does
 * not exist and report success.
 */
function unescapeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);
}

/**
 * Parse object keys and the continuation token out of a ListObjectsV2 response.
 *
 * Extracted from the request so it can be tested against a captured response
 * body. Regex rather than an XML parser because Deno has no DOM, the shape is
 * fixed and shallow, and `<Key>` is only ever read from inside `<Contents>` —
 * `<CommonPrefixes>` uses `<Prefix>`, so there is nothing to confuse it with.
 */
export function parseListResponse(xml: string): { keys: string[]; nextToken: string | null } {
  const keys: string[] = [];
  for (const [, contents] of xml.matchAll(/<Contents\b[^>]*>([\s\S]*?)<\/Contents>/g)) {
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(contents);
    if (key) keys.push(unescapeXml(key[1]));
  }
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const token = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
  return { keys, nextToken: truncated && token ? unescapeXml(token[1]) : null };
}

/**
 * Every key under `prefix`, following continuation tokens to the end.
 *
 * Needed because "delete everything belonging to this entity" is expressed as a
 * prefix everywhere in this codebase — S3 has no prefix delete, so the keys have
 * to be enumerated first.
 */
export async function listObjects(config: R2Config, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | null = null;

  do {
    const url = bucketUrl(config, {
      "list-type": "2",
      prefix,
      "max-keys": "1000",
      ...(token ? { "continuation-token": token } : {}),
    });
    const headers = await signRequest(r2Credentials(config), {
      method: "GET",
      url,
      payloadHash: await sha256Hex(new Uint8Array()),
      date: new Date(),
    });

    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      throw new Error(`R2 LIST ${prefix} failed (${response.status}): ${await safeText(response)}`);
    }
    const parsed = parseListResponse(await response.text());
    keys.push(...parsed.keys);
    token = parsed.nextToken;
  } while (token);

  return keys;
}

export interface PresignPutInput {
  key: string;
  contentType: string;
  /** Exact byte length, pinned into the signed `Content-Length`. */
  size: number;
  expiresInSeconds: number;
}

/**
 * A URL the client may PUT exactly one object to, of exactly one type and exactly
 * one length, for a short window.
 *
 * `content-type` and `content-length` are signed, so R2 rejects a body that does
 * not match what the edge function authorised. That is the whole mechanism by
 * which the per-bucket MIME and size limits survive the move off Supabase — R2
 * itself has no notion of either.
 */
export function presignPut(config: R2Config, input: PresignPutInput): Promise<string> {
  return presignUrl(r2Credentials(config), {
    method: "PUT",
    url: objectUrl(config, input.key),
    headers: {
      "content-type": input.contentType,
      "content-length": String(input.size),
    },
    expiresInSeconds: input.expiresInSeconds,
    date: new Date(),
    payloadHash: UNSIGNED_PAYLOAD,
  });
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

/** Exported for tests that assert the URL/encoding contract without a network. */
export const __testing = { objectUrl, bucketUrl };
