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
| Sculpt completion is driven by a **pg_cron poller**, not `waitUntil`          | Meshy tasks run multi-minute — longer than an edge isolate lives. Cron (`poll-meshy-jobs`, every minute) is a guarded no-op until a `simulacrum_poller_url` Vault secret exists.                                                                                                                      |
| Models are **downloaded into our bucket immediately** on SUCCEEDED            | Meshy deletes API assets after 3 days (non-Enterprise). `mini-models` bucket, path `{userId}/{miniId}/model.*`.                                                                                                                                                                                       |
| `mini-models` bucket has **no client write/delete policies**                  | Generated models only — no user-uploaded 3D hosting. All writes/deletes go through the service-role pipeline (`forge-mini` delete action cleans the folder).                                                                                                                                          |
| Minis **inherit portrait visibility**                                         | RLS select = owner OR campaign member; a 3D model is part of the portrait. In `useCampaignLiveSync`.                                                                                                                                                                                                  |
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
- **Player-facing reveal** (closes the visibility gap): `MiniPortraitOverlay.vue` + `useMiniForSource` — a Vitruvian badge appears over a portrait when a ready mini exists (RLS = portrait visibility); clicking swaps the portrait for the 3D preview + GLB/STL downloads. Wired in `PlayerCharacterHeader`, `PlayerPartyMemberCard`, `PlayerNpcCard` (badge bottom-right there to dodge the relationship pill).

## Files

### DB (migrations)

| File                                                            | Role                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260718000001_simulacrum_foundations.sql` | `minis`, `feature_interest`, `simulacrum_config` singleton, `mini-models` bucket, `mini_sculpt` credit row (500), realtime, guarded cron skeleton |
| `20260718000002_drop_mini_models_listing_policy.sql`            | Advisor fix — public bucket needs no select policy                                                                                                |
| `20260718000003_minis_label.sql`                                | Denormalized gallery label                                                                                                                        |
| `20260718000004_simulacrum_review_fixes.sql`                    | Bucket mime allowlist fix + cron guard reorder                                                                                                    |
| `20260718000005_minis_base_and_scale.sql`                       | `base_id` + `scale_mm` (28/32) for Phase 4.5 composition                                                                                          |

### Backend (edge)

| File                                                | Role                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/_shared/simulacrum.ts`          | Pure state machine + Meshy params (`canStylize/canSculpt/canResculpt/resolveSculptOutcome/meshyParamsForFormat/isStale`). Vitest: `simulacrum.test.ts` (39)                         |
| `supabase/functions/_shared/mesh3d.ts`              | Meshy image-to-3D client + `MESHY_MOCK=1` mock (valid embedded GLB/STL data URLs). Vitest: `mesh3d.test.ts` (18)                                                                    |
| `supabase/functions/forge-mini/index.ts`            | Actions: `stylize` (async image job, platform keys, entity_image cost) / `sculpt` (reserve 500, create Meshy task) / `resculpt` (free) / `cancel` / `delete` (storage folder + row) |
| `supabase/functions/poll-meshy-jobs/index.ts`       | Cron poller: poll → download all formats → settle credits → `ready`. Token-gated (`SIMULACRUM_POLLER_TOKEN`), `verify_jwt=false`                                                    |
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
2. Set `SIMULACRUM_POLLER_TOKEN` edge secret; add Vault secret
   `simulacrum_poller_url` = `https://<proj>.supabase.co/functions/v1/poll-meshy-jobs?token=<same>`.
3. Deploy `forge-mini` + `poll-meshy-jobs` (config.toml already declares the poller's `verify_jwt=false`).
4. One real end-to-end smoke per format; tune VTT polycount (plan §8.2). Also
   test whether Meshy refunds a canceled/deleted task — if yes, switch `cancel`
   from settle-charge to Meshy-task-delete + refund (vendor-refund passthrough).
5. Flip `simulacrum_config.mode` to `live`; notify the `feature_interest` list.

Local testing without a sub: `MESHY_MOCK=1` on the functions — mock Meshy client
returns instantly-succeeded tasks with valid embedded GLB/STL fixtures.
