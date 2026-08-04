/* eslint-disable no-undef */
// Grimoire service worker — hand-rolled, no workbox.
//
// Build-time substitutions (see `swPlugin` in vite.config.ts):
//   __PRECACHE__    → JSON array of precached paths
//   __CACHE_NAME__  → "grimoire-<8-char hash>" — bumped whenever any precached
//                     file's hash changes, forcing a fresh cache on deploy
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
//               match __CACHE_NAME__ (garbage-collects old deploys). Runs
//               only after a fully successful install, so the old cache is
//               never deleted before the new one is complete.
//   fetch     — same-origin GETs only:
//                 • navigations (mode: 'navigate') → network raced against a
//                   short timeout; on timeout or failure serve the cached
//                   /index.html, so a slow connection never means staring at
//                   a white screen while fetch() decides to give up.
//                 • everything else → cache-first, with network fallback.
//               Cross-origin and non-GET requests are passed through to the
//               network untouched (we never cache Supabase / OpenAI calls).
//
// The old vite-plugin-pwa also ran `clients.claim()` and `skipWaiting()`,
// and `main.ts` reloads the page on `controllerchange`. Preserved.

const CACHE_NAME = "__CACHE_NAME__";
const PRECACHE = /** @type {string[]} */ (__PRECACHE__);

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

// Vite writes all content-hashed output under /assets/ — same filename means
// same bytes, so those entries can be copied forward from the previous
// deploy's cache instead of re-downloaded. Everything else (index.html,
// public/ files copied verbatim) can change without a rename and must be
// refetched.
function isImmutableAsset(path) {
  return path.startsWith("/assets/");
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
            if (previous) {
              await cache.put(path, previous);
              return;
            }
          }
          try {
            const response = await fetch(new Request(path, { cache: "reload" }));
            if (response.ok) {
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
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
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

  // Cache-first for precached assets (JS / CSS / fonts / icons / webp). The
  // build hashes bust the cache on each deploy, so we never serve stale JS
  // as long as the HTML loading it is fresh.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch {
        return Response.error();
      }
    })(),
  );
});
