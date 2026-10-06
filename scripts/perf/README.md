# Browser performance harness (epic #999)

Drives the **production build** in headless Chromium through five journeys under
a fixed CPU and network profile, and records the median of every metric over N
runs. Committed so every story in the epic reports numbers before and after the
same way. Local only: it talks to the local Supabase stack and never to
production.

## Run it end to end

```bash
supabase status                      # local stack up (do not reset it)
npm run dev:auth                     # once: dm-fixture / player-fixture, password grimoire-local-dev
npx playwright install chromium      # once

# 1. build. The empty token is REQUIRED: without it the build uploads source
#    maps to Sentry using the token in .env.local.
SENTRY_AUTH_TOKEN= npx vite build --mode localdb

# 2. serve (127.0.0.1 explicitly: the default binds localhost, which the
#    harness's http://127.0.0.1:4173 cannot reach on some machines)
npx vite preview --mode localdb --host 127.0.0.1 --port 4173 --strictPort

# 3. measure (another shell)
npx tsx scripts/perf/run.ts --runs 3
npx tsx scripts/perf/run.ts --journey dm-cold --journey resume --runs 5 --out /tmp/after.json

# 4. compare two result files
npx tsx scripts/perf/compare.ts perf-results/<before>.json perf-results/<after>.json
```

Flags of `run.ts`: `--base <url>` (default `http://127.0.0.1:4173`), `--journey <name>`
(repeatable, default all), `--runs <n>` (default 3), `--out <file>` (default
`perf-results/<timestamp>.json`, gitignored), `--cpu <rate>` (default 4),
`--delay <ms>` (default 150). The profile is written into the JSON; `compare.ts`
warns when two files used different profiles.

Skip `vue-tsc` for harness builds; only the bundle matters.

## Profile

- **CPU**: `Emulation.setCPUThrottlingRate` 4x on every measured page.
- **Network**: every request to `127.0.0.1:54321` is held 150 ms (Playwright
  route, the #945 method). Localhost round trips are ~2 ms, which hides serial
  waits; with the delay a request that waits on another shows as a wave.
  Static assets are not delayed, so their cost is bytes and CPU only.
- Sign-in (setup) runs unthrottled. Viewport 1440x900.

## Journeys

| name | what it measures |
| --- | --- |
| `dm-cold` | `/dashboard` in a **new context holding only the stored session** (Playwright `storageState` = cookies + localStorage; no HTTP cache, no service worker, no IndexedDB). A returning user with empty caches. |
| `dm-warm` | Same, but the page first loads once (discarded), waits for the service worker to be active and the query persister to flush (3 s), then **reloads**. A returning user's next visit. |
| `dm-nav` | From a settled dashboard, clicks the real sidebar links to `/npcs`, `/encounters`, `/quests`. One measurement window per click. No FCP/LCP/TBT (client-side navigation paints nothing new). |
| `player-cold` | `/play` as the player fixture in a stored-session-only context. Reported as **skipped** if `/play` redirects (the fixture is not seated at a campaign). |
| `resume` | Settled dashboard, tab hidden, then visible after more than the app's 60 s wake threshold (`hiddenReconcileMs` in `App.vue`). Measures what refetches. |

**How `resume` avoids waiting 60 s.** `createRealtimeHeal` measures the hidden
window with `Date.now()` and listens to `visibilitychange`. An init script
(`browser.ts`) shifts `Date.now()` forward by 61 s and flips
`document.visibilityState`, then fires `visibilitychange`. The app sees exactly
what a real minute away produces. (Playwright's clock API was not used: it
replaces timers too, which would stall the app's own timers and the Supabase
client.)

## Metrics

| metric | meaning |
| --- | --- |
| api reqs | requests to the Supabase origin, **excluding** `OPTIONS` |
| options | CORS preflights, counted apart (see traps) |
| serial depth | longest chain of API requests where each starts at or after the previous one finished. Parallel requests do not add to it. `depth x delay` is the floor of the load that parallelism cannot remove. Pure function in `serialDepth.ts`. |
| api / js / css bytes | encoded bytes over the wire (CDP `encodedDataLength`); 0 for cache and service-worker hits. `vite preview` serves what the build emits, so JS bytes are not the production CDN's compressed figure: compare runs, not against the boot budget. |
| total reqs | every real request in the window, preflights excluded |
| FCP / LCP | PerformanceObserver paint entries, ms from navigation start. **The app boots behind a static splash in `index.html`, so these mostly time the splash**, not the dashboard. Use settled as the "content is there" proxy. |
| TBT | sum of the part beyond 50 ms of every long task starting after FCP |
| settled | ms from the window opening until the network was idle for 500 ms (the time of the last activity before that quiet gap; later requests are ignored) |

Also in the JSON, per step: all runs, and `representativeApiPaths` (method +
path + query of the run closest to the median settled time, no headers) so you
can see what was fetched.

Deterministic metrics (requests, bytes, serial depth) are what a CI gate should
use; paint, TBT and settled time vary with machine load.

## Traps

1. **CORS preflight looks like a duplicate request.** Supabase is cross-origin,
   so Chromium sends an `OPTIONS` before each real call. The harness records
   through CDP (`Network.requestWillBeSent` has `type: "Preflight"`) and counts
   them in `options`, never in `api reqs`. If `options == api reqs` that is
   normal, not a double fetch.
2. **Only `127.0.0.1:54321` is API.** Static assets are counted separately.
3. **Playwright disables the HTTP cache while a route is installed.** The
   harness re-enables it over CDP (`Network.setCacheDisabled false`) so the warm
   journey measures a real cache (`dm-warm` js bytes should be ~0).
4. **A fresh context is a true cold start; reusing one is a returning user.**
   The service worker and the persisted library cache (IndexedDB) live in the
   context, so `dm-cold` builds a new one per run.
5. **Sign in once, through the real `/login`.** The stored session is reused for
   every run (the access token outlives the harness). Use the DM fixture, never
   the admin.
6. **`vite preview` needs `--host 127.0.0.1`**, and the build needs
   `SENTRY_AUTH_TOKEN=` (see above).
7. Median over few runs is still noisy for timings; raise `--runs` before
   believing a 10% change in settled time.
