# Simulacrum — Portrait → AI image → 3D miniature pipeline

Turn an NPC / monster / player-character portrait into a downloadable 3D miniature:
**print** (grey, untextured, high-poly STL for resin printing) or **VTT** (colored,
low-poly GLB with a base, for virtual tabletops).

Status: **planned, blocked on Meshy subscription** — we build everything behind a
flag and mock the Meshy API so the pipeline is ready the day we subscribe.
Module name **Simulacrum** (after the spell that duplicates a creature — nav
label per the DnD-thematic convention; internals stay plain: route `/minis`,
table `minis`, bucket `mini-models`, like Workshop → `/crafting`). Rejected:
anything "-forge" (Cardforge owns the suffix) and "Foundry" (FoundryVTT collision).

---

## 1. Provider facts (verified against Meshy docs, July 2026)

- API: `POST /openapi/v1/image-to-3d` → task id; poll `GET /openapi/v1/image-to-3d/:id`
  (status `PENDING | IN_PROGRESS | SUCCEEDED | FAILED | CANCELED`, `progress` 0–100).
  SSE stream endpoint exists; webhooks referenced but thinly documented — **poll as
  baseline**.
- Cost: image-to-3D is **5–30 Meshy credits/task** (meshy-6 textured = 30, untextured
  = 20). API access requires Meshy **Pro ($20/mo, 1,000 credits)** or above.
- **"Free retries" is a Meshy web-app perk only. The API has no retry mechanism** —
  every regeneration is a new task at full Meshy cost. Failed tasks auto-refund
  (`consumed_credits: 0`). → Any retry allowance must be our own cap + our own
  pricing (§5), not a Meshy passthrough.
- **Assets are deleted from Meshy after 3 days** (non-Enterprise) and download links
  expire. → Downloading outputs into our own bucket immediately on `SUCCEEDED` is
  mandatory, not optional.
- Useful params: `target_formats` (`glb`,`stl`,`obj`,`usdz`,`3mf`), `should_texture`,
  `enable_pbr`, `topology` (`quad`/`triangle`), `target_polycount` (100–300k),
  `pose_mode` (`a-pose`/`t-pose`), `moderation`. Input = public image URL or base64.
- Provider abstraction: keep the edge-side client behind a `_shared/mesh3d.ts`
  interface (mirroring `_shared/imageGen.ts` provider registry) so Tripo/Rodin/etc.
  can slot in later via `provider_config`.

## 2. User flow (wizard)

Entry: a **"Mini"** action (Vitruvian icon + short label; "make me a mini" was
the working description, too verbose for a button) next to "Generate with AI" in
`src/components/common/EntityImageBlock.vue` — automatically appears on NPCs
(`portrait_url`), monsters (`image_url`), and party members (`portrait_url`).
Opens the wizard (modal route), source portrait + entity context prefilled.

Icon: the **Vitruvian Man** (the Westworld host-fabrication vibe — our own
rendition of da Vinci's public-domain motif, not HBO's trademarked logo mark).
Wrapper `src/components/common/VitruvianIcon.vue` (MaskIcon pattern, inherits
`currentColor` / font-size like `DamageIcon`) reads
`public/assets/simulacrum/vitruvian.svg` — traced from the generated art in
`art-src/vitruvian 1.png` via the standard potrace → `normalize-svg.mjs`
pipeline (100×100 viewBox). `art-src/vitruvian 2.png` (articulated-mannequin
variant) is kept as a candidate for a larger empty-state illustration; too
fine-detailed for a 1em glyph.

1. **Format** — Print vs VTT. Sets everything downstream:

   |                  | Print                                                                                                                                                                                       | VTT                                                                                     |
   | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
   | Stylized image   | grey "unpainted resin mini" render                                                                                                                                                          | full-color stylized render                                                              |
   | Image directives | blank eyes (no iris), hair/feathers/fur clumped into solid masses, thin parts (blades, staffs) thickened, single connected body, no background, **NO base — feet flat on the ground plane** | simplified clean silhouette, **NO base — feet flat on the ground plane**, no background |
   | Meshy params     | `should_texture:false`, `topology:"triangle"`, `target_polycount:200_000`, `auto_size` + `origin_at:"bottom"`                                                                               | `should_texture:true`, `target_polycount:20_000`, `auto_size` + `origin_at:"bottom"`    |
   | Formats fetched  | `["stl","3mf","glb"]` (GLB only for preview)                                                                                                                                                | `["glb","usdz"]`                                                                        |
   | Retention        | same as VTT — keep both (§6)                                                                                                                                                                | keep                                                                                    |

   Minis are generated **BASELESS** (decision 2026-07-18, superseding the earlier
   integral-base prompt): **we supply the base** from a curated 25 mm library and
   composite the figure onto it ourselves — Phase 4.5, GitHub issue #542. The
   base assets are **first-party, generated with the sister repo `plinth`**
   (desktop base-generator tool): Jeffrey drops 5–10 outputs into the raw art
   folders and we upload them to the bucket — no third-party licensing. This
   also solves real-world scaling, which the raw Meshy output lacks entirely
   ("tends to be huge"): the compositor normalizes the figure to true tabletop
   millimetres (28–32 mm) before seating it. Composition is cheap — binary-STL
   triangle concat + transform for print (no boolean union; slicers merge
   touching shells), `@gltf-transform/core` node-merge for the preview/VTT GLB.
   `auto_size` + `origin_at:"bottom"` make the seating deterministic. Until 4.5
   lands, raw sculpts have no base — acceptable, since nothing real sculpts
   before Phase 4 anyway.

2. **Stylize** (image credits, normal flow) — portrait sent as `sourceImages` through
   the existing `generateImage()` engine (OpenAI edits / Gemini inline both accept
   source images; a generate-only provider could never serve this kind). Reuses the
   `image_generation_jobs` async pattern + `waitForImageJob`. Preview → **re-roll /
   tweak** freely; each roll charges the standard `entity_image` cost via
   reserve-then-settle. The accepted image is stored in the `mini-models` bucket
   (it must have a public URL for Meshy).

3. **Sculpt** (the 500-credit step) — accepted image → Meshy task with the
   format's params. Progress UI driven by Realtime on the `minis` row (Meshy gives
   `progress` 0–100). Typical wall time is minutes → job machine in §4.

4. **Preview & accept** — render the GLB in-browser with `@google/model-viewer`
   (lazy-loaded chunk; works for both formats since print tasks also fetch a GLB).
   Accept → done. **Re-sculpt** → new Meshy task, free, capped at 2 per mini (§5).

5. **Done** — mini appears in the entity's detail page and a `/minis` gallery
   (per-campaign list: thumbnail, format badge, download STL/GLB buttons).
   Post-mutation navigation per house rule: back to the source entity's detail page.

Later phase: **"Send to print"** — POST the STL to a print-service partner
(Craftcloud / Treatstock-style API) for users without a printer. Design the `minis`
table so an order id / fulfillment status can be added without migration pain
(nullable `print_order_*` columns come later, table shape doesn't fight it).

## 3. Data model

New table `minis` (single source of truth; **no separate jobs table** — the row IS
the job, status machine + Realtime, same trick as `image_generation_jobs`):

```text
minis
  id uuid pk
  user_id uuid not null            -- RLS owner
  campaign_id uuid null
  source_table text not null       -- 'npcs' | 'monsters' | 'party_members'
  source_id uuid not null
  format text not null             -- 'print' | 'vtt'
  status text not null default 'stylizing'
     -- stylizing → image_ready → sculpting → downloading → ready | failed
  stylized_image_url text          -- accepted 2D render (public, fed to Meshy)
  meshy_task_id text               -- current/last Meshy task
  provider text default 'meshy'
  glb_path text                    -- storage paths in mini-models bucket
  stl_path text                    -- print only
  extra_paths jsonb                -- usdz / 3mf / thumbnail
  thumbnail_url text
  polycount int
  sculpt_count int not null default 0   -- enforces the 2-re-sculpt cap
  credits_spent int not null default 0
  error text
  created_at / updated_at + standard updated_at trigger
```

RLS — **a mini is part of the portrait**: whoever can see the source entity's
portrait can see its minis. `select` mirrors the source table's player-read
predicate (owner OR campaign member with visibility on that NPC/monster/PC);
`insert`/`update`/`delete` stay owner-only. Realtime: add to publication + to
`useCampaignLiveSync` so players see minis appear live.

Bucket `mini-models`: public read (matches portrait visibility above at the
storage layer, like every portrait bucket), path
`{userId}/{miniId}/model.glb|model.stl|thumb.webp`. **Writes are service-role
only** — models enter storage exclusively through the pipeline; we do NOT host
user-uploaded 3D files until further notice (size/abuse surface). No client
write policy at all. Registered in `src/lib/storage.ts` `BUCKETS`. Raise
`file_size_limit` (~50 MB; a 200k-tri binary STL ≈ 10 MB, textured GLB ≈
5–20 MB) and allow `model/gltf-binary`, `model/stl`,
`application/octet-stream`, `image/webp`.

Credit config row in `ai_generation_credit_costs`: `mini_sculpt` = **500**
(includes the first stylize image AND up to 2 free re-sculpts — see §5).

## 4. Job machine (the part `EdgeRuntime.waitUntil` can't do)

Meshy tasks run multi-minute — longer than an edge isolate reliably lives. So:

- Edge fn `forge-mini` (actions: `stylize`, `sculpt`, `resculpt`, `cancel`):
  `sculpt` reserves credits (`reserve_credits` RPC), creates the Meshy task, writes
  `meshy_task_id` + `status='sculpting'`, returns immediately. `resculpt` skips the
  credit reserve (free within the cap) but enforces `sculpt_count <= 3` server-side.
- **pg_cron poller** (modeled on `fail-stale-image-jobs`,
  `20260613000004`): every minute, `poll-meshy-jobs` edge fn (invoked via pg_net)
  fetches all `status='sculpting'` rows, polls Meshy:
  - `SUCCEEDED` → `status='downloading'`; download every requested format + thumbnail
    into `mini-models` **immediately** (3-day Meshy expiry), write paths, generate
    webp thumb, `release_credits` + `recordGeneration` → `status='ready'`.
  - `FAILED`/`CANCELED` → `failImageJob`-style: `status='failed'`, release the hold
    (net-zero charge; Meshy refunded their side too).
  - `sculpting` > 30 min → treat as stale-failed (same sweep).
- Client: `useMiniJob()` clone of `src/ai/useImageJob.ts` (Realtime UPDATE + 4 s
  poll fallback).
- Meshy platform key: new row via `_shared/platform-keys.ts`. **Unlike the other
  AI features, Simulacrum has NO BYOK path — by design, not just v1 scope.** The
  whole pipeline (stylize images included) runs on platform keys and always
  charges credits; the `isByok ⇒ cost 0` branch never applies here. The 500
  bundle prices in real Meshy COGS that a user's LLM/image keys can't offset,
  and we don't want to support user-owned Meshy subs. The stylize step must
  therefore skip `resolveImageProvider`'s campaign-key routing (force platform).

## 5. Credits & economics

- `mini_sculpt` 500 credits = stylize (first image) + first Meshy sculpt **+ up
  to 2 free re-sculpts** (hard cap `sculpt_count <= 3`). Re-sculpts are free by
  design: charging again to fix a bad roll punishes the user for the model's
  failure and triggers exactly the dissatisfaction we're pricing to avoid. The
  cap is ours — Meshy's API has no free retries, we absorb their cost — and it's
  2 (not 4) precisely because we pay per retry.
- Extra image re-rolls / tweaks (before sculpting or between sculpt attempts):
  normal `entity_image` cost each — this is the natural brake on idle re-rolling.
- Reserve-then-settle on the paid step. **Refund policy = same as every other
  AI generation: credits come back only when the failure is OURS** (stylize
  error, Meshy task FAILED, stale timeout — all release the hold, net zero;
  failed attempts don't consume a retry either). User-initiated cancel or
  delete of an in-flight paid sculpt is on them: the hold settles as a real
  charge and the attempt is consumed — their remaining re-sculpts stay free
  under the bundle they paid for. Disliking or deleting a finished mini
  refunds nothing.
- Margin sanity: 500 credits ≈ €6.25 at the €5/400 pack (≈ €3.85 at the €20/2600
  pack). COGS ≈ $0.60–0.65 per sculpt (30 Meshy credits @ Pro rate + image);
  worst case with both free retries burned ≈ $1.95 — comfortable even at the
  cheapest pack, and typical accepts land in 1–2 rolls. Meshy Pro's 1,000
  credits/mo ≈ 33 textured sculpts.
- **Going over plan gets cheaper, not pricier**: Studio ($60/mo, 4,000 credits)
  = $0.015/credit vs Pro's $0.020 → a textured sculpt drops $0.60 → $0.45, so
  demand improves unit economics via tier upgrade. For spikes short of an
  upgrade, top-up packs (200/1,000/4,000 "permanent" credits — never expire, so
  no waste) are available on Pro+; per-credit top-up price isn't published,
  check in-account before relying on it as the overage path.
- PRO gating: same as all AI generation (`isPro` / `AiTab` pattern) — but **no
  BYOK discount** (§4): Simulacrum always charges credits, Pro-with-keys or not.

## 6. Retention

Keep **both formats indefinitely** for now. A finished mini ≈ 15–30 MB; Supabase
storage ≈ $0.021/GB/mo ⇒ a mini costs ~**€0.0005/month** to keep vs ~€4–6 revenue.
Deleting a paid-for STL and forcing a 500-credit re-forge is hostile; a retention
cron is premature optimization. Revisit only if storage cost ever registers —
the `{userId}/{miniId}/` path layout makes a future sweep trivial. Deleting the
mini (or its source entity) deletes the folder via the existing
`removeByPublicUrl` pattern extended to folder removal.

## 7. Build phases (no Meshy sub required until Phase 4)

- **Phase 0 — foundations**: migration (`minis` + bucket + credit rows + cron
  skeleton), `BUCKETS` entry, types, and the feature switch — an admin setting
  `simulacrum_mode: 'hidden' | 'teaser' | 'live'` (`live` additionally requires
  the Meshy platform key to be present). `get_advisors` after migration.
- **Phase 1 — stylize step (fully testable today)**: format-specific prompt
  templates + wizard steps 1–2 wired to the existing image engine. This alone is
  shippable value ("mini-style portrait render") and de-risks the prompt work.
- **Phase 2 — Meshy client + job machine (mock-tested)**: `_shared/mesh3d.ts`
  with a `MESHY_MOCK=1` mode returning a fixture GLB/STL from the bucket; vitest
  for the state machine + credit math (TDD per house rule); cron poller.
- **Phase 3 — preview + gallery**: `@google/model-viewer` preview, `/minis`
  gallery, entity-page badges, downloads.
- **Phase 3.5 — demand gate (`teaser` mode)**: ship the entry point _visible_
  before buying the Meshy sub. Clicking "Mini" opens the wizard shell with a fun
  in-lore broken state — e.g. _"The ritual fizzles; the simulacrum collapses
  into mist. The binding sigils are not yet inscribed."_ — plus a **"Notify me
  when the ritual is complete"** button that records one row per user in a small
  `feature_interest` table (`user_id`, `feature`, `created_at`, unique on
  user+feature; RLS insert-own/select-own, admin reads the count). The counter
  (surfaced in the admin panel) is the buy-signal: enough clicks → Phase 4. No
  credits are ever charged in teaser mode.
- **Phase 4 — go-live**: demand proven → buy Meshy Pro, add platform key, one
  real end-to-end smoke per format, flip `simulacrum_mode` to `live` (and
  notify the interested users — the `feature_interest` rows are the list).
- **Phase 5 (later) — print partners**: STL → print-service API, fulfillment
  status on the `minis` row.

## 8. Decisions (resolved 2026-07-18)

1. **Re-sculpts are free, capped at 2** — no `mini_resculpt` charge; paid
   retries on a failed roll would trigger dissatisfaction. Meshy cost absorbed
   (§5 margin math); cap reduced from 4 → 2 because we pay per retry.
2. **VTT mesh params are provisional defaults** (standard mode, ~20k polys) —
   Jeffrey prints; VTT export is an encore for players who use 3D tables, so
   tune empirically during Phase 4 smoke testing and iterate on real VTT-user
   feedback. Low stakes.
3. **Minis inherit portrait visibility** — a 3D model is part of the portrait;
   anyone who can see the source entity's portrait can see/download its minis
   (§3 RLS + live-sync).
4. **Generated models only** — we do not host user-uploaded 3D files until
   further notice (model file sizes). The `mini-models` bucket is written
   exclusively by the pipeline (service-role); no client upload path.
5. **Baseless minis; we provide the base + real-mm scale** (2026-07-18,
   supersedes "base at the image step"): the stylize prompt forbids any
   pedestal; a curated 25 mm base library + server-side composition (Phase 4.5,
   #542) seats and scales the figure to 28–32 mm. Uniform bases across a
   collection, print-ready STL scale, and free instant base swaps (no Meshy
   re-run).
6. **Refunds only for our failures** — like all prior AI generations. "Ours" =
   our tooling OR the vendor's tooling, never user choice. The operating rule
   is **vendor-refund passthrough**: Meshy auto-refunds `FAILED` tasks, so we
   release the user's hold; a user canceling/deleting an in-flight sculpt
   abandons a task whose vendor cost is sunk, so the hold settles as a charge
   (and consumes the attempt). Open question for Phase 4 smoke testing: whether
   Meshy refunds _canceled/deleted_ tasks — if it does, wire cancel to delete
   the Meshy task and refund the user (vendor refunds → we refund).
