/**
 * cdn.dungeongrimoire.com — asset CDN in front of Supabase Storage (#577 stage 1).
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
 *   out  https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
 *
 * The inbound shape carries no Supabase routing prefix on purpose — `<bucket>/<path>`
 * is exactly the R2 object key for stage 2, so that cutover becomes an origin swap
 * that rewrites zero stored URLs.
 *
 * STAGE 2 NOTE: this Worker is also the dual-read shim the issue calls for. When R2
 * arrives, bind the bucket and try R2 first, falling back to ORIGIN on a miss — then
 * drop the fallback once the copy completes. Do not delete this Worker at the cutover.
 */

const ORIGIN = "https://ypdokpdpvtmyzkltnmsq.supabase.co";
const PREFIX = "/storage/v1/object/public";

// One month, matching the Cache-Control we hand back to browsers. Safe because every
// object path is UUID-based: art changes by getting a new UUID, never by mutating in
// place, so a cached object can never go stale.
const TTL = 2678400;

export default {
  async fetch(request) {
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

    // No bucket allowlist on purpose: every bucket behind this hostname is already
    // public: true in Supabase, so an allowlist would guard nothing while adding a
    // third place that has to stay in sync with the BUCKETS registry.
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
      out.headers.set("Cache-Control", `public, max-age=${TTL}, immutable`);
    }
    // Range support must be advertised or some players will not attempt to seek.
    out.headers.set("Accept-Ranges", "bytes");
    out.headers.set("Access-Control-Allow-Origin", "*");
    return out;
  },
};
