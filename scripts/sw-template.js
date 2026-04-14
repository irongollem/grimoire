/* eslint-disable no-undef */
// Grimoire service worker — hand-rolled, no workbox.
//
// Build-time substitutions (see `swPlugin` in vite.config.ts):
//   __PRECACHE__    → JSON array of precached paths
//   __CACHE_NAME__  → "grimoire-<8-char hash>" — bumped whenever any precached
//                     file's hash changes, forcing a fresh cache on deploy
//
// Behaviour:
//   install   — put every precached path into `__CACHE_NAME__`, skip waiting
//               so the new worker activates immediately (matches the
//               old plugin's autoUpdate mode).
//   activate  — claim clients, then delete every cache whose name doesn't
//               match __CACHE_NAME__ (garbage-collects old deploys).
//   fetch     — same-origin GETs only:
//                 • navigations (mode: 'navigate') → cached /index.html, with
//                   a network fallback, so SPA routes work offline.
//                 • everything else → cache-first, with network fallback.
//               Cross-origin and non-GET requests are passed through to the
//               network untouched (we never cache Supabase / OpenAI calls).
//
// The old vite-plugin-pwa also ran `clients.claim()` and `skipWaiting()`,
// and `main.ts` reloads the page on `controllerchange`. Preserved.

const CACHE_NAME = "__CACHE_NAME__";
const PRECACHE = /** @type {string[]} */ (__PRECACHE__);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Tolerate individual misses rather than aborting the whole install if
      // one precache entry 404s on the CDN during a rolling deploy.
      Promise.all(
        PRECACHE.map((path) =>
          cache
            .add(new Request(path, { cache: "reload" }))
            .catch(() => undefined),
        ),
      ),
    ),
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

  // SPA navigation — serve cached /index.html (or fall back to the network,
  // then the cached copy). Ensures deep links work offline after first visit.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match("/index.html")) ?? Response.error();
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
