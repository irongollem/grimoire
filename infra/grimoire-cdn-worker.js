/**
 * cdn.dungeongrimoire.com — asset CDN in front of R2, falling back to Supabase
 * Storage (#577 stages 1 and 2).
 *
 * WHY A WORKER AND NOT A PROXIED CNAME:
 * Supabase Storage sits behind Cloudflare on Supabase's own account. Orange-clouding
 * a CNAME at `<ref>.supabase.co` returns Cloudflare error 1014 ("CNAME Cross-User
 * Banned") on every plan. A Worker's outbound fetch() is not a proxied CNAME, so it
 * is not subject to that rule. Host header and path are both ours to set, which also
 * sidesteps the Origin Rule `host_header` override being a paid-plan entitlement.
 *
 * URL SHAPE:
 *   in   https://cdn.dungeongrimoire.com/<bucket>/<path>
 *   R2   key `<bucket>/<path>` in the ASSETS binding
 *   or   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *
 * The inbound shape carries no Supabase routing prefix on purpose — `<bucket>/<path>`
 * is exactly the R2 object key, which is why moving a bucket's bytes to R2 rewrote
 * zero stored URLs.
 *
 * DUAL-READ, and when each half retires:
 * A bucket's objects are copied to R2 while writes are still landing, so for a
 * window each object may exist in either store or both. R2 is tried first and a
 * miss falls through to Supabase; once a bucket's copy is verified complete and
 * its writes have flipped, that bucket simply stops missing. The fallback is
 * removed for good only when the last bucket has moved — until then, deleting it
 * would 404 every object that has not been copied yet.
 *
 * If the ASSETS binding is absent (a Worker deployed before the R2 bucket exists),
 * every request goes straight to Supabase and this behaves exactly as stage 1 did.
 * That is deliberate: deploying ahead of the infrastructure is a no-op, not an
 * outage.
 */

const ORIGIN = "https://ypdokpdpvtmyzkltnmsq.supabase.co";
const PREFIX = "/storage/v1/object/public";

// One month, matching the Cache-Control we hand back to browsers. Safe because every
// object path is UUID-based: art changes by getting a new UUID, never by mutating in
// place, so a cached object can never go stale.
const TTL = 2678400;
const CACHE_CONTROL = `public, max-age=${TTL}, immutable`;

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    // Require at least `<bucket>/<something>`; a bare bucket listing is not a thing
    // we serve, and rejecting it here keeps those requests off the origin entirely.
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) {
      return new Response("Not found", { status: 404 });
    }

    // EDGE CACHE, explicitly. The origin path gets edge caching for free via its
    // subrequest's `cf.cacheEverything`, but a Response a Worker builds itself
    // (the R2 path) is NOT cached by Cloudflare no matter what Cache-Control it
    // carries — without this block, moving a bucket's bytes to R2 would trade
    // "edge cache hit" for "Worker + R2 read on every single view", quietly
    // reinstating the per-request cost stage 2 exists to remove. Plain full
    // GETs only: the Cache API refuses 206es, and HEADs are not cacheable keys.
    const cacheable = request.method === "GET" && !request.headers.get("range");
    const edgeCache = typeof caches !== "undefined" ? caches.default : null;
    if (cacheable && edgeCache) {
      const hit = await edgeCache.match(request);
      if (hit) return hit;
    }

    // The R2 key is the pathname minus its leading slash — decoded, because R2 keys
    // are raw strings while the URL carries them percent-encoded.
    let key;
    try {
      key = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return new Response("Not found", { status: 404 });
    }

    if (env && env.ASSETS) {
      // A throwing R2 read must not take the request down with it. Supabase
      // still holds every object that has not been deleted (see #617), so the
      // correct response to *any* R2 trouble — an outage, a malformed range, a
      // binding that is somehow wrong — is to serve the object the old way.
      // Without this, one bad R2 call 500s every image and sound in the app.
      try {
        const fromR2 = await serveFromR2(env.ASSETS, key, request);
        if (fromR2) {
          if (cacheable && edgeCache && fromR2.status === 200 && ctx) {
            // Stored after responding; the clone is what keeps the body
            // streamable to both the client and the cache.
            ctx.waitUntil(edgeCache.put(request, fromR2.clone()));
          }
          return fromR2;
        }
      } catch (err) {
        console.error("R2 read failed, falling back to origin:", key, err);
      }
    }

    return serveFromOrigin(url, request);
  },
};

/**
 * Serve an object out of the R2 binding, or null when it is not there.
 *
 * Null (rather than a 404) is what triggers the Supabase fallback, so this must
 * distinguish "no such object" from every other outcome. A precondition failure
 * from `onlyIf` is a real answer — 304/412 — and is returned, not fallen through.
 */
async function serveFromR2(bucket, key, request) {
  const range = request.headers.get("range");

  // HEAD reads metadata only — bucket.get() would pull the whole body out of
  // R2 (50 MB for a mini model) to answer a request that carries none.
  if (request.method === "HEAD") {
    const head = await bucket.head(key);
    if (head === null) return null;
    const headHeaders = new Headers();
    head.writeHttpMetadata(headHeaders);
    headHeaders.set("etag", head.httpEtag);
    headHeaders.set("Cache-Control", CACHE_CONTROL);
    headHeaders.set("Accept-Ranges", "bytes");
    headHeaders.set("Access-Control-Allow-Origin", "*");
    headHeaders.set("Content-Length", String(head.size));
    return new Response(null, { status: 200, headers: headHeaders });
  }

  const object = await bucket.get(key, {
    // Handing R2 the Range header directly lets it serve a partial read without
    // pulling the whole object. Audio players seek constantly; without this every
    // track re-downloads in full and the soundboard becomes unusable.
    range: range ? request.headers : undefined,
    onlyIf: request.headers,
  });

  if (object === null) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Access-Control-Allow-Origin", "*");

  // An object with no body is R2 answering a precondition. Which *status* that
  // means depends on which precondition family the request used: If-None-Match /
  // If-Modified-Since are cache revalidation ("you already have it" → 304),
  // If-Match / If-Unmodified-Since are guarded writes ("your copy is stale" →
  // 412). Keying this on if-none-match alone — as an earlier revision did —
  // answered 412 to a Last-Modified-only revalidation, which clients treat as a
  // hard error instead of a cache hit.
  if (!("body" in object) || object.body === undefined) {
    const revalidation =
      request.headers.get("if-none-match") !== null ||
      request.headers.get("if-modified-since") !== null;
    return new Response(null, { status: revalidation ? 304 : 412, headers });
  }

  if (object.range && range) {
    const { offset = 0, length = object.size - offset } = object.range;
    const end = offset + length - 1;
    headers.set("Content-Range", `bytes ${offset}-${end}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

/** The stage-1 path: proxy to Supabase Storage's public object endpoint. */
async function serveFromOrigin(url, request) {
  const target = ORIGIN + PREFIX + url.pathname + url.search;

  // Forward Range and conditional headers explicitly. Audio players seek with
  // Range requests, so dropping them makes every track unseekable and forces a
  // full re-download; the conditional headers keep 304s working. Host is left
  // to fetch() to derive from the URL — forwarding the original would defeat
  // the whole point of routing through here.
  const headers = new Headers();
  for (const h of ["range", "if-none-match", "if-modified-since", "accept", "accept-encoding"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }

  const response = await fetch(target, {
    method: request.method,
    headers,
    cf: { cacheEverything: true, cacheTtl: TTL },
  });

  const out = new Response(response.body, response);
  // Supabase returns a short max-age; override it, since the whole point of this
  // hostname is that these objects are immutable and should stay at the edge.
  // Only on a full 200 — rewriting Cache-Control on a 206 partial or a 304 is
  // meaningless at best and confuses range-caching at worst.
  if (response.status === 200) {
    out.headers.set("Cache-Control", CACHE_CONTROL);
  }
  // Range support must be advertised or some players will not attempt to seek.
  out.headers.set("Accept-Ranges", "bytes");
  out.headers.set("Access-Control-Allow-Origin", "*");
  return out;
}
