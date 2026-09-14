/* eslint-disable no-undef */
// Grimoire service worker — hand-rolled, no workbox.
//
// Build-time substitutions (see `swPlugin` in vite.config.ts):
//   __PRECACHE__         → JSON array of precached paths (the boot shell only)
//   __MUTABLE__          → JSON array of paths copied verbatim from public/, i.e.
//                          the served paths whose bytes can change without the
//                          filename changing
//   __CACHE_NAME__       → "grimoire-<8-char hash>" — bumped whenever any precached
//                          file's hash changes, forcing a fresh cache on deploy
//   __ASSET_CDN_ORIGIN__ → the CDN's origin (e.g. "https://cdn.dungeongrimoire.com"),
//                          or "" when `VITE_ASSET_CDN_URL` is unset — see the
//                          CDN ART CACHE section below. Empty string must make
//                          the whole runtime rule it drives inert (#864/#877).
//
// THREE CACHES, AND ONLY ONE OF THEM IS SWEPT ON DEPLOY.
//   CACHE_NAME    — the boot shell. Versioned, rebuilt on every deploy whose
//                   shell changed, and garbage-collected by `activate`.
//   RUNTIME_CACHE — same-origin assets outside the shell, populated on first
//                   real use. Deliberately NOT versioned and deliberately
//                   spared by `activate`: its entries are content-hashed, so a
//                   new deploy simply asks for different filenames and the old
//                   ones age out via the entry bound. Sweeping it per deploy
//                   would make every release re-download every route and every
//                   image a user had already paid for, which is the cost this
//                   split exists to avoid.
//   ART_CACHE     — static app art served cross-origin from the asset CDN
//                   (cardforge, Scriptorium, placeholders, sheet plates).
//                   Same reasoning and same exemption from `activate` as
//                   RUNTIME_CACHE, and for the same reason: its keys are
//                   content-hashed by `art-manifest.ts`, so an old key simply
//                   stops being requested once nothing links to it, rather
//                   than needing to be swept. THIS IS THE ONE THE WHOLE STORY
//                   HINGES ON — see the CDN ART CACHE section: sweep this on
//                   deploy and the lazy cache re-downloads all of it forever.
//
// WHY THE PRECACHE IS ONLY THE SHELL: it used to be all of `dist/` under 3 MB
// — 36.4 MB on a first visit, 26.1 MB of it art nobody had asked to see, plus
// all 449 JS chunks including the lazy `model-viewer`, `documents` and `pdf`
// routes. See the `swPlugin` doc comment for the full account. Art has since
// moved to the CDN entirely (see below), so it no longer competes for a place
// in `dist/`'s precache at all — this section is kept for the JS/CSS half of
// that history.
//
// Behaviour:
//   install   — populate `__CACHE_NAME__`, reusing unchanged hashed assets
//               from the previous deploy's cache, then skip waiting so the
//               new worker activates immediately (matches the old plugin's
//               autoUpdate mode). The install is ATOMIC for the app shell:
//               if index.html or any JS/CSS fails to cache, the install
//               rejects and the browser keeps the old worker AND its
//               complete cache — a flaky connection can only delay an
//               update, never trade a working cache for a partial one.
//               (registration.update() is polled by swAutoUpdate, so a
//               failed install retries within minutes.)
//   activate  — claim clients, then delete every cache whose name doesn't
//               match __CACHE_NAME__, RUNTIME_CACHE or ART_CACHE
//               (garbage-collects old deploys only). Runs only after a fully
//               successful install, so the old cache is never deleted before
//               the new one is complete.
//   fetch     — CDN-origin GETs under ART_PATH_PREFIX (when __ASSET_CDN_ORIGIN__
//               is set) → cache-first against ART_CACHE; see the CDN ART CACHE
//               section. Everything
//               else is same-origin GETs only:
//                 • navigations (mode: 'navigate') → network raced against a
//                   short timeout; on timeout or failure serve the cached
//                   /index.html, so a slow connection never means staring at
//                   a white screen while fetch() decides to give up.
//                 • a precached shell asset → cache-first.
//                 • any other static asset → runtime-cached on first use:
//                   cache-first when the filename carries a content hash
//                   (immutable by construction), stale-while-revalidate when
//                   it came from public/ and could change under a stable name.
//               Every other cross-origin request and every non-GET request is
//               passed through to the network untouched (we never cache
//               Supabase / OpenAI calls).
//
// CDN ART CACHE (#864/#877): static app art moved out of `dist/` and out of
// the precache entirely once `VITE_ASSET_CDN_URL` is set — see `artStripPlugin`
// in vite.config.ts. It is now fetched lazily, on first real request, from a
// different origin, and kept in ART_CACHE forever after: every key under
// `__ASSET_CDN_ORIGIN__` is content-hashed by `art-manifest.ts` (a new upload
// gets a new key), so there is no mutable case to revalidate here the way
// public/ assets need SWR — cache-first with no network check is always
// correct. The one failure mode worth naming explicitly, because nothing
// else catches it: if `activate` ever swept ART_CACHE the way it sweeps
// CACHE_NAME, every deploy would silently re-download the entire art set for
// every visitor, forever — the lazy-cache win this story exists to deliver
// would quietly undo itself with no error anywhere in the build.
//
// The old vite-plugin-pwa also ran `clients.claim()` and `skipWaiting()`,
// and `main.ts` reloads the page on `controllerchange`. Preserved.

const CACHE_NAME = "__CACHE_NAME__";
const PRECACHE = /** @type {string[]} */ (__PRECACHE__);

// Unversioned on purpose — see the three-caches note above.
const RUNTIME_CACHE = "grimoire-runtime";

/**
 * Entry bound for RUNTIME_CACHE. Every deploy re-hashes changed chunks, so
 * without a bound a long-lived install accretes one dead entry per chunk per
 * release forever. Cache.keys() yields insertion order, so the trim is a
 * plain FIFO — approximate, and much cheaper than tracking real usage.
 */
const RUNTIME_MAX_ENTRIES = 250;

// Unversioned, exempt from `activate`'s sweep — see the CDN ART CACHE note
// above. A distinct name from RUNTIME_CACHE on purpose: art and JS/CSS chunks
// have different lifetimes and different origins, and keeping them in
// separate caches means either one can be reasoned about (and, if it ever
// came to that, cleared) independently of the other.
const ART_CACHE = "grimoire-art";

/**
 * The CDN's origin, e.g. "https://cdn.dungeongrimoire.com", or "" when
 * `VITE_ASSET_CDN_URL` is unset. Every check against it below treats "" as
 * "never matches" (no request's `url.origin` is ever the empty string), which
 * is what makes the whole CDN art rule inert with no CDN configured.
 */
const ASSET_CDN_ORIGIN = /** @type {string} */ (__ASSET_CDN_ORIGIN__);

/**
 * Path prefix every published art object is served under — the R2 key
 * `art-manifest.ts` mints is exactly the CDN pathname (see
 * grimoire-cdn-worker.js), and that key always starts with `ART_PREFIX`
 * (`src/lib/assets/artPrefix.ts`, currently "app-art"). Hardcoded rather than
 * templated in: this file is a build-time template substituted by
 * `swPlugin` in vite.config.ts, which this script does not own, and
 * artPrefix.ts is the source of truth to keep this in sync with if it ever
 * changes.
 */
const ART_PATH_PREFIX = "/app-art/";

/**
 * Entry bound for ART_CACHE. `art-manifest.ts` mints a new content-hashed key
 * for every changed file, so a long-lived install otherwise accretes one dead
 * entry per re-hashed asset per deploy forever, exactly like RUNTIME_CACHE.
 * ~166 files exist today (see common.md's inventory); this leaves headroom
 * for several deploys' worth of re-hashed art between evictions before the
 * FIFO bound starts trimming entries still in active use.
 */
const ART_CACHE_MAX_ENTRIES = 400;

/**
 * Paths served verbatim out of public/. Their bytes can change while the
 * filename stays put, so they are the ones that need revalidating; anything
 * else under /assets/ carries Vite's content hash and can be trusted forever.
 * Supplied by the build because the filename genuinely cannot answer this —
 * `dragons-watch-tc.webp` looks exactly like a hashed name to any regex.
 */
const MUTABLE = new Set(/** @type {string[]} */ (__MUTABLE__));

/** Static assets we are willing to keep in RUNTIME_CACHE. */
const RUNTIME_CACHEABLE = /\.(js|css|woff2?|ttf|otf|ico|png|svg|webp|jpe?g|avif|webmanifest)$/i;

// How long a navigation waits on the network before falling back to the
// cached shell. Freshness is guaranteed by the update poll + cache-name bust,
// so the only cost of losing the race is adopting a deploy one reload later.
const NAV_TIMEOUT_MS = 2500;

// The app cannot start without these — index.html and every JS/CSS chunk.
// Anything else (icons, webp art, webmanifest) is nice-to-have: it may
// legitimately 404 (e.g. manifest.webmanifest behind Vercel Deployment
// Protection on previews) and the runtime network fetch covers it.
function isCriticalAsset(path) {
  return path === "/index.html" || /\.(js|css)$/i.test(path);
}

// The SPA rewrite can answer a not-yet-provisioned asset URL with the app's
// index.html and status 200. Caching that response under a .js/.css key makes
// the install look complete, then the browser rejects it under `nosniff` and
// the freshly claimed page white-screens. Validate the MIME type as well as
// the status for every file the browser must execute or parse.
function hasExpectedContentType(path, response) {
  const type = (response.headers.get("content-type") || "").toLowerCase();
  if (path === "/index.html") return type.includes("text/html");
  if (/\.js$/i.test(path)) {
    return type.includes("javascript") || type.includes("ecmascript");
  }
  if (/\.css$/i.test(path)) return type.includes("text/css");
  return true;
}

function isUsableResponse(path, response) {
  return response.ok && hasExpectedContentType(path, response);
}

// Vite writes content-hashed output under /assets/ — same filename means same
// bytes, so those entries can be copied forward from the previous deploy's
// cache instead of re-downloaded. Everything else (index.html, public/ files
// copied verbatim) can change without a rename and must be refetched.
//
// The MUTABLE check is load-bearing rather than belt-and-braces: `public/`
// keeps its own directory structure inside dist, so a file like
// `/assets/cardforge/loot-backs/dragons-watch-tc.webp` is served from /assets/
// while carrying no content hash at all. Testing the prefix alone treated
// those as immutable and copied a stale copy forward on every subsequent
// deploy — permanently, since nothing else would ever evict it.
function isImmutableAsset(path) {
  return path.startsWith("/assets/") && !MUTABLE.has(path);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const failedCritical = [];
      await Promise.all(
        PRECACHE.map(async (path) => {
          // Copy forward from the previous deploy's cache when the content
          // hash in the filename guarantees the bytes are identical. At this
          // point the new cache doesn't contain `path` yet, so caches.match
          // can only hit an old cache.
          if (isImmutableAsset(path)) {
            const previous = await caches.match(path);
            if (previous && isUsableResponse(path, previous)) {
              await cache.put(path, previous);
              return;
            }
          }
          try {
            const response = await fetch(new Request(path, { cache: "reload" }));
            if (isUsableResponse(path, response)) {
              await cache.put(path, response);
              return;
            }
          } catch {
            // fall through to the critical check below
          }
          // Non-ok or network failure. Use fetch + conditional put instead of
          // cache.add throughout so 4xx responses on non-critical files are
          // skipped without console errors (cache.add rejects on non-ok and
          // the browser logs it even when caught).
          if (isCriticalAsset(path)) failedCritical.push(path);
        }),
      );
      if (failedCritical.length > 0) {
        // Reject the install so this worker is discarded and the previous
        // worker keeps serving its complete cache. Drop the partial cache —
        // activate (which would garbage-collect into it) will never run, and
        // the retry rebuilds it from copy-forward + HTTP cache cheaply.
        await caches.delete(CACHE_NAME);
        throw new Error(
          `precache failed for ${failedCritical.length} critical asset(s): ${failedCritical
            .slice(0, 5)
            .join(", ")}`,
        );
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // RUNTIME_CACHE and ART_CACHE are both spared. Each holds content-hashed
      // assets a user has already downloaded — routes they have opened, art
      // they have seen — so deleting either here would make every deploy
      // re-fetch all of it. Old entries stop being requested the moment their
      // hash changes and leave via their own FIFO bound instead.
      //
      // ART_CACHE spared is the one load-bearing line in this whole file: get
      // it wrong (e.g. by filtering only CACHE_NAME and RUNTIME_CACHE) and
      // every deploy silently wipes every piece of app art a visitor has ever
      // cached, forever — the exact regression #864/#877 exist to prevent,
      // and nothing except the test suite would ever notice.
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE && k !== ART_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Static app art, served cross-origin from the asset CDN. Checked before the
  // same-origin guard below on purpose — this is the one request this worker
  // deliberately handles cross-origin. `ASSET_CDN_ORIGIN` is "" when no CDN is
  // configured, and no request's origin is ever the empty string, so this
  // branch is unreachable — inert — in that case, exactly as required.
  //
  // Matched on ART_PATH_PREFIX, not origin alone: the same CDN origin also
  // fronts every Supabase storage bucket (src/lib/storage/buckets.ts, all
  // `cdn: true`), which are not content-hashed the way published art is, and
  // must not be cached forever on that promise.
  if (ASSET_CDN_ORIGIN && url.origin === ASSET_CDN_ORIGIN && url.pathname.startsWith(ART_PATH_PREFIX)) {
    event.respondWith(serveFromArtCache(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // SPA navigation — network-first, but only for NAV_TIMEOUT_MS: on a slow
  // connection fetch() can hang for tens of seconds before failing, and the
  // user would stare at a white screen with a perfectly good shell in the
  // cache. Lose the race → serve cached /index.html immediately. No cached
  // copy (first ever visit) → keep waiting on the original network fetch.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const network = fetch(req);
        const fresh = await Promise.race([
          network.catch(() => undefined),
          new Promise((resolve) => setTimeout(() => resolve(undefined), NAV_TIMEOUT_MS)),
        ]);
        if (fresh) return fresh;
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("/index.html");
        if (cached) return cached;
        try {
          return await network;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  // Cache-first for precached shell assets (JS / CSS / icons). The build
  // hashes bust the cache on each deploy, so we never serve stale JS as long
  // as the HTML loading it is fresh. Anything outside the shell — a lazy
  // route's chunk, a sheet plate, a deck back — falls through to the runtime
  // cache, which fills in on first real use.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req);
      if (hit) return hit;
      return serveFromRuntime(event, req, url.pathname);
    })(),
  );
});

/**
 * Everything not in the boot shell: cached the first time it is genuinely
 * asked for, which is the whole point of the split.
 *
 * Two policies, because two kinds of file end up here:
 *   • content-hashed (`/assets/index-9LA7zDLU.js`) — the filename is a
 *     statement about the bytes, so a hit is always correct: cache-first, no
 *     revalidation, no network at all.
 *   • copied from public/ (`/assets/placeholders/npc.webp`) — same name can
 *     mean new bytes after a deploy, so serve the cached copy immediately and
 *     refresh in the background. A user sees last deploy's art at worst once.
 *
 * @param {FetchEvent} event
 * @param {Request} req
 * @param {string} path
 */
async function serveFromRuntime(event, req, path) {
  if (!RUNTIME_CACHEABLE.test(path)) {
    // Not a static asset we have any business storing — pass it through.
    try {
      return await fetch(req);
    } catch {
      return Response.error();
    }
  }

  const runtime = await caches.open(RUNTIME_CACHE);
  const cached = await runtime.match(req);
  if (cached && isImmutableAsset(path)) return cached;

  const update = fetch(req)
    .then(async (response) => {
      // `basic` excludes opaque cross-origin responses, which have status 0
      // and would poison the cache with something we cannot even read. This
      // handler is same-origin already, but a redirect off-origin would
      // otherwise land here.
      if (response.ok && response.type === "basic") {
        await runtime.put(req, response.clone());
        await trimCache(runtime, RUNTIME_MAX_ENTRIES);
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // Stale-while-revalidate. waitUntil keeps the worker alive for the
    // refresh; without it the browser may kill us the moment we respond and
    // the cached copy would never update.
    event.waitUntil(update);
    return cached;
  }

  const fresh = await update;
  return fresh ?? Response.error();
}

/**
 * Static app art from the asset CDN — see the CDN ART CACHE header comment.
 * Cache-first with no revalidation, full stop: every key here is
 * content-hashed by `art-manifest.ts`, so unlike `serveFromRuntime` there is
 * no mutable case to distinguish and no background refresh to schedule. A hit
 * is always correct; a miss is fetched once and kept for good (until the FIFO
 * bound evicts it).
 *
 * @param {Request} req
 */
async function serveFromArtCache(req) {
  const cache = await caches.open(ART_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const response = await fetch(req);
    // An `<img>` with no `crossorigin` attribute fetches cross-origin
    // resources in "no-cors" mode, so the CDN's response comes back opaque:
    // status 0, `ok` always false — even though the Worker already sends
    // `Access-Control-Allow-Origin: *` (infra/grimoire-cdn-worker.js) and the
    // bytes are perfectly good; the browser still paints an opaque image
    // fine, only script cannot inspect it. Requiring `response.ok` alone
    // would mean this cache silently never fills for that common case, with
    // no error anywhere — accepting `type === "opaque"` too is what keeps it
    // from being a second version of the trap this story exists to avoid.
    // Safe specifically because every key here is content-addressed and
    // immutable (a changed file gets a new hashed key): there is no
    // "wrong content under this key" for an unreadable status to hide.
    if (response.ok || response.type === "opaque") {
      await cache.put(req, response.clone());
      await trimCache(cache, ART_CACHE_MAX_ENTRIES);
    }
    return response;
  } catch {
    return Response.error();
  }
}

/**
 * FIFO trim shared by every cache with an entry bound. `Cache.keys()` yields
 * insertion order, so this is approximate rather than true LRU — much cheaper
 * than tracking real usage, and good enough for a bound whose job is "don't
 * grow forever", not "evict optimally".
 *
 * @param {Cache} cache
 * @param {number} maxEntries
 */
async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  const excess = keys.length - maxEntries;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
}
