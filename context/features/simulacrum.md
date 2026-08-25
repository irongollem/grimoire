# Simulacrum — Portrait → 3D Miniature Forge

Turns an NPC / monster / player-character portrait into a downloadable 3D
miniature: **print** (grey untextured high-poly STL for resin printing) or
**VTT** (colored low-poly GLB). Full design + provider facts: `SIMULACRUM_PLAN.md`
(repo root). Built Phases 0–3.5; **Phase 4 (go-live) is blocked on buying the
Meshy Pro subscription** — until then the feature runs in `hidden` or `teaser`
mode.

The loop:

> DM opens an entity with a portrait → "Mini" button → wizard: pick format →
> stylize the portrait into a mini-style render (paid, re-rollable) → sculpt via
> Meshy image-to-3D (500 credits, +2 free re-sculpts) → preview in 3D → accept →
> gallery at `/minis` with GLB/STL downloads.

---

## Design decisions (and why)

| Decision                                                                      | Rationale                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No BYOK path, by design** — platform keys only, always credit-charged       | The 500 bundle prices in real Meshy COGS a user's LLM/image keys can't offset; we don't support user-owned Meshy subs. The stylize step deliberately passes empty `campaignKeys` to `resolveImageProvider`.                                                                                           |
| Re-sculpts are **free, capped at 2** (`sculpt_count <= 3`)                    | Charging to fix a bad roll punishes the user for the model's failure. Cap is ours — Meshy's API has no free retries; we absorb ~$0.60/retry.                                                                                                                                                          |
| `sculpt_count` counts **completed** sculpts only                              | A failed attempt never consumes the cap; a failed _first_ sculpt releases its credit hold entirely (reserve-then-settle, net zero).                                                                                                                                                                   |
| The `minis` row **is** the job                                                | Status machine (`stylizing → image_ready → sculpting → downloading → ready \| failed`) + Realtime, same trick as `image_generation_jobs`. No separate jobs table.                                                                                                                                     |
| Sculpt completion is driven by a **pg_cron poller**, not `waitUntil`          | Meshy tasks run multi-minute — longer than an edge isolate lives. Cron (`poll-meshy-jobs`, every minute) is a guarded no-op until **both** the `simulacrum_poller_url` and `simulacrum_poller_token` Vault secrets exist — see the go-live checklist, which described only the first one until 25 Aug 2026.                                                                                                                      |
| Models are **downloaded into our bucket immediately** on SUCCEEDED            | Meshy deletes API assets after 3 days (non-Enterprise). `mini-models` bucket, path `{userId}/{miniId}/model.*`.                                                                                                                                                                                       |
| `mini-models` bucket has **no client write/delete policies**                  | Generated models only — no user-uploaded 3D hosting. All writes/deletes go through the service-role pipeline (`forge-mini` delete action cleans the folder).                                                                                                                                          |
| `minis` RLS is **DM-only**; players read a projection RPC                      | A campaign-member select branch leaked secret NPC/monster sculpts (`20260718000007`), but removing it killed the player reveal (#612). `get_player_visible_mini(source_table, source_id)` re-gates per source — party open to the party, NPC needs a shared portrait + no live disguise, monster needs a discovery — and drops the job/credit columns. In `useCampaignLiveSync`. |
| Minis are generated **BASELESS**; we supply the base + real-mm scale (#542)   | Supersedes the earlier integral-base prompt (2026-07-18). Prompt forbids any pedestal; Meshy runs `auto_size` + `origin_at:"bottom"`; Phase 4.5 composites the figure onto a curated 25 mm base and scales to 28–32 mm (raw Meshy output has no real-world scale). Free base swaps — no Meshy re-run. |
| Three-state feature switch `simulacrum_config.mode: hidden \| teaser \| live` | `teaser` ships the entry point before the Meshy sub exists: an in-lore broken state ("the ritual fizzles") + notify-me button logging to `feature_interest` — the admin counter is the buy-signal.                                                                                                    |
| Denormalized `minis.label` (source name snapshot)                             | The gallery never needs a three-table join per card.                                                                                                                                                                                                                                                  |

## State machine notes (non-obvious)

- `canStylize` allows re-rolls from `ready` (paid image tweak after sculpting) —
  that drops the row to `image_ready` with `sculpt_count >= 1`, where sculpting
  the NEW image is a **free** retry: `canResculpt` accepts `ready` OR
  `image_ready` at count 1..2. `canSculpt` (the paid path) requires count 0.
- A failed re-sculpt keeps the previous model (`resolveSculptOutcome` →
  `nextStatus: "ready"`); only a first sculpt with nothing to fall back to lands
  on `failed`.
- **Refund policy — refunds only when the failure is OURS** ("ours" = our
  tooling or the vendor's, never user choice; same as all AI generations).
  Operating rule is **vendor-refund passthrough**: Meshy auto-refunds `FAILED`
  tasks → we release the hold (net zero, retry not consumed); stale timeouts
  are our tooling giving up → also refunded. User-initiated `cancel` or
  `delete` of an in-flight paid sculpt abandons a task whose vendor cost is
  sunk → the hold SETTLES as a real charge and the attempt is consumed
  (`sculpt_count++` on cancel) — remaining re-sculpts stay free under the
  bundle already paid for. Disliking/deleting a finished mini refunds nothing.
  **Phase 4 open question:** does Meshy refund canceled/deleted tasks? If yes,
  wire cancel to delete the Meshy task and refund (vendor refunds → we refund).
- **You pay, you get the product — even if you leave.** The server owns every
  job end-to-end (stylize: `waitUntil` worker; sculpt: the pg_cron poller); the
  browser only ever observes. A user who initiates and closes the tab still
  gets the result on their `minis` row + bucket, the gallery card flips via
  Realtime, and in-flight minis are Resumable from the gallery (the wizard's
  sculpt step re-attaches to the wait on mount).

## Phase 4.5 — bases, composition & scaling (BUILT, #542 closed)

- **Base registry**: `supabase/functions/_shared/mini-bases.ts` (id/label/color) mirrored at `src/data/miniBases.ts`. Adding a base = registry entry + `npm run ingest-mini-bases` — never a migration. Assets live at `mini-models/bases/<id>.stl|.glb`.
- **Asset flow**: plinth (sister repo, Blender-backed, geometry-only) exports STL into `art-src/bases/<id>.stl` (convention: origin base-bottom center, mm, 25 mm footprint). Ingest (`scripts/ingest-mini-bases.ts`, tsx + service key) derives the GLB + flat registry color — UNLESS an artist-colored `art-src/bases/<id>.glb` exists, which wins as-is. The `plain` base is procedurally generated (25 mm cylinder) until real plinth assets land.
- **Composition**: pure modules `_shared/stl.ts` (binary STL parse/transform/write/cylinder, 23 tests), `_shared/mesh-compose.ts` (scale factors 28→16 / 32→18.3 mm-per-meter, height clamp 12–60 mm — size-faithful minis: halflings small, ogres big; 12 tests), `_shared/glb-compose.ts` (`@gltf-transform/core` via esm.sh in Deno + npm devDep for vitest; 9 tests). STL compose = transform + concat (no boolean; slicers merge shells). Axis convention vs printers (Z-up) is a Phase 4 smoke item.
- **Pipeline**: poller stores raw figure copies (`extra_paths.raw_glb/raw_stl`) then auto-composes onto `plain` @ `scale_mm` (default 32); compose failure falls back to raw-as-model — never bricks a paid sculpt. `forge-mini` action `set_base { mini_id, base_id, scale_mm }` recomposes from raws — FREE, any mode, `compose_failed` 502 on error.
- **Wizard**: "Base & scale" row in the ready phase (color swatches + 28/32 mm toggle, instant free swap; viewer cache-busts via `?v=updated_at` since paths don't change).
- **Player-facing reveal**: `MiniPortraitOverlay.vue` + `useMiniForSource` — a Vitruvian badge appears over a portrait when a ready mini the viewer may see exists; clicking swaps the portrait for the 3D preview + GLB/STL downloads. Wired in `PlayerCharacterHeader`, `PlayerPartyMemberCard`, `PlayerNpcCard` (badge bottom-right there to dodge the relationship pill) and the `PlayerBestiaryView` lightbox hero (bottom-right; the CR pill moved to bottom-left, and the lightbox close button is `z-40` to stay above the viewer). Visibility is entirely the RPC's — see the table above. The bestiary passes an empty `id` for shared library monsters, whose text ids can never match a uuid `source_id`; that leaves the query disabled and renders the portrait untouched.
- **No realtime for players**: `campaignRealtimeSystems` invalidates `["minis","for",…]`, but postgres_changes on `minis` respects the DM-only table RLS, so a player's badge appears on the next refetch (60 s stale time) rather than the instant the DM's sculpt lands. Fixing that means a broadcast from `forge-mini`, not a policy change.

## The poller is not its own watchdog (#771)

`minis` is its own job table, and until 25 Aug 2026 the only thing that could
advance or fail a row was `poll-meshy-jobs`. Staleness was evaluated *inside*
the poller (`isStale`, `sculptPhaseStartedAt`), so the worker was also its own
watchdog: stop it and a mini sits in `sculpting` or `downloading` forever, with
the UI showing progress that will never arrive. Not hypothetical — the poller
was scheduled, `active` and polled nothing at all from 18 July to 25 Aug 2026
because two Vault secrets were never provisioned (`20260825073922`).

`sweep-stranded-minis` (every 5 min, `private.sweep_stranded_minis()`) is the
SQL-only backstop, on the same pattern as `fail-stale-image-jobs`,
`fail-stale-ai-generation-jobs` and `sweep-stranded-document-imports`. Three
things that are easy to get wrong, all decided deliberately:

- **`polled_at` is written by the poller and by nothing else.** #771 proposed
  measuring liveness from `updated_at`, which is what the #769 sweep does. It
  cannot work here: this sweep writes *repeatedly*, so `updated_at` would be
  measuring the sweep; and a poller that is alive and retrying a failing
  download looks identical in `updated_at` to one that is gone, while the two
  need opposite treatment — the live one has to keep its right to give up at
  `STALE_SCULPT_MS`. A pgTAP assertion on the function body fails if the sweep
  ever writes that column.
- **`sculpting` is never nudged; `downloading` always is.** Sculpt time is
  *provider* time and elapses whether or not we are watching, and nothing is
  lost by leaving it — `resolveSculptOutcome` returns "complete" for SUCCEEDED
  before it consults `stale`, so a returning poller still collects a task that
  finished during the outage. Download time is *ours* and only elapses while we
  are trying; letting it accrue means the poller's first act on recovery is to
  fail a paid, SUCCEEDED sculpt with "Model download failed repeatedly", which
  by then is a lie. Not nudging `sculpt_started_at` is also what keeps it
  usable as the retention anchor below.
- **Terminal failure only past Meshy's 3-day asset retention**, anchored on the
  immutable `sculpt_started_at`. Past that there is nothing left to collect, so
  failing destroys nothing. A first sculpt fails with `credits_spent` 0 and its
  hold released; a re-sculpt falls back to `ready` on the model it already had,
  charge intact and `sculpt_count` untouched, so our downtime never eats a free
  re-sculpt. Credits were never the real exposure here
  (`release-stale-credit-holds` reclaims at 2 h regardless) — a row whose status
  is a lie was.

**This shipped before the Meshy subscription, which #771 said it could not.**
The blocker was real for the sweep #771 imagined — "`sculpting` > N hours →
`failed`" needs a measured p99 and destroys paid work when N is wrong. Nothing
above asks how long a sculpt takes, whether an unpolled Meshy task is still
queryable, or whether `cancel` refunds; the last two remain Phase 4 questions.
The two clocks it does use were already known: poller liveness from *our* cron
cadence and lease (15 min), asset retention from Meshy's published non-Enterprise
lifetime (3 days).

`stylizing` is deliberately outside all of this — that render is an
`image_generation_jobs` row swept by `fail-stale-image-jobs`, and
`sync_failed_mini_style_job` (`20260730000001`) drags the mini along with it.

The sweep also `raise warning`s while any in-flight mini has gone unpolled,
staying silent when nothing is waiting so it cannot become spam. It is
deliberately broader than `20260825073922`'s two Vault checks, which cannot see
a missing `SIMULACRUM_POLLER_TOKEN` on the function (pg_net reports the POST as
sent; the function 503s) or a function that was never deployed.

## Files

### DB (migrations)

| File                                                            | Role                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260718000001_simulacrum_foundations.sql` | `minis`, `feature_interest`, `simulacrum_config` singleton, `mini-models` bucket, `mini_sculpt` credit row (500), realtime, guarded cron skeleton |
| `20260718000002_drop_mini_models_listing_policy.sql`            | Advisor fix — public bucket needs no select policy                                                                                                |
| `20260718000003_minis_label.sql`                                | Denormalized gallery label                                                                                                                        |
| `20260718000004_simulacrum_review_fixes.sql`                    | Bucket mime allowlist fix + cron guard reorder                                                                                                    |
| `20260718000005_minis_base_and_scale.sql`                       | `base_id` + `scale_mm` (28/32) for Phase 4.5 composition                                                                                          |
| `20260718000007_security_audit_hardening.sql`                   | `minis` becomes read-only + DM-only select; all mutation goes through `forge-mini`                                                                |
| `20260730000001_harden_mini_generation_lifecycle.sql`           | Resumable stylize job, poller lease so overlapping invocations can't double-charge, separate phase timestamps                                     |
| `20260805000001_player_visible_minis.sql`                       | `get_player_visible_mini` RPC — the player reveal, re-gated per source type (#612)                                                                |
| `20260825073922_loud_poller_provisioning_gap.sql`               | The cron warns which Vault secret is missing instead of returning silently, but only while minis are actually waiting                             |
| `20260825200052_sweep_stranded_minis.sql`                       | `minis.polled_at` + `sweep-stranded-minis` cron — the SQL-only backstop for an absent poller (#771)                                               |

### Backend (edge)

| File                                                | Role                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/_shared/simulacrum.ts`          | Pure state machine + Meshy params (`canStylize/canSculpt/canResculpt/resolveSculptOutcome/meshyParamsForFormat/isStale`). Vitest: `simulacrum.test.ts` (39)                         |
| `supabase/functions/_shared/mesh3d.ts`              | Meshy image-to-3D client + `MESHY_MOCK=1` mock (valid embedded GLB/STL data URLs). Vitest: `mesh3d.test.ts` (18)                                                                    |
| `supabase/functions/forge-mini/index.ts`            | Actions: `stylize` (async image job, platform keys, entity_image cost) / `sculpt` (reserve 500, create Meshy task) / `resculpt` (free) / `cancel` / `delete` (storage folder + row) |
| `supabase/functions/poll-meshy-jobs/index.ts`       | Cron poller: poll → download all formats → settle credits → `ready`. Token-gated (`SIMULACRUM_POLLER_TOKEN`), `verify_jwt=false`. Stamps `polled_at` on every claim — the liveness signal `sweep-stranded-minis` reads (#771) |
| `_shared/image-prompt.ts` / `src/ai/imagePrompt.ts` | `buildMiniStylizePrompt(format, name, instructions?)` — print: grey resin, blank eyes, clumped hair, integral base; VTT: colored, clean silhouette, base. Mirrored pair             |
| `_shared/platform-keys.ts`                          | `Provider` union + `"meshy"` (row added at go-live)                                                                                                                                 |
| `_shared/imageJob.ts`                               | `+ "mini_style"` kind, `+ "minis:stylized_image_url"` target                                                                                                                        |

### Frontend

| File                                         | Role                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/mini.types.ts`                    | `Mini`, formats/statuses + labels, `SimulacrumMode`, `MAX_SCULPTS`                                                                                                                                                                                                      |
| `src/composables/useSimulacrumConfig.ts`     | Mode query (all users) + admin mutation                                                                                                                                                                                                                                 |
| `src/composables/useMinis.ts`                | List/single/delete (delete via edge fn — no client storage policy)                                                                                                                                                                                                      |
| `src/composables/useFeatureInterest.ts`      | Teaser notify-me + admin count                                                                                                                                                                                                                                          |
| `src/ai/useMiniForge.ts`                     | Edge-fn client + `waitForSculpt` (Realtime + poll, 15-min window)                                                                                                                                                                                                       |
| `src/views/minis/SimulacrumForgeView.vue`    | `/minis/forge?source=&id=&mini=` — mode switch: hidden→redirect, teaser→`SimulacrumTeaser`, live→`SimulacrumWizard`                                                                                                                                                     |
| `src/components/simulacrum/*`                | Wizard host + `MiniFormatStep` / `MiniStylizeStep` / `MiniSculptStep` / `MiniModelViewer` (lazy `@google/model-viewer`) / `MiniCard` / `SimulacrumTeaser`                                                                                                               |
| `src/views/minis/MinisView.vue`              | `/minis` gallery; filters in `useUiStore` (`minis*` block)                                                                                                                                                                                                              |
| `src/components/common/EntityImageBlock.vue` | `miniSource` prop → "Mini" button (Vitruvian icon); wired in NPC sidebar/mobile, Monster detail/mobile, PartyMemberIdentityTab                                                                                                                                          |
| `src/components/admin/SimulacrumConfig.vue`  | Mode select + interest counter + **Meshy platform key management** (same `api-key-vault` flow as generic provider keys, but housed here since the key exists solely for this feature). "Live" is un-selectable and un-savable while no key is set. In AdminProvidersTab |
| `src/lib/nav.ts` + AppSidebar/DmNavMoreSheet | Publish-group item (with Card Forge/The Mint; desktop-only like that whole group), hidden while `mode === "hidden"` (`featureFlag`)                                                                                                                                     |

## Go-live checklist (Phase 4)

1. Buy Meshy Pro; paste the key into the Simulacrum panel (Admin → Providers) —
   this is what unlocks the "Live" mode option. **Also `supabase secrets unset
MESHY_MOCK`** (set during pre-sub testing) and clear any "mock" placeholder
   key, or real sculpts will keep returning the fixture triangle.
2. Provision the poller. **Three values, and all three are required** — the
   cron returns early if any is missing, so getting two of them right produces a
   job that still never polls:

   | Where | Name | Value |
   | --- | --- | --- |
   | Vault | `simulacrum_poller_url` | `https://<proj>.supabase.co/functions/v1/poll-meshy-jobs` |
   | Vault | `simulacrum_poller_token` | a fresh high-entropy string |
   | Edge secret | `SIMULACRUM_POLLER_TOKEN` | the **same** string |

   ```sql
   select vault.create_secret('https://<proj>.supabase.co/functions/v1/poll-meshy-jobs', 'simulacrum_poller_url');
   select vault.create_secret('<token>', 'simulacrum_poller_token');
   ```
   ```bash
   supabase secrets set SIMULACRUM_POLLER_TOKEN=<token> --project-ref <proj>
   ```

   **No `?token=` in the URL.** An earlier revision of this step said to put it
   there, and that is exactly what `20260718000007` removed — pg_net, proxies
   and access logs all retain URLs, so a credential in one is a credential in
   the logs. The cron sends it as an `Authorization: Bearer` header instead.

   Verify before moving on: start a sculpt and confirm it leaves `sculpting` on
   its own. Do not verify by looking at `cron.job` — the job reports `active`
   and `succeeded` whether or not these secrets exist, which is how it sat
   unprovisioned from July to 25 Aug 2026. `20260825073922` now raises a warning
   naming the missing secret whenever minis are actually waiting, so
   `query_logs` will tell you which step was missed. It only sees the two
   Vault values, though — a missing **edge secret** leaves the cron posting
   happily to a function that 503s. `sweep-stranded-minis` (#771) is what
   catches that third case: any in-flight mini unpolled for 15 minutes warns,
   whatever the reason, and keeps the mini collectable in the meantime.
3. Deploy `forge-mini` + `poll-meshy-jobs` (config.toml already declares the poller's `verify_jwt=false`).
4. One real end-to-end smoke per format; tune VTT polycount (plan §8.2). Also
   test whether Meshy refunds a canceled/deleted task — if yes, switch `cancel`
   from settle-charge to Meshy-task-delete + refund (vendor-refund passthrough).
5. Flip `simulacrum_config.mode` to `live`; notify the `feature_interest` list.

Local testing without a sub: `MESHY_MOCK=1` on the functions — mock Meshy client
returns instantly-succeeded tasks with valid embedded GLB/STL fixtures.
