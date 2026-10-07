# Browser performance harness (epic #999)

Drives the **production build** in headless Chromium through five journeys under
a fixed CPU and network profile, and records the median of every metric over N
runs. Committed so every story in the epic reports numbers before and after the
same way. Local only: it talks to the local Supabase stack and never to
production. It measures a small **synthetic fixture** that is committed as code
(see below), so the numbers mean the same on every machine.

## The fixture

`npm run perf:fixture` (`scripts/perf/fixture.ts`) builds the world the journeys
load. It replaces `npm run dev:auth` for the harness: `dev:auth` clones data out
of `supabase/seed.sql`, a gitignored dump of real data that CI does not have and
that differs from machine to machine.

It creates, with fixed names and no randomness or clock-dependent content:

- `perf-dm@example.invalid` and `perf-player@example.invalid`, password
  `grimoire-local-dev`, the same local-only password as `dev:auth` (but
  different accounts, so it never disturbs your dev fixtures);
- one campaign owned by the DM, three party members (the player claims
  `Perf Rogue`, so `/play` works), one location, three NPCs, two notes (one
  pinned), one quest with three beats, one encounter, and no dashboard layout
  row, so the dashboard renders its default widgets.

Accounts go through the GoTrue admin API; everything else is plain inserts, so
the app's own triggers do the implicit work (DM membership, default content
sources, the quest's Main thread, the character claim). The campaign's
`ai_enabled` is set to `false` on purpose: left `null` the app opens the "Bring
AI to this campaign?" dialog over every page and the navigation journey cannot
click through it. Running it twice leaves the same state: it deletes the two
fixture accounts (matched by email, which clears what they own) and recreates
them. It needs `psql` on the path, like the other `dev:*` scripts.

Safety, mirroring `dev-auth.ts`; it refuses before touching anything unless:

- the keys come from `supabase status` (never `.env.local` or an environment
  variable that could hold a hosted key);
- both the API and the database address are loopback (`assertLoopbackStack`,
  unit-tested in `scripts/lib/dev-stack.test.ts`);
- the service-role key is the Supabase CLI's universal development key (JWT
  issuer `supabase-demo`; `assertDemoKey`).

Every delete is scoped to the two fixture accounts' ids; no other account's rows
are addressed. If the fixture is absent the DM sign-in fails and the harness
stops; if only the player cannot sign in, `player-cold` is reported skipped.

## Run it end to end

```bash
supabase status                      # local stack up (do not reset it)
npm run perf:fixture                 # once (idempotent): perf-dm / perf-player, password grimoire-local-dev
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
| `player-cold` | `/play` as the player fixture in a stored-session-only context. Reported as **skipped** if `/play` redirects (a stack without the fixture: the player is not seated at a campaign). |
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
| FCP / LCP | PerformanceObserver paint entries, ms from navigation start. **The app boots behind a static splash in `index.html`, so these mostly time the splash** (about 90 ms), not the dashboard. Use app ready and content ready instead. |
| app ready | ms until the static splash (`#boot-splash`, removed when Vue mounts) **and** the Vue loading screen (`.loading-screen`, shown by `App.vue` while auth and the campaign resolve) are both gone. Page loads only. Recorded by a MutationObserver in the init script (`browser.ts`). |
| content ready | ms until a journey-specific piece of real content is visible (`CONTENT` table in `journeys.ts`): a dashboard widget heading, an NPC card link, the quest groups, the Hearth title. For `dm-nav` it is measured from the click. `n/a` for `resume`. The weakest selector is `/encounters` (the page heading: the view has no list hook). A `data-perf="content"` attribute on each view's main data region would make all of these independent of markup; until it exists, a redesign of those elements means updating the table. |
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
   every run (the access token outlives the harness). Use the fixture DM, never
   the admin.
6. **`vite preview` needs `--host 127.0.0.1`**, and the build needs
   `SENTRY_AUTH_TOKEN=` (see above).
7. Median over few runs is still noisy for timings; raise `--runs` before
   believing a 10% change in settled time.

## Budgets (story 0.4)

`budgets.json` holds a ceiling per journey step for the two deterministic
numbers, `apiRequests` and `serialDepth` (identical across every run on the
fixture). Times and bytes are never gated: they move with the machine. They were
measured on the committed fixture (`npm run perf:fixture`), so a laptop and CI
read the same rows.

```bash
npx tsx scripts/perf/check-budgets.ts perf-results/<run>.json
```

**The CI job is ADVISORY for now.** It runs on every pull request and push,
reports the journeys in the job summary, records the history on main and runs
the budget check, but it never blocks a release: nothing `needs` it, and the
budget step is `continue-on-error`. A breach shows as a failed (orange) step to
look at, not a stop. The hard gate that remains is the boot-bundle budget inside
`npm run build` (`bootBudgetPlugin`). Promote the job into the release jobs'
`needs` (and drop `continue-on-error`) once it has run stably for a while.

Rules for the check itself:

- Over budget exits 1 and prints an OVER BUDGET table. Exactly at budget passes.
- **Below budget passes but prints a hint: lower the budget in the same change.**
  A story that removes requests or waves edits `budgets.json` to the new
  numbers in its own commit; otherwise the headroom lets the next story give the
  win back unnoticed.
- A journey that was skipped or was not run is "no data", never a failure.
- A budgeted step that a journey which ran no longer produces fails (the
  journey changed shape), and a step with no budget is listed so it gets one.
- **The boot-bundle size is not in `budgets.json`.** One budget, one place:
  `bootBudgetPlugin` in `vite.config.ts` fails `npm run build` when the scripts
  and modulepreloads in `index.html` exceed `BOOT_BUDGET_GZIP_BYTES`. A story
  that shrinks the boot payload lowers that constant.
- Changing the fixture changes the counts. If you add rows the journeys load,
  re-measure and update `budgets.json` in the same change.

## History over time

On pushes to `main` the `performance` job in `.github/workflows/release.yml`
writes one JSON line and hands it as an artifact to `performance-history`, which
appends it to `history.jsonl` on the orphan `perf-history` branch
(`publish-history.sh`: creates the branch the first time, retries a rejected
push after refetching, never forces). The split is deliberate: the job that runs
`npm ci`, the build and the harness executes third-party code and stays
read-only; only the small job with nothing but git and `sh` can push. A line
holds the commit, date, profile,
every non-skipped journey's median metrics and the critical-path sizes from
`bundle/critical-path.ts --json` (recorded as data, not gated).

```bash
git fetch origin perf-history
git show origin/perf-history:history.jsonl > /tmp/history.jsonl
npx tsx scripts/perf/history.ts summarize /tmp/history.jsonl --last 20
```

A failed history push never blocks a release (`continue-on-error`): it loses one
data point. The whole `performance` job is advisory (see Budgets), so neither a
budget breach nor a failed run holds a release back.

Dry-run of the CI steps locally: build and serve as above, then
`run.ts --runs 1 --out perf-results/ci.json`, `bundle/critical-path.ts dist --json
perf-results/critical-path.json`, `check-budgets.ts`, and `history.ts entry`.
