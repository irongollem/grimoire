# Cartographer — Tile-Based Battle Map Builder

> **Status:** M1–M8 implemented. M7 was resumed after #772 established a reliable schema-derived generation and QA contract. The spec below is the source of truth for design intent. The "As-built" appendix at the bottom records actual file paths per milestone.

## Overview

Cartographer is a tile-based battle map editor for DnD encounters. The DM paints maps on an infinite grid using brushes loaded from versioned **tile packs**. Output is a single baked image suitable for VTT import or table-screen display, with the underlying map data preserved as structured cell records so a future in-app VTT can consume it directly.

It is a **publishing tool**: it produces artifacts that are consumed elsewhere (Atlas locations, exported images). The underlying source maps are user-scoped private documents. Published maps land in [Atlas locations](world-building.md) via the existing `locations.map_url` field.

### Two entry points

Cartographer is reachable from two places in the nav — both open the same editor:

| Entry point       | Where in nav                | Mental framing                                                      |
| ----------------- | --------------------------- | ------------------------------------------------------------------- |
| Dungeon Craft tab | `/dungeon-craft` (6th tab)  | "I'm prepping a dungeon" — map authoring sits next to traps/puzzles |
| Publishing Tools  | Publishing group in sidebar | "I'm making a printable/exportable artifact"                        |

Routes (all):

- `/cartographer` — list of source maps (`dungeon_maps`)
- `/cartographer/new` — new map, opens the editor
- `/cartographer/:id` — editor for an existing map
- `/dungeon-craft?tab=cartographer` — the DC hub tab (same list view, embedded)

After save/delete, navigate to `/cartographer` (per the post-mutation rule in CLAUDE.md).

---

## Architecture Decisions (with reasoning)

These decisions are locked. The reasoning is preserved here so future agents understand the trade-offs without relitigating them.

### Rendering: Canvas 2D, multi-layer composite

**Chosen:** stacked offscreen `<canvas>` elements (floor / wall / object / annotation) composited each frame to a visible canvas. Dirty-rect redraws per stroke.

**Rejected:**

- **DOM (divs)** — 2500+ reactive nodes thrash on hover/drag; html2canvas export is unreliable.
- **WebGL / Pixi.js** — overkill for static tile painting. Kept as a future escape hatch if perf on huge maps demands it.
- **WebAssembly** — painting is GPU/draw-bound, not CPU-bound. WASM adds complexity with no win. Reserve for future pathfinding / fog-of-war / line-of-sight calc.

### Storage: two buckets, because shared and private are different access models

**Chosen:**

- **A DM's own packs** live in the private bucket `tile-packs/` under `<user_id>/<pack_id>/v<version>/`. Owners and members of campaigns the pack is shared into receive signed URLs.
- **Shared packs** live in the public, CDN-fronted bucket `library-tile-packs/` under `<library_tile_packs row uuid>/v<version>/`, and their rows live in `library_tile_packs` (#889). A map render pulls 20–60 tiles at once, so signing each one is the wrong shape for content meant to reach everybody.
- `public/cartographer/` is now **source material only** — the twelve manifests the seed script reads. Nothing in the app loads from it at runtime.

**Rejected:**

- One bucket for both. `tile-packs` is private and holds users' own packs; flipping it public to serve shared content would expose every one of them, and a single prefix bug in a mixed bucket is a data exposure rather than a display glitch.
- A hardcoded pack list. `BUNDLED_PACKS` in `MapWorkbench.vue` was exactly that until #889 S6 deleted it. A constant shadowing the table is the legacy path CLAUDE.md's rule 1 forbids, and it meant adding a pack needed a deploy.
- Keying shared objects by the pack's slug. Every registry bucket's bytes are read back through the CDN Worker, which consults neither storage RLS nor the bucket's `public` flag — so bytes are world-readable by URL and confidentiality comes from the path being unguessable. A library pack is authored in the open, tiles landing weeks before publication, so a name-derived path would put an unannounced pack one guess away. The row's uuid costs nothing and survives a rename.
- Public object URLs for *private* packs — a guessable URL must not bypass ownership or campaign membership.

### The library lane (#889)

An app admin authors a shared pack from Admin → Content, through the same generation engine a Pro DM uses. A run carries exactly one of `tile_pack_id` or `library_tile_pack_id`; the library lane has no campaign, no Pro check and no credit charge, and is gated on `private.is_app_admin()`. The engine resolves a `PackTarget` (bucket, table, prefix, row id) from the run row's own foreign keys — never from anything the caller sends — which is what keeps the two lanes from bleeding into each other.

**Generation is free but accounted.** No credits are reserved or spent, yet every call still goes through `recordFreeGeneration`, so the real provider cost stays visible to cost reporting and `get_credit_calibration_hints`. Free to the admin is not free to us, and a cost nobody can see is one the calibration hints will quietly recommend cutting.

**Publishing is a server-validated transition, not a column write.** `publish_library_pack` refuses an incomplete pack: RLS cannot make that check, and a published pack with missing slots breaks the Cartographer for every DM who picks it. So `library_tile_packs.status` is a *publication* gate — `draft`/`published`/`archived` — and never carries the user lane's `ready`/`failed`. A published pack cannot be deleted either; its `PackRef` is referenced by maps in every DM's campaign, so unpublishing is the retirement path.

**That gate asks about bytes, and until #900 it asked about declarations — which is not the same question.** It originally ran `validatePack`, which reports a slot present the moment the manifest names it with a URL; whether anything was ever stored at that URL never enters into it. The ten packs migrated by #889 S7 declare their full slot lists and hold no images at all, so `validatePack(...).valid` was `true` for every one of them and all twelve went out `published`. Measured against production on 21 Sep 2026, five DMs in six were being offered packs that drew nothing but procedural placeholders.

The gate is now `hasCompleteArt` (`src/cartographer/packCoverage.ts`): every *required* slot must carry a positive `byteSize`. `validatePack` is still called and its findings still ride along with a refusal — a duplicate slot or a non-WebP url is the likeliest reason a slot the admin thinks they filled is not being counted — but its boolean is no longer the gate. Migration `20260921000230` returned the ten artless packs to `draft`; `wood-interior` keeps its publication, being incomplete against its own declaration rather than empty.

**`packCoverage.ts` is the single answer to "what does this pack actually have".** It is read by the publish gate, by `generate_library_pack`'s slot selection and by all three admin components. Two notions of missing coexist deliberately: *undeclared* (the manifest omits the slot — what `validatePack` and `createGenerationPlan`'s default `missingSlots()` see) and *undrawn* (declared, no bytes — what everything in the admin lane means). Confusing them is what shipped the empty packs.

### One drawing module (#1065)

`src/cartographer/drawMap.ts` is the one implementation of what a map looks like: floor and terrain, rock, walls, doors, joints, curbs, stamped objects, Dressing, glyphs and the render-time shadows. The live editor (`renderMap.ts`) and the offline bake (`bake.ts`) both call it. They used to carry a copy each and the copies had drifted: the bake had no fallback runtime and never drew rounded corners. A change to how a map looks is made once, in `drawMap.ts`, and reaches the editor and the published picture together.

**Two passes, two published images (#1073).** The battle map lays its grid between the floor and what stands on it ("props, trees, walls are ON the grid, the floor is UNDER it"), so `DrawMapInput.pass` splits the draw. `ground` draws the ground, sunk edges, `afterGround`, stairs down, the shadow layer, curbs, posts, flat objects, flat dressing, lights, and then the rock. `standing` draws standing objects and dressing, stairs up, edges (walls, doorways, leaves, grates, sluices, decals), joints, `afterDressing` and glyphs, and nothing else. Absent or `all` is the whole map in the original order (rock after the stairs up, before the edges), which the live editor, the PNG download and the AI styler input still use. Rock belongs to the ground pass because it is the outer mass: the Water set's open sea is solid rock and its live glints are drawn under the grid. Publish bakes both with `bakeMap(..., { transparent: true, pass })`, which share one size, origin and padding so one `map_layer_calibration` fits both, uploads them to the same bucket (the standing file named `<uuid>-stand.webp`) and writes `locations.map_layer_url` (ground) and `locations.map_layer_stand_url` (standing, null for a site published before the split, whose one picture is all ground). Map annotations (labels) are drawn by the standing bake only. Clearing the Drawing clears both columns. The uploads run together; a failed one removes those that landed, and after the Drawing write the images it replaced are removed unless another row (a campaign copy) still holds them (`deleteUnreferencedByPublicUrl`).

What stays with the callers is everything that is not pack content: the background fill, annotations and every editor-only overlay (grid, hover, previews, selection). Two hooks, `afterGround` and `afterDressing`, let the editor slot its grid and its derived-space outlines into the stack without `drawMap.ts` knowing about either. Like `renderMap.ts` it takes plain values only and must not import `vue`. The runtime lookup differs on purpose: the live editor falls back to the active pack for an unknown pack id, the bake does not, because a bake must not draw a map in a pack it was not painted with.

### Publishing art made outside the app (#891)

Since 14 Oct 2026 the library packs are painted outside the app, by an image agent on a subscription rather than the admin lane's API key, as edits of the base set (`src/assets/tile-base/`). `npm run tile-pack:publish -- --pack <id> --dir <folder>` puts one pack's finished art in: a folder of 128×128 WebP tiles at the paths a manifest names, the rotated slots included. It rebuilds the manifest at the current schema from the folder alone (a repaint replaces every slot, so two lanes' walls never mix in one pack), marks each tile with its AI provenance, uploads to R2 at `library-tile-packs/<row id>/v<n>/…`, and writes the manifest last so it never names bytes that are not there yet. Dry run by default; `--write`, plus `--yes-production` off loopback.

**The row stays a draft.** Review it in Admin → Content and press Publish, which runs `hasCompleteArt`; `--publish` does the same from the script. A published version is never repainted in place: `--version <latest + 1>` drafts a new row beside it, which is how a repaint is compared with the art it would replace.

**`seed-library-tile-packs` must not be used for this.** It re-reads all twelve packs from `public/cartographer/` and keeps `byteSize` only for slots with a file on disk, so one run would erase every tile the admin lane ever made.

**The art is a sprite sheet cut afterwards (#1065).** A set is painted as a few sheets (one seamless floor, a structure sheet, scatter and glyphs) so it reads as one place, then cut into the 128×128 tiles. The manifest fields no tile can carry come from an optional `pack.json` beside the tiles (`SIDECAR_FILE`, parsed by `parsePackSidecar` in `scripts/lib/tile-pack-publish.ts`): `continuous` (category to period, a positive integer), `labels` (category to non-empty names) and `doorLeaf` (`hingeX` and `hingeY` from 0 to 1, `openDegrees` from 1 to 180). Every problem in the file is reported, not just the first, and nothing invalid is applied. The sidecar is the only source of these fields: `buildManifest` never inherits them from the older published version, for the same reason it never inherits slots. Without a `pack.json` the pack has none of them.

`wallRoundJoint` is left out of these packs (`--exclude wallRoundJoint`) until #1063: the renderer puts a round joint's carve on the outside of a room's corner, so on a rectangular room each corner draws as a square block of wall. Without the category, maps fall back to the plain `wallJoint` squares, which draw correctly.

### Editing a library pack (#900)

Each row in Admin → Content opens an editor: the pack's name, description, licence, attribution source and sort order, a coverage bar, a slot grid, and a button that generates whatever is still blank.

**The description is the art bible, which is why editing it matters.** `createGenerationPlan` feeds it straight to the image model, and `update_library_pack` patches `manifest.name`/`manifest.description` alongside the columns so the two cannot drift — a rename that left the manifest stale would brief the next run from text the admin had already changed. `stone-dungeon` was carrying "Tiles in this pack are placeholder-generated until the AI generation pipeline ships M1 assets" as its brief, which is exactly what an unreachable field decays into.

**Generation against an existing pack fills gaps in place.** `generate_library_pack` keeps the pack's `pack_id`, `pack_version` and manifest, and plans jobs only for undrawn slots: `undrawnSlotIds`, optionally narrowed to the required floor, since a migrated pack declares ~53 slots of which 19 are load-bearing and each costs real provider spend. The planner always supported this (`createGenerationPlan`'s `selectedSlotIds`); what was missing was an action that targeted a row instead of creating one.

**The proof phase is conditional, and this is the subtle part.** `PROOF_SLOTS` is `floor:0`, `wallSegmentH:0`, `solidBlock:0`. A gap-filling run on a pack that already has those three plans none of them, and a run left in `proof_pending` with zero proof jobs can never reach `awaiting_approval` — that transition fires in `completeSlot` only when a proof job completes — so it would hang unadvanceable. Such a run opens directly in `generating` (`initialGenerationStatus`). `styleReferences` then falls back to downloading the pack's own existing proof-slot tiles, so the new art is briefed by the pack it is joining rather than by nothing.

**Uploading a tile is an edge action, not a client storage write.** `library-tile-packs` is declared `clientWrites: false, adminPrefixes: []` in `_shared/storage-policy.ts` and carries a select policy only — no browser holds a write path to this bucket, admin or otherwise. `upload_library_tile` is `completeSlot` minus the generation half: validate 128×128 WebP, upload at `${prefix}/${slotRelativePath(slot)}`, patch the manifest slot's `byteSize`. It deliberately does **not** write `ai_provenance`: `completeSlot` sets it on every normalize because everything that path writes is model output, and claiming provenance for a human-drawn tile would be a false Art 50 attestation, not a completeness fix. A pack keeps whatever provenance its generated tiles earned.

One consequence worth knowing when replacing a tile: the bytes land at the *same* CDN path, because the path is derived from the slot's identity and not its contents. The slot grid stamps a cache-busting query on anything it uploads in-session; `byteSize` alone would not do, since two different 128×128 WebPs can encode to the same length.

**Ten of the twelve migrated packs shipped no art, and that was the pre-existing state, faithfully carried over.** Only `wood-interior` (24 tiles) and `celestial-observatory` (29) have real WebPs; the rest declare their full slot list and rely on `packLoader.ts` drawing procedural placeholder tiles from the manifest's `palette`. Filling them in is what the admin lane is *for*, one pack at a time, with no code change — and since #900 they are `draft`, so the picker stops offering them until they have art. The 53 tiles that do exist were produced before the generator learned to mark its output, so `scripts/seed-library-tile-packs.ts` embeds the XMP provenance packet as it uploads them (EPIC #611); `wood-interior` records `provider`/`model` as `unknown` because no record of how it was made survives, and the Art 50 obligation is to disclose *that* an image is AI-generated, not to invent a model id.

The project is on **Supabase Pro tier** (250 GB egress/mo); tile-pack bandwidth is a non-issue.

### Asset format: WebP only

Project-wide policy. The pack loader **rejects any non-`.webp` asset**. Exports bake to WebP. The "Download PNG to your disk" button performs **client-side** canvas rasterisation — PNG never touches storage. Atlas uploads cap at 5 MB after WebP encoding; canvas attempts a quality downgrade once before erroring.

### Rendering data: sparse cells with per-cell pack reference

**Chosen:** each painted cell stores its own pack reference, not just the map. Brushes carry their pack; switching themes mid-map changes future strokes only.

**Why per-cell pack?** This lets a single map mix themes cleanly (e.g. a dwarven hall opening into a natural cave). Each pack stays internally consistent — no muddy blending between zones. Each cell renders its variant from its own pack, regardless of what packs neighbouring cells use.

### Wall model: edge-based walls + optional cell-based solid blocks

**Chosen:** walls are stored on **cell edges**, not in cells. A floor cell carries optional `wallN` / `wallW` properties; south and east edges are owned by the cell to the north / west (canonical "NW ownership" rule eliminates duplicates). A separate **`solidBlock`** layer lets the DM place full-cell thick walls (5 ft of dressed stone, sand-filled battlement, mountain rock) when wall thickness is itself part of the dungeon's mass.

**Why both?**

- **Edge walls** keep playable floor space intact — a "10×10 room" *is* 10×10 walkable squares, with walls on the perimeter edges. Matches DnD 5e grid semantics and how Foundry/Roll20/Dungeondraft model walls.
- **Solid blocks** preserve builder agency over wall thickness. A curtain divider and a sand-filled battlement should not be forced into the same visual mass; the builder picks. Solid blocks also model castle keeps, mountain passes, narrow corridors carved through rock — anywhere the wall has volume.

**Rejected:**

- Wall-as-cell exclusively — silently steals 25–40% of grid area to walls, doesn't VTT-round-trip cleanly.
- Edge-walls only — forces all walls to be thin; loses the dungeoneering aesthetic of thick masonry.

Doors live on edges (replacing the wall segment on that edge), exactly as in reality. Crossing a door = crossing an edge, not entering a cell. Grates and sluices (#1065) are edge segments too: they cut the space flood fill like walls and are not ways, so a canal passing through a grate does not join two rooms.

### Infinite canvas with crop-on-export

**Chosen:** no fixed map dimensions. Pan/zoom; sparse storage; export computes the bounding box of painted cells and pads with N cells of black before rasterising.

**Why?** It removes the "what size map should I create?" friction at start. Painting starts at origin and grows. Hard safety cap at 500×500 painted extent (≈70 MB raw PNG at 128 px tiles — past that browser memory dies). Soft warning at 200×200.

### Data preserved for future VTT

**Chosen:** even though the current focus is *image creation*, map data is stored as structured cell records. Each cell can carry first-class links to Grimoire entities (traps, encounters, features, notes, NPC spawns). This is the **USP** vs. Dungeondraft / Inkarnate — those export images; Cartographer exports images **and** keeps the navigable data behind them.

---

### Dressing: a prop library beside the packs, not inside them (#1062)

**Chosen:** generic props (tables, beds, coffins, campfires, 62 of them to start) live in their own shared library, `library_dressing`, with art in `dressing-images/srd/`. A DM places them on any map whatever pack painted it: a table is a table on marble, sand or lava rock. The packs keep their six themed object categories (a lava brazier, a marble statue); a pack chest and a Dressing chest on the same map is fine.

- **Opt-in per source, like every library.** `grimoire-dressing` is a `content_sources` row a DM switches on through the book icon in the Dressing panel, and it starts off. Enablement decides what the picker offers, never whether a placed prop draws (the #954 rule): the renderer reads every `library_dressing` row.
- **Its own layer, not the object grid.** `layers.object` is keyed by one cell, so a stamp cannot span cells or overlap. `layers.dressing` is a record of placement uuid to `{ prop_id, x, y, rotation, z }`: a footprint of up to 4x4 cells, any angle, and `z` for stacking, because jsonb does not keep object key order and insertion order would not survive a reload.
- **The battle map gets Dressing through the bake.** The runner draws `locations.map_layer_url`, the image Publish bakes, and nothing under `src/lib/battlemap/` reads `dungeon_maps.layers`. A prop appears in play after a re-publish, with no runner change. Hiding or revealing single props in play is not built.
- **Library only in v1.** No DM-uploaded props and no per-user art overrides, so no campaign-scoped Dressing row exists. Both have precedents if they are ever wanted (`user_tile_packs`, `library_monster_art`).

**Rejected:** adding the props as a seventh category to every pack, which would mean twelve copies of every table and a map whose furniture changes when its floor does.

## Tile Pack System

A tile pack is a versioned bundle of WebP assets keyed against a strongly-typed schema. The schema is the source of truth for what every pack must contain.

### Schema (`src/cartographer/packSchema.ts`)

The schema is at **version 4**. Three kinds of category exist: `random` (interchangeable variants, a min and a max), `directional` (a fixed set of sides, optionally `variantsPerSide`) and `optional` (zero up to a max). The table below is generated from `TILE_PACK_SCHEMA`; the code is the source of truth, so re-read `packSchema.ts` rather than trusting this copy after a bump.

| Category | Required | Shape |
| --- | --- | --- |
| `floor` | required | 8 to 64 variants (64 so a continuous floor can be cut 8×8) |
| `wallSegmentH` | required | 2 to 6 variants |
| `wallSegmentV` | required | 2 to 6 variants (rotation-derived from H) |
| `wallJoint` | optional | directional: L_NE, L_SE, L_SW, L_NW, T_N, T_E, T_S, T_W, CROSS |
| `wallRoundJoint` | optional | directional: L_NE, L_SE, L_SW, L_NW |
| `doorwayH` | required | 1 to 3 variants: the opening and its frame, in the wall band |
| `doorwayV` | required | 1 to 3 variants (rotation-derived from `doorwayH`) |
| `doorLeaf` | required | 1 to 3 variants: the door alone, never squashed |
| `solidBlock` | required | 4 to 12 variants |
| `stairsUp`, `stairsDown` | optional | directional: N, E, S, W |
| `curbH`, `curbV` | optional | 0 to 6 variants: a low ledge on an edge between terrain and floor |
| `curbPost` | optional | 0 to 2 variants: where a curb meets a wall or turns |
| `terrainWater` | optional | 0 to 64 variants: a continuous texture (water, sludge, lava, a stream) |
| `edgeGrateH`, `edgeGrateV` | optional | 0 to 3 variants each: bars across an opening in a wall |
| `edgeSluiceH`, `edgeSluiceV` | optional | 0 to 3 variants each: a gate in a wall |
| `wallDecal` | optional | 0 to 8 variants: a pipe mouth, a rat hole, a carving, drawn over a wall |
| `rubble`, `debris` | optional | 0 to 4 variants each |
| `objectChest`, `objectBarrel`, `objectTable`, `objectStatue`, `objectPillar`, `objectBrazier` | optional | 0 to 4 variants each |
| `hazard*` (twelve, `hazardGeneric` included) | optional | 0 to 4 variants each; see Schema v3 |
| `feature*` (eleven, `featureGeneric` included) | optional | 0 to 4 variants each; see Schema v3 |

The required set is floor 8, wall H 2 and V 2, doorway H 1 and V 1, door leaf 1 and solid block 4: **19 slots**, of which three are rotations of another (`wallSegmentV` ×2 and `doorwayV`), so **16 renders** are drawn by hand or by the generator. `REQUIRED_CATEGORIES` is derived from the table, never listed.

```ts
export interface TilePackManifest {
  pack_id: string              // e.g. "stone-dungeon"
  name: string
  description: string
  pack_version: number         // bumped per pack release
  schema_version: number       // matches TILE_PACK_SCHEMA.version at author time
  base_tile_size: 128          // source resolution; always 128
  assets: Partial<Record<PackCategory, AssetSlot[]>>
  palette?: Partial<Record<PackCategory, [number, number, number]>>  // placeholder colours
  continuous?: Partial<Record<PackCategory, number>>   // schema 4: a texture's period, in cells
  labels?: Partial<Record<PackCategory, string[]>>     // schema 4: a name per variant
  doorLeaf?: { hingeX: number; hingeY: number; openDegrees: number }  // schema 4
}

export interface AssetSlot {
  side?: string                // for directional categories
  variant: number              // 0-indexed
  url: string                  // relative to pack root or full URL
  byteSize?: number            // for budget warnings
  rev?: number                 // ms epoch of the last write; the CDN cache key (see AssetSlot.rev)
}
```

**The three schema 4 manifest fields** are carried through every writer (`upsertManifestSlot`, the edge function's `completeSlot` and `completeRotation`, `buildManifest`):

- `continuous` is the texture's period in cells. Its variants are the cells of one seamless texture in row-major order, and the renderer picks by position, not by hash: `floor`, `solidBlock` and `terrainWater` take `(x mod n) + n·(y mod n)`; `wallSegmentH` and `curbH` take `x mod n`; `wallSegmentV` and `curbV` take `y mod n` (they are the H tiles turned, so they continue along y and share the H period). A category without a period, and a pack that declares fewer pieces than the position needs, keep the stored hash variant. Only a wall's pieces continue along it: a doorway, grate or sluice is one fitting and keeps its stored variant.
- `labels` is a display name per variant, so a forest's `objectPillar` reads "Old tree" in the stamp picker and a sewer's decals read "Outflow pipe" and "Rat hole".
- `doorLeaf` says where the hinge sits in the leaf tile (fractions of the tile) and how far an open door swings. Absent, the renderer uses `DEFAULT_DOOR_LEAF` (hinge at 0.25, 0.5; 80 degrees), which suits a leaf drawn exactly where it sits in a `doorwayH` opening (the opening spans x 0.25 to 0.75 of the tile).

`palette` is the per-category RGB base colour for procedural placeholders and for colour-aware prompts. `rev` on a slot is stamped whenever its bytes are written, because a replaced tile lands at the same path and the CDN serves objects `immutable` for a month; readers append it as a query parameter.

### Validator (`src/cartographer/validatePack.ts`)

```ts
validatePack(manifest: TilePackManifest): {
  valid: boolean
  missing: { category: PackCategory; side?: string; variant?: number }[]
  extras: string[]
  warnings: string[]   // oversize, wrong dimensions, suspect format
}
```

A manifest whose `schema_version` is newer than the app's gets a warning; an older one is silent (see Schema v4 for why that no longer means "compatible"). Validation runs at:

1. Pack load (rejects invalid packs with a toast: "Stone Dungeon is missing 4 required tiles — pack not loaded").
2. Pack authoring tooling (CLI / future AI generator) iterates `missing` slots to generate exactly what's needed.

### Naming & layout

Pack files live in storage at `tile-packs/<pack_id>/v<pack_version>/<category>/<side?>/<variant>.webp`.

Example:

```text
tile-packs/stone-dungeon/v1/floor/0.webp
tile-packs/stone-dungeon/v1/floor/1.webp
tile-packs/stone-dungeon/v1/wallSegmentH/0.webp
tile-packs/stone-dungeon/v1/wallSegmentH/1.webp
tile-packs/stone-dungeon/v1/wallSegmentV/0.webp
tile-packs/stone-dungeon/v1/doorwayH/0.webp
tile-packs/stone-dungeon/v1/doorLeaf/0.webp
tile-packs/stone-dungeon/v1/solidBlock/0.webp
```

Directional categories (`wallJoint`, `wallRoundJoint`, `stairsUp`, `stairsDown`) keep the `<side>/` subfolder; random categories store variants directly under the category folder.

The starter Stone pack mirrors this under `public/cartographer/stone-dungeon/v1/`.

### Maintainer tile-pack authoring (`#772`)

The maintainer pipeline is a schema consumer, not another pack schema. Its entry point is:

```bash
npm run cartographer:pack -- <command>
```

`init` creates a resumable workspace from the current `TILE_PACK_SCHEMA` and the missing slots reported by `validatePack()`. The minimum loop is:

```bash
npm run cartographer:pack -- init \
  --id celestial-observatory \
  --name "Celestial Observatory" \
  --theme "Midnight-blue stone, aged brass constellations, and cold starlight" \
  --material-note "aged brass constellation inlay" \
  --palette-note "midnight blue and cold starlight"

npm run cartographer:pack -- status --workspace art-src/cartographer/celestial-observatory/v1
npm run cartographer:pack -- import --workspace art-src/cartographer/celestial-observatory/v1 \
  --slot floor:0 --source /path/to/accepted-image.png \
  --provider openai --model gpt-image-2 --quality low
npm run cartographer:pack -- qa --workspace art-src/cartographer/celestial-observatory/v1
```

The workspace contains an editable `art-bible.json`, `generation-plan.json`, code-generated geometry templates, one prompt per slot, accepted high-resolution sources, retry history, and QA output. `art-src/` is deliberately outside the deployed bundle and ignored by default; archive or force-add a completed workspace when its high-resolution source provenance must travel with a release. Only normalized 128×128 WebPs and `manifest.json` are written under `public/cartographer/<pack-id>/v<version>/`.

The compiled art bible follows this precedence:

1. mechanical category and tile geometry;
2. explicit pack-local theme;
3. campaign-consistency mode (`adaptive`, `match-campaign`, or `independent`);
4. compatible campaign medium, motifs, and tone;
5. biome/environment defaults only in `match-campaign` mode;
6. per-slot variation.

Raw campaign context is provenance only. It is never appended wholesale to every prompt, so a tropical pack in a winter campaign does not silently acquire snow. Editing the art bible and rerunning `plan` recompiles prompt/mechanics fields while retaining each job's accepted paths, status, and attempt history.

Each generation job is self-contained and provider-neutral: slot identity, canvas and footprint, alpha/tileable-edge contract, final prompt, references, canonical paths, status, and attempts are data. The authoring block declares `interactive-imagegen` as the default, `requires_openai_api_key: false`, and `performs_metered_api_calls: false`. Maintainers invoke built-in Codex/ChatGPT `$imagegen` and import chosen files. The execution block records `gpt-image-2` at `low` quality as the production hint, declares a QA-passed candidate final, and makes any quality escalation an explicit manual exception. These are executor hints, not additions to the tile-pack schema, so #384 can later consume the same logical jobs through a server-side provider.

An import may record provider, model, quality, provider request id, duration, token usage, and estimated cost on its accepted attempt. Interactive imports can omit unknown fields; an automated #384 executor should populate everything its provider reports. Rebuilding a plan preserves this provenance with the retry history.

`import` rejects undecodable, undersized, or extreme-aspect-ratio sources, retains the accepted high-resolution file, then deterministically crops/fits, reconstructs required alpha, resizes, converts, writes the canonical WebP, and updates the draft/runtime manifests. `reject` records a reason without disturbing other slots; `plan --slot <category:side?:variant>` adds or refreshes an individual schema slot.

`validate` checks schema completeness plus deployed file existence, format, exact dimensions, alpha, and that the `doorwayH`/`doorwayV` opening is transparently clear (the leaf, not the doorway, is what closes it). It also fails on any `validatePack` warning (duplicate slot claim, non-WebP asset, a category over its schema max) and on a floor or solidBlock whose opposite edges differ by more than `MAX_EDGE_DELTA` (40), set at roughly twice the worst of the twelve accepted `celestial-observatory/v1` tiles. `qa` additionally produces:

- a labelled contact sheet;
- repeated floor seam strips;
- a seeded 20×20 floor field with no immediate orthogonal repeats when alternatives exist;
- wall, doorway and door-leaf alignment (the leaf is checked along the horizontal band);
- a procedurally assembled sample map;
- a machine-readable validation report.

The checked vertical slice is `celestial-observatory/v1`: all schema-required slots (20 at schema 1 to 3, 19 since the door tiles became a doorway and a leaf) plus directional rounded-corner, staircase, and cross-junction proofs. It demonstrates a non-standard theme with real interactively generated artwork; optional prop categories remain intentionally ungenerated.

This tooling is maintainer-only. It does not implement #384's customer UI, uploads/storage, RLS, campaign sharing, PRO gates, credit reservations, cancellation/refunds, or direct Images API execution.

#### Feasibility result for a future asynchronous generator

The #772 vertical slice supports a qualified **yes**: a user can eventually choose a theme and receive a complete generated pack asynchronously, provided "complete" means mechanically valid and review-ready—not guaranteed artistically perfect in one model pass.

The experiment established a useful boundary:

- Code can guarantee schema coverage, slot identity, paths, dimensions, WebP encoding, alpha masks, doorway openings, rounded-corner silhouettes, stable variation selection, retry isolation, and reproducible QA.
- Image generation can produce a coherent non-standard visual family and genuinely distinct variants when every job shares an approved art bible and representative visual references.
- Image generation does not reliably guarantee exact geometry, transparency, seamlessness, orientation, or absence of white/checkerboard residue. Those failures occurred even with explicit prompts and templates; deterministic normalization and QA caught or repaired them.
- Global quality cannot be judged slot-by-slot. Contact sheets, tiled fields, seams, and assembled-map previews are necessary to expose repetition and cross-category drift.

A production implementation in #384 should therefore be a durable staged job, not one large prompt or a blind batch:

1. compile an editable art bible and explicit consistency mode;
2. generate a small floor/wall/block/object style proof and get approval;
3. fan out schema-derived slot jobs with those approved images as references;
4. normalize and run hard mechanical gates per candidate;
5. score geometry, distinctness, seams, and family coherence, retrying only failed slots within a bounded attempt/cost policy;
6. assemble global QA sheets and retry the weakest outliers;
7. publish only after hard validation passes, while presenting the result as review-ready and allowing individual user replacement/regeneration.

Use `gpt-image-2` low for every normal production candidate. A bounded
`gpt-image-1-mini` low-quality experiment found the cheaper model promising for
a full-cell floor after 128×128 reduction, but unreliable for open-door alpha
and rounded-junction coverage even with geometry and style references. At the
time of the experiment, a matched two-prompt comparison put Image 2 at roughly
30% above mini after estimated text input. Image 2 produced a usable normalized
open door where mini collapsed to black and improved rounded-mask IoU from
`0.537` to `0.638`. More importantly, the Image 2 low results were already good
enough at the runtime tile size: passing normalization and QA makes them final,
not drafts awaiting an automatic medium/high upgrade.

Retry failed slots at low quality within the bounded attempt policy. Medium or
high quality is a manual escape hatch for a persistent artistic failure, not a
routine pipeline stage. This avoids paying twice for every successful tile and
keeps one predictable baseline across simple floors, transparent doors, rounded
corners, stairs, and other complex slots. Keep the routing policy out of the
tile-pack schema and record provider/model/quality on each attempt.

The generation plan in this ticket is the provider-neutral input to that flow. #384 must add durable queues, provider request ids, cancellation, storage/RLS, credit reservation/finalization/refunds, progress UI, and recovery for interrupted jobs. It should not promise "perfected" output: the defensible product promise is a **complete, validated, coherently generated tileset with bounded automated refinement and user-controlled final review**.

**Schema 4 tooling.** The plan lists 16 renders for the 19 required slots; `ROTATION_DERIVED` in `authoringPlan.ts` names the three rotations, and `slotMechanics` there is also what `qa.ts` asks which categories are transparent outside their footprint, so a new transparent category (a curb, a grate, a decal) is checked without anyone listing it. The base shapes in `src/assets/tile-base/` hold the new categories (`doorwayH/V`, `doorLeaf`, `curbH/V`, `edgeGrateH/V`, `edgeSluiceH/V`); `_defs.md` describes them. `placeholderTile.ts` draws a procedural stand-in for each, so a pack missing an optional slot still draws.

### Pack versioning

Every map cell stores `pack_id` **and** `pack_version`, but only the id picks the art. The editor and the bake load one runtime per pack id, the library pack's **published** version (`useLibraryTilePacks().publishedPacks`, `MapWorkbench.vue` keys `loadedRuntimes` by pack id, `renderMap`/`drawMap` look a ref up with `runtimes.get(pack_id)`), so publishing a new version of a pack and archiving the old one moves every map drawn with it at once. Variants are kept by number; a variant the new version does not have borrows another drawn variant of the same category and side (`standInVariant` in `packLoader.ts`), and only a category with no art at all draws a placeholder. The stored `pack_version` is a record of what the cell was painted with, not a lock.

An **Update Tileset** button that walked cells onto a newer version was planned here and never built; per-id resolution made it unnecessary. To see a repaint on existing maps, publish the new version in Admin and archive the old one.

---

## Map Data Model

### `dungeon_maps` table

```sql
create table dungeon_maps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  layers      jsonb not null default '{"floor":{},"solidBlock":{},"object":{},"annotation":{},"dressing":{}}'::jsonb,  -- dressing since #1062
  metadata    jsonb not null default '{}'::jsonb,   -- per-cell entity links (see below)
  default_pack_id text,                              -- last-used pack, for UI restore
  tags        text[] not null default '{}',
  notes       jsonb,                                 -- DM-only Tiptap
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table dungeon_maps enable row level security;

create policy "dungeon_maps_select" on dungeon_maps for select using (auth.uid() = user_id);
create policy "dungeon_maps_insert" on dungeon_maps for insert with check (auth.uid() = user_id);
create policy "dungeon_maps_update" on dungeon_maps for update using (auth.uid() = user_id);
create policy "dungeon_maps_delete" on dungeon_maps for delete using (auth.uid() = user_id);

create trigger dungeon_maps_updated_at
  before update on dungeon_maps
  for each row execute procedure update_updated_at();
```

Maps are **user-scoped** (not campaign-scoped) — they are private DM artifacts, reusable across campaigns.

### TypeScript types (`src/types/dungeonMap.types.ts`)

```ts
export type CellKey = `${number},${number}`   // "x,y" — e.g. "12,7" or "-3,5"

// A pack-attributed tile reference used wherever a cell or edge picks artwork.
export interface PackRef {
  pack_id: string
  pack_version: number
  variant: number
  rotation?: number                // degrees about the cell centre; only the object layer uses it
}

// An edge segment (wall, door, grate or sluice) owned by a cell on its N or W side
// (south/east edges are owned by the cell to the north/west — "NW ownership").
export interface EdgeSeg extends PackRef {
  type: 'wall' | 'doorClosed' | 'doorOpen' | 'grate' | 'sluice'
  decal?: number            // a `wallDecal` variant; on type 'wall' only (#1065)
}

// Floor layer: a cell carries an optional floor tile + optional N/W edge walls.
// A cell may have walls without a floor (e.g. exterior side of a room boundary).
export interface FloorCell {
  floor?: PackRef           // the floor tile under foot
  wallN?: EdgeSeg           // segment on this cell's north edge
  wallW?: EdgeSeg           // segment on this cell's west edge
}

// SolidBlock layer: full-cell thick walls (sand-filled battlement, mountain rock).
// One entry = one cell of solid mass. Coexists with edge walls — DM picks the tool.
export type SolidCell = PackRef

// Object layer: chests, statues, braziers, decorative overlays.
export interface ObjectCell extends PackRef {
  category: 'rubble' | 'debris' | 'stairsUp' | 'stairsDown' | string
  side?: string             // for directional object categories
}

export interface AnnotationCell {
  text?: string             // e.g. "Throne Room"
  icon?: string             // e.g. "skull" / "treasure"
  color?: string            // hex
}

export interface DungeonMap {
  id: string
  user_id: string
  name: string
  description: string | null
  layers: {
    floor:       Record<CellKey, FloorCell>
    solidBlock:  Record<CellKey, SolidCell>
    terrain:     Record<CellKey, TerrainCell>        // = PackRef, the pack's `terrainWater` (#1065)
    object:      Record<CellKey, ObjectCell>
    annotation:  Record<CellKey, AnnotationCell>
    dressing:    Record<string, DressingPlacement>   // keyed by placement uuid (#1062)
    area:        Record<CellKey, AreaCell>           // brushed areas, a coverage mask per cell
  }
  metadata: Record<CellKey, CellMetadata>      // entity links (see below)
  default_pack_id: string | null
  tags: string[]
  notes: TiptapDoc | null
  created_at: string
  updated_at: string
}

// One Dressing prop on the map (#1062). Not cell-keyed: a prop spans cells and overlaps others.
export interface DressingPlacement {
  prop_id: string    // library_dressing.id
  x: number          // anchor cell: top-left of the footprint as turned to the nearest quarter
  y: number
  rotation: number   // degrees 0-359, clockwise about that footprint's centre
  z: number          // stacking order, higher on top (jsonb loses key order)
}

export interface CellMetadata {
  // First-class Grimoire entity links — the USP
  trap_id?: string
  feature_id?: string
  encounter_id?: string
  note_id?: string
  npc_spawn_ids?: string[]
  monster_spawn_ids?: string[]
}
```

**The map data keeps `doorClosed` and `doorOpen` (#1065).** That is the drawn state of a door edge and it already feeds publish (`DOOR_EDGE_KIND`); only how it is drawn changed, from two tiles to a doorway plus a swung leaf.

**A layer added later reads as empty on older maps.** `dungeon_maps.layers` has no shape constraint and old rows were not backfilled when `dressing` arrived: a backfill writes `layers`, which bumps every map's `rev` and marks every published site "behind" for a change that draws nothing. Instead every read goes through `withLayerDefaults()` (`useDungeonMaps.ts`'s `readDungeonMap`, and `cloneLayers` in `MapWorkbench.vue`), and the column default carries every key for new maps. A prop's `prop_id` is a text reference inside a document, so `supabase/checks/content_integrity.sql` checks it against `library_dressing`.

### Brushed areas (epic #1073, story 8)

A round brush paints a shape instead of cells. `layers.area` is a `Record<CellKey, AreaCell>`: the cell's floor pack (a `PackRef`) plus a `mask`, 8 x 8 sub-cells per cell. `"full"` means all 64 are covered; otherwise it is 16 lowercase hex chars, a 64-bit number whose bit `i` is sub-cell `(i % 8, floor(i / 8))`, (0,0) the top-left. An empty mask is never stored. Older rows read `area` as empty through `withLayerDefaults()`.

Why a fine mask rather than polygons: erasing is clearing bits, so there is no polygon boolean library to carry, and the outline is still a smooth curve because it is traced from the mask (marching squares) and rounded with two Chaikin passes. `areaOutline()` returns closed loops in cell units, covered side on the left, each segment flagged for whether it carries the wall texture: the stretch where a brush meets plain drawn floor is the drawn map's own wall and is not stroked.

The grid stays underneath. A cell covered at least half (`FLOOR_COVERAGE`) also carries ordinary `floor`, so regions, fog, rules, publish and everything else reading `layers.floor` work unchanged; below half the floor tile is removed (walls kept). Painting over plain floor changes nothing; erasing plain floor turns it into an area cell with the disc cut out, and a disc that covers a plain cell whole removes its floor outright. The cell tools treat a brushed cell as a cell: `eraseCell` (Eraser, Alt-Floor) removes its area entry with its floor and terrain, including a cell under half covered that has no floor at all, and `paintCell` over one drops the mask so the tile is a whole square again. `areaBlockingEdges()` lists the NW-owned edges between floor and non-floor where a brushed cell is involved, for light and sight. The pure geometry lives in `src/cartographer/area.ts`; the drawing in `src/cartographer/drawArea.ts`.

How it draws. A cell with an `area` entry is skipped by `paintGround` as a square; `paintAreaGround` builds one path from the outline loops (nonzero, so a hole runs the other way and stays out), clips to it, and lays each area cell's floor tile as a full square inside the clip, picking the variant by position exactly as plain floor does. Plain floor, sunk edges and solid rock are unchanged. The wall line is `paintAreaWalls`, in the standing pass beside `paintEdges`: every outline segment flagged `stroke` is a slice of the area pack's `wallSegmentH` art, rotated onto the segment, `WALL_BAND_RATIO` of a tile thick and centred on the line, with its source x running on with the accumulated length of the loop (wrapping at the tile width) so the texture is continuous round the curve; neighbouring slices overlap a little so a turn shows no gap. The pack is the one of the cell on the covered side. A pack with no real `wallSegmentH` art gets a plain round-capped stroke in its palette's wall colour. The same ribbon is painted into the shadow layer's raised silhouette, so a curved wall throws the shadow a straight one does. The outline is cached per `layers.area` object (and the `layers.floor` identity it was traced against), because the editor redraws on every pointer move. The baked extent counts `layers.area` keys, since a cell under half covered has no floor entry. Light and sight: `collectOcclusion` adds `areaBlockingEdges()` to its walls, so the live snapshot, the veil, vision and the light masks all stop at a brushed edge; they see the grid edge the area sits on, not the smoothed curve.

The Brush tool (`brush`, `V`) paints it: every pointer move applies `applyDiscs` at the pointer's fractional cell position with the active pack's floor, interpolating so discs sit at most radius / 3 apart, and copying the `area` and `floor` records once per move rather than once per disc; Alt erases (and the cursor circle turns dashed); `[` / `]` shrink and grow the radius by a quarter cell between 0.5 and 6 (default 1.5), also set by the inspector's Brush size slider. One stroke is one undo command, and the stroke snapshot covers `layers.area`.

### Movement / sight blocking — derived, not stored

Whether a token can move from cell A to cell B is **derived** at query time, never stored:

```ts
function blocksMovement(map: DungeonMap, from: CellKey, to: CellKey): boolean {
  // Adjacent cells. Check if a wall/closed-door sits on the edge between them.
  const edge = edgeBetween(from, to)         // returns the canonical owner + which side
  const ownerCell = map.layers.floor[edge.owner]
  const seg = edge.axis === 'horizontal' ? ownerCell?.wallN : ownerCell?.wallW
  if (seg && seg.type !== 'doorOpen') return true

  // Solid blocks block movement into the cell at all.
  if (map.layers.solidBlock[to]) return true
  return false
}
```

`blocks_sight` follows the same shape; only `doorClosed` blocks sight (open doors don't). Auto-tiler does **not** write these into the data — the renderer / future VTT compute them on demand.

### Edge ownership rule (canonical)

To avoid storing the same wall twice:

- A cell owns its **north** and **west** edges (stored as `wallN` / `wallW`).
- The south edge of cell `(x, y)` = the north edge of cell `(x, y+1)` → stored on `(x, y+1).wallN`.
- The east edge of cell `(x, y)` = the west edge of cell `(x+1, y)` → stored on `(x+1, y).wallW`.

The editor exposes "all four edges" as if they were equal; under the hood, write operations resolve to the canonical owner. Read operations follow the same lookup.

### Sparse storage rationale

Cells are a `Record<CellKey, LayerCell>` rather than a dense 2D array because:

1. Infinite canvas — there is no fixed `width × height`.
2. Most maps are not fully painted — sparse is cheaper.
3. Cell coordinates can be negative (origin = (0,0); the user can paint in any direction).

On load, the renderer builds a viewport-bounded dense buffer for fast drawing; storage stays sparse.

### Stale cell handling

A cell whose `pack_id` is no longer available (pack deleted, never loaded) renders a placeholder tile (purple/black checker) and is flagged in the editor's status bar. Never crashes the editor.

---

## Campaign scope (#789)

`dungeon_maps` carries a nullable `campaign_id` with the dual-state semantics `monsters`, `traps` and `puzzles` already use since #597: **NULL means available in every campaign**, set means visible only when that campaign is active. The DM picks per map, via the shared `CampaignScopeField` in the bar's settings popover: the same control `TrapEditor` uses, not a second one. The list filters through `allowedCampaignScoped`, exactly as `useMonsters` and `useTraps` do.

**Existing maps were not backfilled and must stay null.** Every map drawn before this existed was drawn without the choice available, so assigning one would invent an intent its author never expressed.

Three things that are easy to get wrong here, all of which cost something real:

- **The FK is `NO ACTION`, deliberately.** `CASCADE` destroys a map the DM spent an evening drawing as a side effect of deleting the campaign it happened to be scoped to; `SET NULL` silently promotes campaign-exclusive work to universal. So the app asks, and `NO ACTION` is what guarantees it asked — any delete path skipping `delete_campaign_with_homebrew` fails loudly instead of quietly picking one of the two wrong answers.
- **That guarantee only holds while the counting layer knows the same table set as the function.** `campaignHomebrewDisposition.ts` must list `maps`, or a campaign whose only scoped content is maps reports "no homebrew", the picker never appears, and `DangerZoneTab` sends its default — which is `delete`. The FK cannot save that case, because the function *does* delete the rows.
- **The query key is the table name verbatim** (`dungeon_maps`, not `dungeon-maps`). `useDeleteCampaign` invalidates generically over `Object.values(HOMEBREW_TABLES)`, so a hyphenated key invalidates a cache nothing reads and the map list goes stale after any disposition.

**Transfer is a separate flow and deliberately excludes maps.** `TransferOwnershipPanel` hand-picks monsters and traps for its "what moves with the campaign" summary; its copy states that Cartographer maps stay with the outgoing DM. Adding `maps` to `HOMEBREW_TABLES` does not change that, and should not. Note the consequence tracked in #801: a scoped map whose campaign is transferred keeps pointing at a campaign its owner no longer owns.

Cover: `supabase/tests/dungeon_maps_campaign_scope.test.sql`, which is also the repo's first regression test for `20260809000004`'s owner confinement.

## Editor UX (`src/components/cartographer/MapWorkbench.vue` + `CartographerEditorView.vue`)

**The editor is a component, not a route (epic [#884](https://github.com/irongollem/grimoire/issues/884), wave 2).** It was a ~1,490-line view, which meant the only way to draw was to leave wherever you were and come back ("moving back and forth is unnecessary extra steps"). It now splits three ways: `MapWorkbench.vue` is the embeddable editor (bar, rail, canvas, options slip, drawer, pack loading, the site-reference ghost) and reads no route at all; `useMapCanvasEditor.ts` is its interaction and render engine (viewport, pointer, undo/redo, every per-tool paint operation, the render loop): one cohesive canvas engine, deliberately not split further; and `CartographerEditorView.vue` is a thin host holding the route, the `dungeon_maps` row, Save/Cancel/Delete, the Publish modal and the AI-style flow. Behaviour at `/cartographer/:id` is unchanged.

The host pulls state through `defineExpose` getters rather than two-way binding, and the workbench emits only `update:dirty`: painting mutates `layers`/`metadata` on nearly every pointer move, so a continuous emit surface would deep-clone per frame. The host takes a snapshot at the moments it needs one — Save, Cancel, Publish, AI Style, the PNG bake — the same "closures called on demand" shape `useMapExport`/`useMapPublish` already use.

An optional `site` prop (a `MapStackSource`, see world-building.md's map stack) draws that site's **Picture** as a toggleable reference ghost beneath the canvas, in the cell space the two already share through `grid_calibration` — which is how "paint extra rooms onto a book map" works without any data conversion. `/cartographer/:id` passes no `site`. Mounting the workbench inside the Atlas's Build mode is a later story.

**The tool runs in the Atlas too, and the Plan is one of its layers (epic #884, wave 4).** With a `site` prop the workbench shows a **Drawing / Plan** layer selector, and the Atlas's Build mode mounts it as the map area — so a DM shapes a site where they are standing instead of leaving for `/cartographer` and coming back. `?publishTo=` is gone with that round trip; the Layers panel's Review opens the publish plan in place.

- **The Plan rail and options** (`CartographerPlanOptions.vue`, the rail built in `MapWorkbench.vue`, `usePlanPalette.ts`, `usePlanCanvasTools.ts`) writes `location_map_regions` and `location_doors` through the Atlas's own composables: **Space** and **Zone** trace with brush / pen / template, **Door** snaps to a cell edge and derives its endpoints from the regions either side, and **Claim** flood-fills a region of the *Drawing's* floor and makes it a traced space: the one gesture that pays for both layers living in one tool, because it stops the DM re-tracing by hand what they just drew.
- **Build opens on the layer the DM came to use (issue #878, item 3).** A site whose stack already has a Drawing or a Picture (`hasAnyMapLayer`, `mapStack.ts`) starts `MapWorkbench` on Plan; a site with nothing drawn yet starts on Drawing, since there's no image to trace over. Read once at setup, not watched — once the DM switches layers by hand, that choice stands for the rest of the session. The standalone `/cartographer/:id` route (no `site` prop) always starts on Drawing. Before this, Build opened on Drawing unconditionally, which was half of why a DM who traced rooms could not find Pen or Shape at all (the other half was the switcher itself — next bullet).
- **The "Trace with" switcher (Brush/Pen/Shape) is reachable at every width.** It used to be `hidden lg:block`: Pen and the Circle/Octagon/Hex template shapes were real and working, but below Tailwind's `lg` breakpoint (1024px) there was no control to reach them at all. The Door/Claim hint text is in the options slip at every width too, and the plan tools are the rail's icons (with tooltips and accessible names) at every width.
- **A site with no drawing is fully editable**: the Plan is drawn on the tile grid, not on the Drawing's pixels, so `map: null` traces exactly as well. A scan or a blank grid is a first-class site.
- **The Drawing autosaves** (`useSiteDrawingEditor.ts`) 1.5s after an edit, creating the `dungeon_maps` row and linking `source_map_id` on the first stroke. There is no Save button inside Build, because Build has no Save anywhere.
- **Undo covers both layers** (`usePlanUndoStack.ts`): Drawing edits through the existing command stack, Plan edits as a session stack of inverse mutations, Ctrl+Z routed by the active layer. A tool where undo works on one layer and silently not the other is a trap, and that is the real cost of merging the two.
- **Binding stays a panel action.** The tool draws shapes; naming one "the Reliquary" happens in `SiteMapRegionList`, which also makes a room from an unbound shape in one click.
- **The Picture is not a paintable layer** — it is a reference ghost with a visibility toggle. You do not paint a photograph, and its upload/replace/calibrate actions already live in the Layers panel a row above; a second copy inside the tool is what the extraction rule exists to prevent. This narrows the epic's decision-3 table on purpose.
- **The Cartographer's own zone layer is retired.** A zone is a Plan region with `region_role: 'zone'`, authored once. Gone with it: the Zone tool, `ZoneCell`/`layers.zone`, `deriveZones`, the zone rows of the publish plan and its render pass. Production carried one drawing and zero zone paint when this shipped, so nothing needed migrating.
- **One gesture set** (`src/lib/map/gestures/`, decision 6): brush (the Atlas's direction-locked stroke), rectangle, line, fill, pen, template, round brush, eraser: each pure and tested, each with one implementation. Two paint systems for the same motions is what merging them fixed. Two deliberate exceptions are documented in the modules: the Cartographer's template fill is not routed through the Atlas's ring path (their painted cells differ by ~10% for a circle, and behaviour had to stay identical), and the stamp and eraser tools keep their own continuous paint because a stamp's rotation can change mid-stroke and the eraser mixes cell and edge targets.

### Layout: the map is the table, the tools sit on its edge (17 Oct 2026)

The maintainer's words: "When building a map, you want to maximise the amount of map shown at a time, as that's our focus; now things like the tileset, map name etc. take way too much visual screenspace." The old layout spent a 11rem toolbox column and two 14rem inspector columns on controls, and a page header over the lot. The canvas was 566 px wide at 1280x720; it is now 1206 px wide and 646 px tall (1366x826 at 1440x900, from 726x832).

```text
+--------------------------------------------------------------+
| bar (3rem): back, name | Drawing/Plan | tile set | light |     |
|   Spaces | settings | undo redo        save state, Delete Cancel Save |
+----+---------------------------------------------------------+
| r  |  [options slip: tool name + its options]    [drawer]    |
| a  |                                             Spaces /    |
| i  |          Canvas (fills the rest)            Dressing /  |
| l  |                                             Plan lists  |
+----+---------------------------------------------------------+
|                status bar (cursor, zoom, cells)              |
+--------------------------------------------------------------+
```

- **Focus while building.** Editing at `/cartographer/:id?edit=true` and `/cartographer/new` has no page header: `CartographerEditorView` sets `useAppUiStore().editorFocus` while it is editing (and clears it on unmount), `DefaultLayout` reads it and hides `AppSidebar`, `AppTopBar` and `DmBottomNav`, and the workbench fills `h-dvh`. View mode keeps the page header and the 60vh canvas. Atlas Build keeps the app chrome (the Atlas is the page there) and gives the workbench a `max(32rem, 100dvh - 10rem)` box.
- **The bar** (`CartographerBar.vue`, 3rem). Host slots `bar-start` (scoped: `mapName`, `setName`) and `bar-end`; the workbench puts the **Drawing / Plan** switch after `bar-start` itself, because the layer is its state. Between them, what the workbench owns: the **tile set** (the set's name with a swatch of its floor, `CartographerPackSwatch.vue`; the menu lists the sets, with the "N slot(s) missing" note and "future strokes only" inside it), **Light** (Day / Dim / Dark), **Spaces N** (toggles the drawer), **settings** (a popover with the campaign scope, and the Reference toggle when a site's Picture can go underneath), undo and redo, and the host's `saveState` text. The standalone host fills `bar-start` with a back link and the map's name as a line field, `bar-end` with Delete / Cancel / Save; Atlas Build fills `bar-start` with its level picker and shows "Saving…", "Unsaved changes" or "Saved" (it autosaves, so no Save button, and its Done stays in the place pane). A rename marks the map dirty.
- **The rail** (`CartographerToolRail.vue`) sits **beside** the canvas, not over it: 3rem is a small price for a map no tool ever covers, and it keeps the status bar clear. Icon-only `AppButton`s with an accessible name and a tooltip "Name (key)", the active tool marked, clusters separated by a rule. Below `lg` it lies down as a toolbar along the bottom and the slip spans the top. The Plan layer gets the same rail.
- **The options slip** (`CartographerToolOptions.vue`, `CartographerPlanOptions.vue`, framed by `CartographerOptionsSlip.vue`, a `data-slip`) at the canvas's top left: the active tool's name (" · erase" while Alt is held over a tool that has an inverse; on the Plan, "Space · Pen") and its options inline: brush size, wall kind and decals, room shape, object category and rotation, the Label text, the Link pickers, Select's one-line cell summary (expandable), and for every other tool a one-line hint. It replaced the inspector and the tool pill; there is no inspector any more.
- **The drawer** (`CartographerDrawer.vue`): one `data-slip` panel, 18rem wide, over the canvas's right edge, never shrinking the canvas; opens through `railTransition` in `src/lib/motion.ts` (still for reduced motion). Contents: **Spaces on this map** (`CartographerStructurePanel`), **Dressing** (opens with the Dressing tool, goes with it), and on the Plan the region and zone lists, which open with the layer. Below `lg` it is a `MobileSheet`.
- **Popovers render at page level.** The Dressing sources picker (`SourcesPickerPanel`'s popover variant) was `absolute z-50` inside an inspector card, and Vellum gives a card `isolation: isolate`, so the next card painted over it. It, and the bar's menus (`CartographerPopover.vue`), now `Teleport` to the body with `position: fixed` through `useAnchoredPopover`, keeping `data-slip`.

### Toolbox (the rail)

The hotkeys are the `shortcut` values of `TOOLS` in `src/components/cartographer/MapWorkbench.vue`; that array is the source of truth for which tools exist and for the rail's clusters. Tool ids did not change, only labels: "Floor brush" is **Tiles**, "Solid block" is **Rock**, "Annotate" is **Label**, "Link entity" is **Link**, "Room template" is **Room**, "Wrap walls" is **Wrap** ("We now have two tools we call brush").

| Cluster | Tool          | Hotkey | Layer       | Notes                                                  |
| ------- | ------------- | ------ | ----------- | ------------------------------------------------------ |
| Look    | Select        | Esc    | none        | The default tool on open. Click selects a cell for the options slip's read-only summary; drag pans, exactly like Pan: a DM's first tap never paints. |
| Look    | Pan           | RMB    | none        | Right-mouse drag; middle-mouse or space-drag also pans. |
| Floor   | Brush         | `V`    | floor       | Paints round brushed areas (`layers.area`), not cell by cell. |
| Floor   | Tiles         | `B`    | floor       | Paints floor cells with a random variant.              |
| Floor   | Rectangle     | `R`    | floor       | Drag to fill a rect with floor. Shift = wrap walls.    |
| Floor   | Line          | `L`    | floor       | Drag to draw a single-tile-wide line of floor.         |
| Floor   | Room          | `M`    | floor       | Stamps a whole room shape (circle, octagon, hex).      |
| Floor   | Fill          | `F`    | floor       | Flood-fill contiguous floor cells.                     |
| Floor   | Water         | `H`    | terrain     | Paints terrain (the pack's `terrainWater`) with the floor brush's shapes; see "Terrain and curbs". |
| Floor   | Rock          | `S`    | solidBlock  | Full-cell thick walls (battlement, mountain rock).     |
| Walls   | Wall          | `W`    | floor.edges | Edge-hover targeting; the options slip picks Wall, Grate, Sluice or Decal ("Wall kinds and decals"). |
| Walls   | Door          | `D`    | floor.edges | Replaces wall on an edge; toggles open/closed.         |
| Walls   | Wrap          | `X`    | floor.edges | One-shot: walls every floor-region edge facing void.   |
| Things  | Object stamp  | `O`    | object      | Picker for chests, statues, braziers, stairs, rubble, debris, named by the pack ("Stamps"). |
| Things  | Dressing      | `G`    | dressing    | Places library props (#1062); see "Dressing tool" below. |
| Notes   | Label         | `T`    | annotation  | Text labels; also what names a Space.                  |
| Notes   | Link          | `K`    | metadata    | Attach a trap / encounter / feature / note to a cell.  |
| Notes   | Space         | `P`    | structure   | See the next section.                                  |
| Eraser  | Eraser        | `E`    | active      | Removes from the active layer / edge.                  |

#### Dressing tool (#1062)

The pointer logic lives in `useDressingTool.ts`, wired from `useMapCanvasEditor.ts` the way the Space tool's is; the panel is `CartographerDressingPanel.vue`.

- **Turning keeps the grid.** A prop turns about the centre of its footprint as turned to the nearest quarter, with the anchor at that footprint's top-left (`dressingCentre`). The epic's draft said "about the footprint's centre", which leaves a 2x1 table half a cell off the grid after a quarter turn, because its centre sits on a cell edge one way and mid-cell the other. The price is that a free angle turns about its nearest quarter's centre, so a non-square prop turned past 45 degrees steps half a cell to where it will sit at 90; no single centre puts both quarters on the grid. A square prop never moves.
- **Pick, then place.** Picking a prop in the panel arms it, and a translucent ghost of its footprint follows the pointer (the object stamp has none). A click places it with its top-left at the hovered cell, and the new prop is selected, so Q/E or Delete act on it at once. Clicking the armed prop again, or Esc, puts it down; a second Esc returns to Select as before.
- **Select, move, turn, delete.** With nothing armed, a click selects the topmost prop under the pointer (by `z`, through its rotated footprint) and a drag moves it a whole cell at a time. Q/E turn it 90 degrees and `[`/`]` one degree, as the stamp does; turning a prop also sets the brush to that angle, so the next one matches. Delete or Backspace removes it.
- **Erase.** Right-click or Alt+click with the Dressing tool removes the topmost prop under the pointer. The Eraser takes a prop before an object, because props draw above objects.
- Each place, drag, turn and delete is one undo step (the editor's whole-state snapshots already cover the new layer).

#### UX notes for edge-based tools

- **Wall targeting**: when the cursor is within 25% of a cell edge, that edge highlights as a thick coloured strip. Click places a wall on it. Drag along multiple edges to lay a continuous run. `Shift`+click a cell = walls on all 4 of its edges.
- **Door tool**: hovers the same way as the wall brush. Click on a wall edge converts it to `doorClosed`. Click an existing door toggles `doorClosed` ↔ `doorOpen`, which swings the leaf (see Wall Rendering). Right-click removes the door, leaving the wall. The tool did not change with schema 4.
- **Rock vs. Wall**: these are two different tools by design. Wall gives you a thin wall on an edge (a curtain, a partition, a worked-stone room boundary). Rock gives you a thick wall in a cell (a sand-filled battlement, mountain rock, a 5 ft slab of masonry). The DM picks based on the dungeon's mass.
- **Rectangle + Shift**: Shift-dragging the rectangle tool fills the area with floor *and* runs `wrap walls` on the rectangle perimeter — the most common "make a room" gesture.
- **Alt inverts a painting tool**: the same modifier idea the Plan's Door tool already used for Alt+click-to-delete (`usePlanCanvasTools.ts`). Holding Alt while a Drawing tool would paint erases what it paints instead, as one undoable stroke: floor → `eraseCell`, brush → `applyDiscs(..., "erase")`, solid → `eraseSolidAt`, stamp → `eraseObjectAt`, wall → `eraseWallAtCellEdge`, door → `removeDoorAtEdge` (same function RMB already used), rect/line/template → erase the cells the shape covers. Select/Pan/Fill/Wrap/Label/Link/Eraser/Space have no inverse and ignore Alt. RMB/middle/shift still pan exactly as before; Alt is a separate, additive modifier, never a pan trigger. The options slip's title appends " · erase" while Alt is held over an invertible tool; Alt state is tracked at the window level (`altHeld` in `useMapCanvasEditor.ts`) so the slip reacts even with the pointer sitting still, cleared on blur so alt-tabbing away never leaves it stuck.

### Structure tool group (#868, narrowed to Space alone by #884)

This tool doesn't paint pixels: it claims or annotates what the drawing **means**. `src/cartographer/tools.ts` tags it `group: "structure"` in the `Tool` union (the rail's clusters are `TOOLS`' `group` in `MapWorkbench.vue`) so `CartographerToolRail.vue` draws it in the Notes cluster beside Label and Link. A sibling Zone tool shipped alongside it in #868 and was retired by #884 (wave 4): see "The Cartographer's own zone layer is retired" under Editor UX above; zoning is now authored directly as a Plan region in the Atlas, never derived from the Drawing.

| Tool         | Hotkey | Layer     | Behaviour                                                                 |
| ------------ | ------ | --------- | -------------------------------------------------------------------------- |
| Space        | `p`    | (derived) | Click a floor region to select the derived space under the cursor. Doesn't write anything: it drives the Spaces drawer's room-level inspector (name, ways out, linked entities). `s` was already taken by Rock, so Space took `p` instead of the design frame's literal key. |
| Link         | `k`    | `metadata`| Moved into the structure group in #868 (previously grouped with the paint tools): same trap/feature/encounter/note pickers as before, now in the options slip. |

Nothing the Structure tool touches is derived structure itself — the derivation (`deriveStructure`, below) recomputes live from `layers`/`metadata` on every change, so there is no separate structure document to keep in sync.

#### Deriving structure from a drawing (`src/cartographer/structure.ts`, `structure.types.ts`, `cellSignature.ts`)

`deriveStructure(map)` is the one function everything downstream of the Cartographer reads through — the published Atlas never reads a raw `DungeonMap` layer set directly. It returns a `DerivedStructure`: `spaces`, `ways`, `stairs`, `links` (zones were dropped from this return by #884 — see above).

- **Spaces** — a flood fill over open floor cells (a floor tile, not a `solidBlock`), but **not** `floodFill.ts`'s fill: this one is edge-aware. It cuts at *every* edge segment — wall, closed door, **and open door/arch** — because a door has to be able to sit "between two regions" at all. An open arch still cuts the fill and becomes a `kind: "arch"` way out; the two rooms it joins stay two regions exactly as a closed door would. A space's `name` comes from the first annotation text found on any of its cells, in canonical (y-then-x) order — the same scan order the rename UI targets, so renaming a space always edits the cell its name already came from rather than adding a second annotation.
- **Ways** — a `doorClosed`/`doorOpen` edge with open floor and two *different* derived spaces on either side. `doorClosed` → `kind: "door"`, `doorOpen` → `kind: "arch"`. A door edge whose two sides land in the same space (another route already joins them) is internal, not a way out, and is skipped.
- **Stairs** — `stairsUp`/`stairsDown` object-layer cells. A stair's far end is **never guessed**: `spaceKey` is the space containing the cell (or `null` if no space claims it), but there is no attempt to infer which room/level it leads to — that stays `unresolved-stair` in the publish plan until the DM picks a target in the review modal.
- **Links** — every cell whose `CellMetadata` is non-empty, each tagged with the space (if any) containing it.

**Cell signatures** (`cellSignature.ts`) give a space a stable identity across publishes: a 64-bit FNV-1a hash over the sorted, deduplicated cell-key list (`canonicalCells`), prefixed with the cell count. Deliberately not cryptographic — it only has to agree when two derivations cover the same cells and disagree when one cell moves, cheaply enough to recompute on every keystroke for the status bar.

`useCartographerStructure.ts` is the reactive seam: it holds the live `structure` computed, the Structure panel's `spaceRows`/`selectedSpaceInspector` read models, and `changedSinceLastPublish`: a `structureDelta()` between the map's last-loaded/last-saved structure and the live one, driving the status bar's "**N regions changed since last publish**" caution (amber, right-aligned in the status bar, only shown once the map has been published at least once). `useCartographerStructureTools.ts` wires pointer input for the Space tool into that composable. `CartographerStructurePanel.vue` renders the Spaces drawer: the space list (name/provenance/cell count, with a Re-detect button that just clears the selection: the derivation is already live, there's nothing stale to recompute), the selected space's inspector (ways-out summary, linked entities, a lazy-committing rename field), and a "Published to" list (which Atlas sites this map backs, each with its `rev` vs. `map_published_rev` gap: "N behind": since one drawing can back several places, e.g. a reused gatehouse).

`dungeon_maps.rev` (migration `20260908215643_the_publish_remembers_what_it_wrote.sql`) is an integer counter bumped by the `dungeon_maps_bump_rev` trigger (`bump_dungeon_map_rev()`) whenever `layers` or `metadata` change — renaming or retagging a map leaves it alone. `locations.map_published_rev` records which `rev` a site's last publish carried; null means never published. The gap between them is what "N behind" and the status bar caution both read.

### Tool options and the drawers (replacing the inspector)

There is no inspector. What it held now lives in three places:

- **Map-wide, set once** (name, scope, light, tile set): the bar. See "Layout" above.
- **The active tool's options**: the options slip. Brush size (`[` `]` resize), wall kind and decals, the object stamp's category and rotation, the Room shape, the Label text, the Link pickers, and a one-line hint for every tool with nothing to set.
- **Lists that hold a picture's worth of detail**: the drawer. The Dressing panel (#1062): the book icon for Dressing sources, a search over names and tags, the enabled books' props grouped by kind as tiles with their footprint, and, with a placed prop selected, its name, rotation and Delete. The rotation row is `RotationControl.vue`, shared with the object stamp.
- **Select section** (in the slip): with a cell selected, a read-only summary computed in `MapWorkbench.vue` and handed down as plain props (the same "MapWorkbench computes, the options render" shape as `annotationText`/`linkedNoteId`): one line ("Cell 4, 7: floor, 2 edges, 1 link"), and a Details toggle for coordinates, floor (yes/no), rock (yes/no), each present edge with its kind (wall/closed door/open door; N/W read straight off the cell, E/S off the neighbour's W/N per the NW-ownership rule), the object category if any, the label text if any, and linked note/encounter/trap/feature names. With nothing selected: "Click a cell to see what is in it. Drag to move the map."

### Canvas behaviour

- **Pan**: middle-mouse drag, or hold space + drag, or two-finger pan on trackpad.
- **Zoom**: mouse wheel; 25% to 400%.
- **Grid**: drawn procedurally per frame; only lines crossing the viewport are drawn (~50 lines max).
- **Hover preview**: shows the tile that would be placed if clicked (semi-transparent).
- **Stroke** = mousedown → drag → mouseup; recorded as a single undo unit.

### Undo/redo (command pattern)

Every mutation is a `Command` with `apply()` and `revert()`. Commands stacked in two arrays; `Ctrl+Z` / `Ctrl+Shift+Z` walk the stacks. Stroke = compound command (one undo per stroke, not per cell).

### Filter state

Map list filters (search by name, tag, pack) → `useCartographerUiStore`, with `hasActiveFilters` + `resetCartographerFilters()` per the CLAUDE.md rule.

---

## Wall Rendering (no bitmask auto-tiler in M1)

Edge-based walls eliminate the 8-neighbour bitmask problem entirely. A wall is a straight segment of one of two orientations (horizontal or vertical), so there is no "which variant fits this corner?" calculation. The renderer picks a variant from the pack's `wallSegmentH` or `wallSegmentV` slot: by position when the manifest declares the category `continuous` (so a run of wall reads as one texture), otherwise by the stored hash variant, `hash(map_id, edgeKey) % variantCount`. All of it is `drawEdgeSeg` in `drawMap.ts`; an edge seg picks its category from its type and axis (`EDGE_CATEGORY`).

### Doors, grates and sluices

A door is two pieces, not four tiles (#1065 decision 2). The doorway tile (`doorwayH`) is the opening and its frame in the wall band, squashed onto the band like a wall. The leaf (`doorLeaf`) is the door alone, never squashed, drawn over the doorway. A `doorClosed` edge draws the leaf as it sits in the opening; a `doorOpen` edge draws the same tile turned on its hinge by the manifest's `doorLeaf.openDegrees` about `(hingeX, hingeY)`, the canvas rotation being clockwise, which swings an N edge's leaf into the cell south of it. Closed is 0 degrees. A vertical door is the horizontal construction turned a quarter clockwise about the edge tile's centre, as its `doorwayV` art is. The leaf follows the edge's drawn state only: nothing draws door state live from the `door_id` facts in play (#868), because the battle map is the baked image.

A grate (`edgeGrateH/V`) is bars across an opening in a wall, a sluice (`edgeSluiceH/V`) a gate in one; a canal passes through the first and out of the second. Both are drawn in place of the wall segment on their edge, are not squashed, and are not ways in the derived structure.

### Decals

A `decal` on a wall edge is a `wallDecal` variant drawn over the ordinary wall segment: a pipe mouth, a rat hole, a carving. On a vertical wall it is turned like the leaf. Only a plain wall can carry one.

### Where corners come from

Where two perpendicular wall edges meet at a grid intersection, the segments simply abut. Each segment's art is designed to terminate cleanly at the cell boundary, so two meeting walls visually form an L-corner without any special corner asset. T-junctions and crosses work the same way (three or four segments meeting at an intersection).

For higher visual quality, packs may *optionally* ship `wallJoint` art (L corners × 4, T-junctions × 4, cross). The renderer detects the 4-cell intersection state and overlays a joint tile when:

1. The pack has a matching joint variant, AND
2. Two or more wall segments meet at the intersection.

Joint detection at intersection `(x, y)` (the corner between cells `(x-1, y-1)`, `(x, y-1)`, `(x-1, y)`, `(x, y)`):

| Walls present at intersection | Result                   | Asset                   |
| ----------------------------- | ------------------------ | ----------------------- |
| 2 perpendicular               | L-corner                 | `wallJoint/L_<corner>`  |
| 3                             | T-junction               | `wallJoint/T_<missing>` |
| 4                             | Cross                    | `wallJoint/CROSS`       |
| 0, 1, or 2 collinear          | Nothing — segments alone | —                       |

Joints are deferred to M2. M1 ships without them and lets segments abut.

### Cross-pack connection

When two walls of different packs meet at an intersection, each segment renders its own pack's art. The seam is visually distinct (that is desirable — it marks zone transitions). Optional joints, when present, are drawn in the pack of whichever wall arrived at the intersection first (deterministic by edge key).

### SolidBlock layer

Cell-based thick walls (`solidBlock` layer) **do** benefit from the classic 8-neighbour bitmask — a contiguous mass of solid stone should have an outer edge that looks like a wall and an interior that looks like quarried rock. **This is deferred to M2**; M1 renders `solidBlock` cells as flat textured squares (random variant from the pack). When the bitmask renderer lands in M2, packs can optionally ship `solidBlock_*` edge variants; falling back to the flat tile remains valid.

### Terrain and curbs (#1065)

`layers.terrain` is a per-cell ground material (`TerrainCell`, a `PackRef` to the pack's `terrainWater`: water, sludge, lava, a stream). **A terrain cell draws its texture instead of the floor tile in that cell.** It is still open floor for everything else: the space flood fill, publish and the walls all key on floor cells, so painting terrain on a cell with no floor gives that cell a floor too (`paintTerrainAt` with `floorVariant`). Erasing terrain keeps the floor; erasing the cell takes its terrain with it, so water is never left over a floor that is gone.

The **Water tool** (`H`) paints and erases terrain with the Tiles tool's shapes. Alt erases the water and keeps the floor. The options slip's hint says the same.

**Curbs are drawn automatically**, never placed. `curbEdges` finds every edge between a terrain cell and a non-terrain floor cell that has no edge seg (a wall, grate or sluice already marks that edge) and draws `curbH` or `curbV` on the gridline exactly like a wall tile. A `curbPost` is drawn at a corner where a curb meets a wall or turns. The water under a curb is **sunk**: `paintSunkEdges` darkens the terrain along its banks, more along the top and left banks because the light is top-left (`SHADOW.sunkEdge`). A pack with no curb art still draws the sunk edge; a pack with no `terrainWater` draws no water.

### Shadows (#1065)

Shadows are drawn by the app at render time from the silhouettes of what stands up, not painted into the art. The light is top-left, so a shadow falls down and to the right. Everything is a fraction of `tilePx` (`SHADOW` in `drawMap.ts`), so the look holds at any zoom and in the 128 px bake.

| Class | What is in it | Occlusion | Cast |
| --- | --- | --- | --- |
| raised | solid rock, wall edges, joints | yes | long (0.11 across, 0.14 down of a tile) |
| low | curbs and their posts | yes | short, a third of raised |
| standing | `object*` stamps and standing Dressing props | yes | short, a third of raised |
| flat | rubble, debris, hazard and feature glyphs, flat Dressing props | yes | none |

**Occlusion** is the tight dark contact line where a thing meets the floor (no offset, a blur of about 4 px at 128 px per cell). **Cast** is the offset, softer shadow. Flat things get occlusion only because an offset shadow makes a flat thing look lifted off the floor (`isFlatCategory`: `rubble`, `debris`, `hazard*`, `feature*`; a Dressing prop is flat when its `library_dressing.flat` is true). Two stairs break the pattern on purpose: **a stair up** rises to the walls' height, so it is drawn above both shadow passes; **a stair down** is a hollow, drawn before the shadows, whose top and left inner edges darken (`SHADOW.hollow`); the fade is laid only over the stair's own pixels (drawn into a cell canvas and faded `source-atop`), so a stair painted with a ragged natural outline keeps its shape, and without canvases the stair draws without it. Flat things are drawn above the shadow layer, not under it: the layer holds their own occlusion, a blurred copy of their whole silhouette, which drawn over them greys them out instead of rimming them. The cost is that a wall's cast shadow does not fall across a heap of rubble.

The shadow layer is one offscreen canvas, transparent except for the shadows, built by `renderShadowLayer` and laid over the ground. **The live editor caches it** (`cachedShadowLayer` in `renderMap.ts`), keyed on the `layers` object and `layersRevision`, the Dressing catalogue, the runtimes (art arrival), the pack ids, `tilePx` (zoom) and the cell window, **and never on hover**, so moving the mouse never re-blurs the map. `layersRevision` is what the editor bumps on an edit; a scene without one rebuilds every frame. Canvas features are detected: where there is no offscreen canvas (the node tests, an old browser) `makeCanvas` is absent and the map draws without shadows rather than failing.

### Wall kinds and decals (#1065)

The Wall tool (`W`) has a **kind** in the options slip (`WALL_KINDS` in `wallKinds.ts`): **Wall**, **Grate**, **Sluice** and **Decal**.

- Wall, Grate and Sluice paint an edge (`paintWallAtCellEdge` with a `PaintedWallKind`), reading their art from `wallKindCategory` (`wallSegmentH/V`, `edgeGrateH/V`, `edgeSluiceH/V`). A door is never overwritten. A plain wall only restyles a wall of another pack; a grate or sluice replaces a wall of any pack, or the other opening, but not a copy of itself from the same pack.
- Decal does not create an edge. It lists the pack's `wallDecal` variants by their `labels` (or "Decal n" without one, `decalLabel`) and sets the chosen one on an existing wall edge (`setDecalAtEdge`). Alt removes it. On anything that is not a plain wall it does nothing. A pack with no decals says so.

The Select summary names a decorated wall "Wall (decal)", and a grate or sluice by its kind.

### Stamps (#1065)

`stampCategories.ts` owns what the Object stamp tool (`O`) can place: the six `object*` categories plus `stairsUp`, `stairsDown`, `rubble` and `debris` (`STAMP_CATEGORIES`). The stairs and the two litter categories existed in the schema and the renderer, but no UI could place them before schema 4. The picker shows the pack's own name for a stamp (`stampLabel`: the first of `labels[category]`, else the schema's plain name with `object` dropped), so a forest reads "Old tree". **Stairs pick their side from the stamp's rotation** (`stairSide`: 0 degrees north, 90 east, 180 south, 270 west, unturned is north), and draw the art for that side; they never found their art before.

### When rendering recomputes

The renderer maintains a dirty set of `(layer, key)` entries. Recompute fires on:

- Edge wall paint / erase / door toggle / decal / terrain paint.
- Rock paint / erase.
- A pack's runtime changing (a new version published and loaded): everything drawn with that pack.

Floor and object layers do simple random-variant lookup keyed by `hash(map_id, x, y) % variantCount`, unless the manifest declares the category `continuous`, in which case the position picks the variant (see Schema); no recomputation needed.

### Curbs face their water

Curb art is painted with the land along its top and the water along its bottom (`curbH`; `curbV` is it turned a quarter clockwise, so its water is on the left). `curbEdges` records each curb's `waterSide`, and `paintCurbs` turns a curb a half where the water lies the other way, so surf always washes up from the water onto the land and a stone lip always has its wet face to the water. A pack painted the other way round is turned once when it is assembled, not in the renderer.

A pack may declare categories `flush` in its manifest (the `pack.json` sidecar's `flush`): pieces that lie level with the ground, like a line of surf on a beach. Flush curbs and posts are left out of the shadow layer, and water whose curbs are flush is not darkened along its banks (no sunk edge), so the surf and the waves meet. Before this, surf cast a shadow and sat in a dark band (Water, 16 Oct 2026).

### Lights

Things that give light lay a soft additive glow of their colour on what is around them (`paintLights` in `drawLights.ts`; the arithmetic is in `lights.ts`). A glow stops at walls (see below). A light is `TileLight`, in the terms of the 5e rules (the same in 2014 and 2024): `{ color: "#rrggbb", bright: feet, dim: feet, intensity?: 0 < i <= 1 }`, bright light in a radius of `bright` feet and dim light for an additional `dim` feet, each 0..60 and not both 0 (a torch is 20 and 20, a candle 5 and 5, a lamp 15 and 30, a hooded lantern 30 and 30). What the rules give no light for takes the nearest listed source (a brazier or a campfire as a torch), and glowing fungi and crystals are dim light only. Feet become cells at `FEET_PER_CELL` (5); the default intensity is `DEFAULT_LIGHT_INTENSITY` (0.35). Bright and dim are kept apart rather than folded into one radius because the next steps (a map's darkness, darkvision, light-blocking walls) are judged in exactly those terms.

Sources are gathered per frame from three places, each from the window expanded by `MAX_LIGHT_RANGE` cells (120 feet, the longest reach) so a lantern just off screen still lights the edge:

- **Object cells**: the pack manifest's `lights[category][variant]` (schema 4, optional like `labels`, a `null` entry means no light), at the cell centre.
- **Wall decals**: `lights.wallDecal[decal]` of the pack the edge seg names, at the edge's midpoint.
- **Dressing**: `library_dressing.light` (jsonb, null for none) via `DressingProp.light`, at the footprint centre.

Each light is one radial gradient over its bounding square, laid with `globalCompositeOperation = "screen"`: the glow is strongest at the flame and falls fast: 55% of its intensity a quarter of the way to the bright edge, 22% at the bright edge, then fading through the dim ring to nothing (`LIGHT_FALLOFF`); a dim-only light starts at half intensity and fades the whole way. The rules' radii decide the reach, not a flat wash of colour across it: painted at full strength over a torch's 20 feet, three torches turned a whole room green. Making the unlit dark is the darkness layer's job (#1073). Screen mixes and brightens neighbouring glows where they overlap without clipping to flat colour; additive `lighter`, tried first, flooded whole rooms once several lights met. The pass sits after flat objects and flat Dressing and before standing ones, so the glow lands on the floor, the shadows and flat things while standing things and walls draw over it. The glow is masked to what each light can see (#1073 story 6). `renderLightLayer` (`drawLights.ts`) builds one window-sized canvas, like the shadow layer: for each light it samples the light's bounding square at four samples per cell (`lightMask` in `lightMask.ts`, pure), marking a sample visible when `clearLine` from one of the light's `nudgedOrigins` to the sample centre is clear and the sample is inside the reach, writes that as alpha into a small canvas, draws the gradient into a light-sized canvas, `destination-in`s the mask scaled up with smoothing, and lays the result on the layer with `screen`. `drawMapContent` then lays the layer on the map with `screen`. The occluders come from the frame's own layers in map cells (origin 0, `collectOcclusion` in `mapOcclusion.ts`, the one implementation the snapshot and the editor's veil use too), built once per layer rather than per light. The glow lands only on painted ground: a sample counts only where its cell has a floor tile, water or solid rock, or, for a brushed-area cell, where the sub-cell under the sample is covered (an area entry is judged by its mask alone), so light never fills the part of a cell outside a curved wall or beside empty space; the ground test (`groundTest` in `drawLights.ts`) is built with the occluders and held by the same cache, and every light is masked. Without `makeCanvas` (node tests, no OffscreenCanvas) the gradients are drawn straight onto the map, unmasked, the same way shadows degrade. Cost: masking 30 lights on a 60 by 60 map with walls takes about 12 ms at an 8-cell reach and about 56 ms at the longest 24-cell reach. The editor caches at two levels. The masks are in cell units over each light's whole square and do not depend on pan or zoom, so `lightMasksFor` in `renderMap.ts` holds one `LightMaskCache` (the occluders plus a mask per light, keyed on its x, y and reach) per edit revision: a pan recomputes none of them and only re-composites gradients through them, an edit rebuilds them. The composited layer is cached like the shadows (`cachedLayer`, against revision, dressing, loaded packs, zoom and window), so hovering and selecting rebuild nothing either. The bake passes no cache, so it computes every mask once through the same `renderLightLayer`. The colours for library content are read from the art by the art pipeline, and pack authors declare them in the `pack.json` sidecar (`lights`, validated by `parsePackSidecar` to the same rule as the database check).

**Draw order** (`drawMapContent`): floor and terrain, the sunk-edge darkening, `afterGround` (the live grid), stairs down, the shadow layer, curbs and posts, flat objects and flat Dressing, the lights, standing objects, standing Dressing, stairs up, solid rock, edge segs (walls, doorways, leaves, grates, sluices, decals), corner joints, `afterDressing`, then glyphs. Annotations are the caller's.

### Live snapshot (#1073)

Publish writes `locations.map_live` (`MapLive`, `src/types/mapLive.types.ts`) in the same update as `map_layer_url`, `map_layer_calibration` and `source_map_id`, built by `buildMapLive` (`src/cartographer/mapLive.ts`). It is written at publish, beside the Drawing, because players cannot read `dungeon_maps` (owner and campaign DMs only), while `get_player_visible_locations` already hands them the location under the `is_map_shared` gate. The battle map's live layer reads it; later stories (darkness, vision) reuse the same snapshot and canvas.

It holds `groups` (cell sets with the motion overlays that animate them) and `lights` (every source `gatherLightSources` finds over the whole map, in cells with the Drawing's lighting fields). Every cell key is an **image cell**: the Drawing's own cell space, where cell (0,0) is the image's top-left, the space the fog mask and tokens use. A map cell `(mx, my)` is image cell `(mx - originCellX, my - originCellY)`, with the origin from `computeBakedDimensions`, the same numbers stored as `origin_cell_x/y`. A `water` group is a pack's painted `terrain` cells and is kept even with no overlays; an `outer` group is a pack's `solidBlock` cells and exists only when the pack has overlays for it.

A pack declares its motion in the `pack.json` sidecar: `motion: { terrainWater?: MotionOverlay[], solidBlock?: MotionOverlay[] }`. `terrainWater` overlays animate the set's painted water, `solidBlock` overlays the set's outer mass (the Water set's open sea). An overlay is a seamless transparent WebP under `motion/` in the pack folder (`url: "motion/foam.webp"`), tiled every `cells` cells, drifting `drift` cells per second, at base `alpha` with an optional `breathe`. The publish script validates the sidecar, uploads the files beside the tiles (they are not slots) and refuses an overlay whose file is missing. The loaders (`loadLibraryPack`, `loadUserPack`) resolve the urls to absolute where they resolve slot urls, so a snapshot carries absolute urls. A site republished without motion, or never republished, has `map_live` null or empty and the battle map simply shows the baked picture.

**What flickers, pulses and sways.** Three more things move in the live battle map, all subtle on purpose ("just enough to feel alive"); published pictures stay still, and the whole layer is off when the OS asks for reduced motion.

- **Fire flickers, glows pulse.** `TileLight` (pack `lights`, and `library_dressing.light`) may carry `flicker` or `pulse`, a fraction above 0 up to 1 by which the glow brightens above its steady baked level, never both. `flicker` is a fire (several fast incommensurate sines), `pulse` a breathing glow (one slow sine). The baked ground picture always holds the steady glow; the live layer adds an extra radial glow on top (`lightStops` over `lightReachCells`, `screen`) scaled by `fraction * lightBoost(t)`, masked as the baked glow is: to its line of sight (`boostMask` in `liveLayer.ts`, the same `lightMask` over the snapshot's occluders, once per light per snapshot) and to the ground picture's painted part (its alpha, since the snapshot holds no floor). Each snapshot light copies `flicker`/`pulse` only when set and carries a `phase` from its position, so neighbouring fires never move in lockstep.
- **Standing things sway.** A pack declares `sway: { [category]: (SwayMotion | null)[] }` in the sidecar, indexed by variant like `lights` (only the standing object categories may; the publisher refuses a floor, flat category or stairs), and a Dressing row carries `library_dressing.sway` (`{ amount }` degrees up to 8, `{ speed }` rad/s up to 4, null for still). The snapshot's `sprites` list the swaying things in image cells: the url of their art, centre, drawn size, rotation and `sway` with a position `phase`. Standing objects come first (row-major), then Dressing by z, the order the bake stacks them. The live layer's top stratum draws each rotated about its centre by `rotation + swayAngle(t)` (a slow sine plus a smaller faster harmonic that never exceeds `amount`).
- **One predicate, two readers.** `src/cartographer/sway.ts` (`objectSway`, `dressingSway`) decides what sways: a standing object whose manifest sway is set AND whose sideless asset slot has a url (a variant drawn from a stand-in tile cannot be redrawn by the live layer), or a non-flat Dressing prop with a sway and painted art. Both `drawMapContent` (`omitSway`) and `buildMapLive` call it, so the bake leaves out exactly what the snapshot animates and nothing is drawn twice or not at all.

**The third image.** When the snapshot has sprites, Publish bakes a third picture, `{ transparent: true, pass: "standing", omitSway: true }`, uploads it as `<user>/<uuid>-stand-live.webp` and writes `locations.map_layer_stand_live_url` (null when nothing sways; `get_player_visible_locations` returns it under the same `is_map_shared` gate). It exists because the live layer draws the swaying props itself: a still copy in the standing image would show under the moving one. The full `map_layer_stand_url` stays for every other surface (the Atlas map stack, the zoom, a reduced-motion battle map), and only the battle map's stack swaps to the stand-live image, and only while its top layer animates and has loaded every sprite and the stand-live picture itself, so the swap never blanks the walls while it decodes. The top layer draws the props only from that moment on, so they never show twice (see combat-encounters.md). The shadow layer is untouched: a swaying prop keeps its still shadow on the floor. The ground pass and the lights are untouched too.

**Durable urls only.** A snapshot's sprite urls and a pack's motion urls are published into a row players read months later. Library packs and the Dressing library serve their art from public CDN urls that last; a DM's own pack serves its art through one-hour signed urls from a private bucket, which a snapshot cannot keep and players cannot read. So `loadUserPack` drops `motion` and `sway` from the manifest it loads: live motion comes from library packs and library Dressing only.

**Darkness (#1073 story 3).** A map has one ambient light level, `dungeon_maps.darkness` (`DarknessLevel` in `src/types/dungeonMap.types.ts`: `daylight` is bright light everywhere, `dim` is dim light everywhere as at twilight, `dark` is darkness wherever no light reaches). The DM sets it in the editor's bar under **Light** (a `SegmentedControl`, Day / Dim / Dark), in the standalone editor and in a site's Build state alike. It is workbench state like the name: `getDarkness()`, an unsaved change, restored by `resetEdits`, and written by both save paths. The editor previews it: `renderMap` lays the DM's veil over the painted area after the drawn content and before annotations, link dots and selection chrome, through `paintLitVeil` (`src/lib/battlemap/darkness.ts`), the same function the battle map uses. The veil is translucent (dim 0.3, dark 0.6) because the DM must still see the map; it shows what players cannot see. A saved change bumps `dungeon_maps.rev`, so a published site reads as stale until it is published again. The level reaches play only through Publish: `buildMapLive` copies it into `MapLive.darkness`, and the battle map draws its veil from the snapshot. On the battle map a player sees through their own token instead of this veil (`paintPlayerVeil`, see combat-encounters.md); the editor and the DM keep the translucent one.

**Lights carve the veil (#1073 story 4).** The veil's strength follows the light level at each point (`src/lib/battlemap/illumination.ts`, pure), by the 5e rules, the same in 2014 and 2024: bright light clears the veil, a light's dim ring halves it, and beyond the ring the map's ambient level stands (daylight 1, dim 0.5, dark 0). Light does not add up: the brightest source at a point decides, so two overlapping dim rings are still dim, and a dim ambient map is never darker than dim. `illuminationGrid` samples that level at four points per cell over a window of cells (each source visits only the samples inside its own reach, so a 60 by 60 map with 30 lights takes a few milliseconds), each ring edge softened over a third of a cell with a smoothstep so there is no hard pixel edge, and `veilAlpha` turns a level into alpha (`DM_VEIL.dark * (1 - level)`, which is exactly `DM_VEIL.dim` for ambient dim). `paintLitVeil` writes the grid into a small image and draws it scaled with smoothing. The editor takes its sources from `gatherLightSources(layers, runtime, dressing, null)` over the painted extent and caches the grid like the shadow layer, against the edit revision, the dressing catalogue, the loaded packs and the level, so panning, zooming and hovering do not rebuild it. **Walls stop the light and the sight (#1073 story 6).** `src/lib/battlemap/occlusion.ts` (pure) decides what blocks: walls, closed doors, sluices (a solid gate) and solid rock (`layers.solidBlock`); open doors and grates (bars you can see through) do not. `clearLine` walks the cells a segment crosses and is false when it crosses a blocking edge or enters a solid cell other than its start; a segment through a grid corner is blocked if either way round the corner is, so light does not leak where two walls meet. A light reaches a sample only with a clear line from one of its `nudgedOrigins`: a light on a wall fitting's edge (a wall decal's light sits on its edge's midpoint) shines from a hair off each face, so it lights the room it hangs in and not the one behind. The snapshot carries `walls` (edge keys `"x,y:N"` / `"x,y:W"`, image cells, walls and sluices), `doors` (`{ edge, open }`, the drawn state for now, a separate list so play can override `open` later) and `solid` (cell keys), built by `collectOcclusion` in `mapLive.ts`; the editor's preview builds the same lists from the map's own layers (origin 0) inside its illumination cache. Players' sight follows the same rule (see combat-encounters.md). The glow baked into the picture follows the same rule (next paragraph).

---

## Atlas Integration

Cartographer is the authoring side; [Atlas](world-building.md) is where baked maps are published into the campaign.

### Publish to Atlas flow (#868 — replaced "Save to Atlas")

**"It is a diff, not an import."** Save to Atlas baked a picture and overwrote `map_url` — a one-way breadcrumb with no idea whether the Atlas's rooms, doors and placements still matched the drawing. Publish to Atlas (`useMapPublish.ts`, `src/lib/locations/publish.ts`'s `planPublish`, `CartographerPublishModal.vue`) bakes the picture **and** reconciles the structure behind it in the same action: spaces matched by cell signature, ways out matched by edge key, placements matched by cell. Nothing a DM touched by hand is silently overwritten, and nothing is ever deleted.

1. Cartographer Editor → **Publish to Atlas** button, or arriving via `?publishTo=<siteId>` (the Atlas place pane's **Re-publish** / **Preview** buttons, and `SiteLevelReusePanel`'s "draw a level" flow, all open a map with this query param; `useMapPublish` consumes it once, preselects the target site, opens the modal, and strips the param back out of the URL so a later remount doesn't reopen it).
2. The modal (frame 05 of `atlas/Sites & Cartographer.html`) shows a site picker (defaults to the first place this map already publishes to, if any) and, once a site is picked, the **plan**: `PublishPlanPreview.vue` (the picture — a rendering of the plan) and `PublishPlanRows.vue` (the words — every space/way/placement row and what will happen to it), computed live by `planPublish()` off the map's derived structure and the site's current rooms/regions/doors/placements. Zones are not part of this plan (#884 S11) — a zone is now a Plan region authored directly in the Atlas, never derived from the Drawing, so `PublishPlanPreview.vue` deliberately excludes them.
3. **Publish** applies the plan. Nothing here is optimistic — `publish()` in `useMapPublish.ts` runs the writes in this order:
   a. Bake the picture (`bakeMap`, unchanged pipeline — see Export Pipeline below), upload it, write `locations.map_url` + `source_map_id`, then `grid_calibration` computed straight from the bake's padding (`cells_per_image_width`, `origin_cell_x/y`) — so the Atlas's cells are the drawing's cells, not a separately-eyeballed calibration — then `locations.map_published_rev = dungeon_maps.rev` (the DM is publishing whatever rev is on the canvas right now, including unsaved edits — `map()` merges in-progress layers the same way `useMapExport`'s `buildMap` does).
   b. **Spaces** — create a room + bind a fresh region for every unmatched derived space; reshape (`cells`/`cell_signature`) an existing bound region whose signature changed; leave alone (nothing written) a region matched by signature (`skip`) or one the DM hand-edited (`held`, `derived_from === "dm"`); a bound region with no derived space any more is **orphaned** — its `cells`/`cell_signature` are cleared, the room it names is left untouched. Never a delete.
   c. **Ways** — doors/arches created for new edge keys; an existing door matched by `edge_key` (named `source_edge_key` until epic #884) gets its `door_kind` updated **only** if the DM has set nothing else on it (`starts_locked`, `is_secret`, `lock_note`, a `label`) — any of those makes the door `held`, kind included, because a door carrying DM authoring is the DM's to keep. Since #884 a door whose `derived_from` is `'dm'` is held outright, however bare it looks: the DM drew it on the plan themselves. A newly-resolved stair becomes a one-time `door_kind: "stair"` door with no `edge_key` (stairs are never re-matched on a later publish — they carry no edge). Held, skipped and still-unresolved-stair rows write nothing.
   d. **Placements** — a trap/feature link with no matching placement anywhere in the site becomes a new placement; an existing placement whose `source_cell_key` now falls in a different room is **re-anchored** (`location_id` + `source_cell_key` updated to the room that now holds its cell); a placement whose cell falls in no room at all becomes `lost-room` (kept, room-level, cell key preserved — never deleted); encounter/note links write nothing (`kind: "note"` — encounters and notes carry their own location column, so the review lists them without a write).
   Each kind is written in one request for its inserts and one for its updates: the updates go through `update_location_map_regions`, `update_location_doors` and `update_location_placements` (migration `20261008200423`), which apply each row's own columns in one transaction, so a row that is missing or not the DM's refuses the whole set instead of leaving part of it written.
4. Space matching (`matchSpace` in `publish.ts`) tries, **in order**: (1) identical `cell_signature` — a plain re-publish of the same cells; (2) best Jaccard overlap ≥ 0.5 among bound-space candidates — the room moved or resized; (3) an exact name match between the space's annotation and the bound room's name — shape changed enough to lose overlap, but the DM's label survived. First match wins; ties are broken by best overlap score.

### Dressing reaches the battle map by re-publishing (#1062)

The runner draws the baked `map_layer_url`, never `dungeon_maps.layers`, so a prop placed or moved shows in play after the next Publish. Placing one changes `layers`, which bumps `rev`, so the status bar and the Structure panel already say the site is behind. Props are not structure: `deriveStructure` ignores them, so they never create, reshape or block a room.

### Reverse navigation

On a location detail page, if `source_map_id` is set, show an **Edit map in Cartographer** link that opens `/cartographer/:id`.

---

## Export Pipeline

### Bake to WebP (used by Publish to Atlas)

```ts
async function bakeMap(map: DungeonMap, options: BakeOptions): Promise<Blob> {
  const bbox = computeBoundingBox(map)          // min/max x,y of any painted cell
  const padded = expandBBox(bbox, options.paddingCells ?? 3)
  const tileSize = 128
  const width = (padded.maxX - padded.minX + 1) * tileSize
  const height = (padded.maxY - padded.minY + 1) * tileSize

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)

  for (const layer of ['floor', 'wall', 'object'] as const) {
    await drawLayer(ctx, map.layers[layer], padded, tileSize)
  }
  if (options.brandFrame) await drawBrandFrame(ctx, width, height)

  return await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })
}
```

Since #1062 the real bake (`src/cartographer/bake.ts`) also draws the Dressing layer, after objects and before glyphs, from a `DressingCatalog` every caller passes beside `runtimes` (`MapWorkbench`'s `getDressingCatalog()`). Its extent counts every cell a prop's rotated footprint reaches, not just the anchor, through the one `paintedExtent()` that both `computeBakedDimensions` and the raster use. A prop whose art has not loaded bakes as its footprint-shaped placeholder rather than vanishing. The AI styler input is built by the same bake, so Dressing reaches it too.

If the result exceeds 5 MB:

1. Retry once at quality 0.75.
2. If still too large, surface an error: "Map too large to publish. Crop more aggressively or split into sections."

### Brand frame

Bottom-right corner watermark: small "Dungeon Grimoire" wordmark + URL. Off by default; toggle in export options. Reserved area: 240×60 px.

### Download PNG to disk

Separate button. Reuses `bakeMap()` but encodes via `canvas.toBlob('image/png')`. File triggers a browser download — never uploaded.

### VTT-friendly export

Toggle in export options: **strip brand frame**, **no padding** (cells flush to image edge), **fixed 70 px/cell** (Foundry/Roll20 default) or **128 px/cell** (high-res). Same bake function with different option set.

---

## Cell Metadata & Entity Links

Cells can link to first-class Grimoire entities through `DungeonMap.metadata[cellKey]`. This is the data side of Cartographer's USP.

### Link types

| Field               | Target table       | UI affordance                                       |
| ------------------- | ------------------ | --------------------------------------------------- |
| `trap_id`           | `traps`            | Object layer shows a trap icon; click jumps to trap |
| `feature_id`        | `dungeon_features` | Object layer shows a feature icon                   |
| `encounter_id`      | `encounters`       | Cell tinted red; "Trigger encounter on entry"       |
| `note_id`           | `notes`            | Object layer shows a note icon                      |
| `npc_spawn_ids`     | `npcs[]`           | NPC tokens placed in the cell                       |
| `monster_spawn_ids` | `monsters[]`       | Monster tokens placed in the cell                   |

### Link picker UX

**Link** tool → click a cell → the options slip shows all link slots → each slot has an EntityCombobox against the appropriate table → save commits to `map.metadata[cellKey]`.

### Future VTT consumption

When/if the in-app VTT ships, it consumes the same `DungeonMap` data:

- `metadata[cellKey].trap_id` → triggers trap when a token enters.
- `metadata[cellKey].encounter_id` → kicks off Encounter Runner.
- Derived `blocks_movement` / `blocks_sight` → drives fog-of-war + pathfinding.

For now (image-creation focus) these links are informational — they help the DM remember what's where, surface a sidebar list of "this map's contents", and pre-bind a future VTT.

---

## Phased Roadmap

Each milestone is shippable on its own.

### M1 — Skeleton (foundations) ✅ shipped

- DB: `dungeon_maps` table + `locations.source_map_id` column. Single migration via `/new-migration`.
- Tile pack schema + validator in code (`src/cartographer/`).
- Starter Stone Dungeon pack bundled in `public/cartographer/stone-dungeon/v1/`.
- Cartographer view shell: list + editor + canvas.
- Floor brush only, single pack.
- Save/load. Per-cell hash-based variant randomness.
- New tab in Dungeon Craft hub; **NOT** yet in Publishing nav (deferred to M5).

Done = paint floor, save, reload, see the same floor.

### M2 — Walls and primary tools ✅ shipped

- Edge-based wall brush (hover-edge targeting, drag-along-edges, Shift+click for full-cell wrap).
- Door tool (closed/open toggle on edges).
- Solid block tool (`solidBlock` layer; flat textured cells in M2, edge-detection bitmask deferred to M3+).
- Eraser, rectangle tool, line tool, fill bucket.
- Undo/redo stack.
- **Wrap with walls** action.
- Optional `wallJoint` rendering when packs provide it.

Done = a 30×30 dungeon with rooms and corridors can be built in <2 minutes.

### M3 — Multi-pack & storage migration ✅ shipped

- Tile pack loader fetches from Supabase Storage bucket `tile-packs/`.
- IndexedDB cache for loaded packs.
- Second pack: **Sandstone Tomb**.
- Per-brush pack switching; cross-pack auto-tile connection.

Done = paint with two packs on one map. (A planned Update Tileset button for pack-version migration was dropped: maps resolve a pack by id to its published version, see Pack versioning.)

### M4 — Object layer & entity links ✅ shipped

- Object stamps (chests, statues, braziers, etc. — bundled with each pack).
- Annotation layer (text + icons).
- Per-cell rotation.
- Pan/zoom polish; minimap.
- Entity link picker (trap / feature / encounter / note / NPC / monster).
- Cell metadata persistence.
- Sidebar list of "this map's contents" (all linked entities).

Done = maps feel like real prepped dungeons, not just floors and walls.

### M5 — Export & Atlas integration ✅ shipped

- `bakeMap()` pipeline.
- WebP export with size cap + quality retry.
- Save to Atlas flow (location picker, `source_map_id` link, re-export prompt). **Superseded by Publish to Atlas — see M9 and the "Atlas Integration" section above.** `bakeMap()` and `source_map_id` survive; the picker-and-overwrite flow around them does not.
- **Edit in Cartographer** link from location detail.
- VTT-friendly export options.
- "Download PNG to disk" client-side button.
- Cartographer added to Publishing Tools nav group.

Done = maps leave the app; Atlas locations carry maps that round-trip.

### M6 — Curves & advanced brushes ✅ shipped

> **Source:** GitHub issue #383

Adds organic and curved shapes beyond the rectilinear M1–M5 toolkit. Pack schema bumped to **v2** with an optional `wallRoundJoint` category; rounded corners are auto-detected at L-corners and fall back to the standard `wallJoint` when round variants aren't present.

#### Tools (as built)

| Tool | Hotkey | Behaviour |
| --- | --- | --- |
| Room | `m` | Click center, drag to size. Three shapes: **Circle**, **Octagon**, **Hex**. Fills floor + auto-wraps walls around the perimeter. |
| Brush | `v` | Drag to paint a round brushed area (see Brushed areas). Replaced the noise-driven cave brush. |
| Stamp rotation | Q/E + `[`/`]` | Existing 90° rotation, now joined by `[` / `]` for ±1° fine rotation. `PackRef.rotation` widened from a literal union to arbitrary degrees. |

#### Schema v2 — `wallRoundJoint`

Added to `TILE_PACK_SCHEMA.categories` as an **optional directional** category with sides `['L_NE', 'L_SE', 'L_SW', 'L_NW']`. When a pack ships these tiles:

1. The renderer detects L-corners via the existing `classifyJoint()` function.
2. If the pack has a `wallRoundJoint` variant for that L-corner side, the tile is drawn at full `tilePx × tilePx` size centered on the grid intersection.
3. Otherwise the renderer falls through to the standard `wallJoint` (or procedural square) path.

The placeholder tile renders a quarter-circle arc carved into the wall mass, producing a recognisable smooth corner even before real WebP art lands.

#### Geometry — `src/cartographer/geometry.ts`

Pure functions, fully unit-tested:

- `cellsInCircle(cx, cy, r)` — Euclidean distance fill.
- `cellsInOctagon(cx, cy, r)` — bounding square with diagonal corners clipped at ~30% of r.
- `cellsInHex(cx, cy, r)` — pointy-top hex on a square grid; row width narrows by 1 every 2 rows from the equator.
- `cellsForTemplate(cx, cy, r, shape)` — dispatcher.

#### Files added/modified in M6

- `src/cartographer/geometry.ts`: a pure-functions module (room shapes; the noise cave brush it once held was replaced by the round Brush).
- `src/cartographer/geometry.test.ts` — 13 unit tests.
- `src/cartographer/packSchema.ts` — `TILE_PACK_SCHEMA.version` bumped to 2; `wallRoundJoint` category added.
- `src/cartographer/placeholderTile.ts` — rounded-corner placeholder renderer (`wallRoundJoint` branch + palette default).
- `src/types/dungeonMap.types.ts` — `PackRef.rotation` widened from `0 | 90 | 180 | 270` to `number`.
- `src/lib/icons.ts` — `IconRoomTemplate` (Hexagon) + `IconCave` (Cloud).
- `public/cartographer/stone-dungeon/v1/manifest.json` — `schema_version` bumped to 2; `wallRoundJoint` slots declared (use placeholder art until WebP lands).
- `src/views/cartographer/CartographerEditorView.vue` — two new tools wired into TOOLS, pointer handlers, inspector panels; round-corner rendering branch in `render()`; fine-rotation `[` / `]` hotkeys.

### Schema v4: a set builds a whole map ([#1065](https://github.com/irongollem/grimoire/issues/1065))

The library repaint (#891) delivers each set as sprite sheets cut into tiles, and a set is meant to build a whole map from itself alone: its own water, crossings and scatter. Schema 4 is what lets the Cartographer draw that. It added the optional categories `curbH/V`, `curbPost`, `terrainWater`, `edgeGrateH/V`, `edgeSluiceH/V` and `wallDecal`, raised `floor` to 64 variants, and gave manifests `continuous`, `labels` and `doorLeaf`. Maps gained `layers.terrain`, the edge types `grate` and `sluice`, and `EdgeSeg.decal`.

**It is the first non-additive bump.** `doorClosedH/V` and `doorOpenH/V` are gone, replaced by `doorwayH/V` and `doorLeaf`, with no alias and no upgrade shim (CLAUDE.md rule 1). A schema 3 manifest therefore loads with its four door slots as extras and draws placeholder doors until the pack is repainted; the required set changed with it (19 slots, 16 renders). Production had no custom user packs and 8 maps, so the migration is that every library pack is repainted at schema 4 (#891) and its new version published in Admin; maps follow at once, because a map resolves a pack by id to its published version (see Pack versioning). Placeholder doors are the visible symptom of a pack whose published version is still older than schema 4.

**This ends the "older packs are silent" assumption.** The Schema v3 note below is true of that bump: it added only optional categories, so an older pack was still complete and warning would have been noise. `validatePack` still warns only when a pack is *newer* than the runtime, but a silent older pack is no longer a compatible one. Its required set can be missing the new required categories, which the required-category check reports as missing slots. The warning rule has not changed; what changed is that "older is fine" stopped being a guarantee, so do not infer it from the silence.

**Custom uploads.** `register_upload` in the tile-pack edge function demanded `schema_version === 2` until #1065, which means no custom pack could have been uploaded since schema 3. It now compares against `TILE_PACK_SCHEMA.version`, never a literal.

### Schema v3 — a hazard says how it looks ([#804](https://github.com/irongollem/grimoire/issues/804))

23 new **optional** categories: eleven `hazard*` plus `hazardGeneric`, ten
`feature*` plus `featureGeneric`. Optional throughout, so every v2 pack stays
valid and simply falls back.

**A trap does not point at a pack asset.** `traps.hazard_glyph` and
`dungeon_features.feature_glyph` say what the thing *is* — pit, pressure plate,
falling block — and the renderer decides how to draw that under whichever pack
is loaded, the same separation `location_type` → colour uses. Pointing a content
row at a pack category would make the trap undrawable the moment a DM loads a
pack lacking that art. Both columns are `text` + CHECK rather than a Postgres
enum, because the list grows as packs gain art and `alter type … add value`
cannot run in a transaction block alongside other statements.

**The glyph resolves live**, never persisted onto the map: editing a trap's
glyph updates every map it appears on. Same rule as the colour ramp.

**The two `*Generic` categories are load-bearing.** A null glyph is a legitimate
state — most content has no honest match in a deliberately short list — and must
still draw something rather than leaving an empty cell.

**The placeholder matters more than the art here.** Most packs will have no
hazard tiles for a long time, so the procedural placeholder is what a DM
actually sees, and a pit must be distinguishable from a boulder *as a
placeholder*. `hazardPlaceholders.ts` and `featurePlaceholders.ts` give each
glyph its own silhouette, and their tests assert the drawing trace is unique
across categories even under an identical colour — shape-only distinctness,
which is the property that was asked for.

**The version warning changed with this bump.** `validatePack` now warns only
when a pack is *newer* than the runtime. A pack older than the runtime is
silent: up to this bump every change had added only optional categories, and
the required-category check already catches a genuinely incomplete pack.
Without this, v3 would have made every existing v2 pack start warning, which
trains a reader to ignore warnings. Schema 4 removed the premise that older is
always compatible (see Schema v4), though not the rule.

**The link tool reaches traps and features now.** `CellMetadata` has carried
`trap_id` and `feature_id` since the Cartographer shipped, but the inspector
only ever wired `note_id` and `encounter_id` — so the glyph renderer had no way
to be reached by clicking. Both pickers now exist beside the other two.

**Puzzles need no third path.** `puzzle_rooms` carries `location_id` and
`dungeon_feature_id`: a puzzle on a feature draws as that feature's glyph, and
one on a location is the room itself, which has no cell to mark.

#### Open items

- Real bundled WebP art for `wallRoundJoint` on Stone Dungeon and other packs — existing bundled manifests still fall back to the placeholder. M7 now provides the production generation and QA loop; regenerating the fundamental bundled catalogue is a separate content-production pass after the customer workflow is proven.
- Other bundled packs still ship `schema_version: 1` and lack `wallRoundJoint` slots; corners on those packs render as before (sharp wallJoint). Their door slots are the removed schema 3 names, so they draw placeholder doors until repainted at schema 4 (#891).

### M7 — Community / custom packs (PRO) — ✅ shipped

> **Source:** GitHub issue #384. Implemented after #772 replaced the unreliable one-pass assumptions with a tested generation-plan, normalization, retry, and QA foundation.

- User-uploaded packs (private bucket, validated against schema).
- Pack sharing within a campaign (DM uploads → campaign members see it).
- AI pack generator (PRO, expensive): given a theme name + description, iterates schema slots and generates missing assets.
- Marketplace TBD.

Done = users own their aesthetic.

#### As-built upload and sharing

- `/cartographer/packs` accepts either a zip or a selected folder.
- The browser requires `manifest.json`, the current schema version (it demanded 2 until #1065, so no custom pack could be registered after schema 3), complete required slots, canonical WebP-only assets, and exact 128×128 decoded dimensions before any upload begins. Missing slots are displayed with `formatMissingForDisplay()`.
- The server re-runs authoritative manifest validation and Pro enforcement before registering a pack. Storage writes remain owner-prefixed and RLS-protected.
- `user_tile_packs` is the registry. `campaign_tile_packs` shares a pack read-only with campaign members; only the owning DM can toggle sharing.
- The bucket is private. Ownership/campaign membership is checked before signed URLs are issued. A non-Pro member can consume a shared pack but cannot upload, generate, or share one.
- Owners can delete packs after cancelling active work; deletion recursively purges raw candidates, normalized assets, manifests, shares, and durable run records, including after a Pro downgrade.
- Custom `pack_id`s are globally namespaced (`custom-<slug>-<owner-prefix>`) because map cells store `pack_id + pack_version`, not an owner id. This preserves the existing map and tile-pack schemas.

#### As-built production generator

The old M7 assumptions—32 hard-coded outputs, prompts that ask the model for final 128×128 files, and a single blind batch—are obsolete. Production consumes the #772 `GenerationPlan` directly:

1. create the current draft manifest and schema-derived required jobs;
2. generate `floor:0`, `wallSegmentH:0`, and `solidBlock:0` as production candidates and pause for visual approval;
3. after approval, fan out the remaining jobs one at a time, reusing accepted proof images as style references;
4. call `gpt-image-2` at low quality and 1024×1024, requesting transparent output for footprint-constrained slots;
5. deterministically strip boundary-connected white, impose edge/door/rounded-corner alpha geometry, resize, and encode an exact 128×128 WebP in the browser;
6. retain raw and normalized assets in private Storage, update attempt provenance, and re-run `validatePack()` before marking the pack ready;
7. load ready packs into the ordinary Cartographer picker through signed URLs.

Runs and per-slot jobs are durable database rows. Reloading the page resumes from the next pending slot. Failed slots retry independently. Rejecting a style proof removes its normalized manifest slot and regenerates only that candidate. Cancellation marks pending work cancelled and prevents another provider call. An in-flight call is charged only if its result completed and was retained; failed or unretained calls release their credit reservation. BYOK remains Pro-only and records zero-credit provider usage.

**Pricing: 12 credits per tile, covering up to four attempts** (one plus three retries) — `tile_pack_generation` in `ai_generation_credit_costs`, capped by `src/cartographer/generationBudget.ts` and enforced in `tile-pack-generator` at both `generate` and the two retry actions. A 20-slot required pack is 240 credits regardless of how many retries are used.

Retries are inside the price rather than metered because a DM cannot judge a tile until they see it, and charging for that judgement makes them keep work they do not want. The cap is what makes that affordable: worst case is four calls per slot, and 12 credits clears that on the thinnest credit pack we sell (+99%, the binding case). Migration `20260826213049` carries the derivation.

**Style references are sent at 256×256, and the price depends on it.** Production `gpt-image-2` rows measure ~1500 image-input tokens per 1024×1024 reference at $8/1M, so the three references attached to every pack-phase call cost ~$0.030 — five times the 196-token tile they help produce, and more than the whole price covers. At 256px they are ~$0.002 (`20260826215832`); the reduction is built in the browser during proof normalization, because the edge runtime has no image library and every edge dependency resolves over the network at deploy time. Raising that resolution multiplies input cost by 16 and the price stops covering its own retries.

Cost is measured rather than assumed from here: every generation records model, quality, size and all three token counts, **retries included** — a free retry writes a delta-0 ledger row via `recordFreeGeneration` rather than nothing, which `recordGeneration` would have done at cost 0. `ai_generation_costs` prices each attempt and `get_credit_calibration_hints` reads it back at 20 samples.

The user-facing promise remains **complete, validated, and coherently generated with bounded refinement and final review**, not mathematically perfect seams from a single pass.

### M8 — AI Map Styler ✅ shipped

> **Source:** GitHub issue #386

A credit-gated "✦ AI Style" button in the view-mode export bar. The DM bakes a clean tile map and passes it through an img2img pipeline (`/v1/images/edits`, `gpt-image-1`) to apply a cohesive artistic style without touching the underlying cell data.

**Gating:** credit-charged (not PRO-gated — credits are already paid for). BYOK campaigns skip the credit charge.

#### UX flow (as built)

1. View mode header → **✦ AI Style** button.
2. **Style Picker** modal opens:
   - 6 preset swatches (icon + label + description):
     - `playable` — Modern illustrated, warm lighting, fully readable (default)
     - `explorer` — Hand-drawn parchment field sketch, cartographic imperfections
     - `isometric` — 3D axonometric cutaway, may reinterpret layout spatially
     - `tactical` — VTT-ready battle grid, bold zone outlines
     - `tome` — Medieval illuminated manuscript, gilded borders
     - `woodcut` — Bold 15th century woodcut, cross-hatching
   - Optional freeform suffix textarea (max 300 chars)
3. **Generate** → spinner inline in modal while edge function runs.
4. **Result preview** modal with four actions:
   - **Save to Atlas** — inline location combobox + upload to `locationImages` bucket. This is deliberately still the old, simpler shape (bake → upload → overwrite `map_url`, `source_map_id` untouched) and was **not** folded into #868's Publish to Atlas review: a styled image is a picture with nothing behind it to reconcile — no derived structure, no rooms/doors/placements — so there is no plan to show. See `useMapExport.ts`'s header comment. Atlas Build's own entry point (below) replaces the combobox with a fixed target and a different, atomic save — the free-pick flow here is otherwise unchanged.
   - **↓ Download** — client-side WebP download
   - **Retry** — re-runs with same settings
   - **Back** — returns to Style Picker

All outputs include a `dungeongrimoire.com` watermark via a fixed prompt suffix.

**Neither modal dismisses on a backdrop click**, and Escape on the result asks
first. The styled map is a blob URL held in `useMapExport` and nothing reopens
that panel — only a fresh generation sets `showResult` — so closing it is the
end of a paid render, and it was never uploaded anywhere to recover it from. A
stray click beside the panel used to do that silently. The rule is general (see
`AppModal`'s `backdropDismiss` docstring) and pinned by
`src/components/common/overlays/appModalPaidBackdrop.test.ts`, which fails if any modal
that prices, shows or runs a generation ships without the prop.

#### Atlas Build's second entry point (site map workbench)

The Layers panel's Drawing row (`MapLayersPanel.vue`, `AtlasSiteMapMode.vue`) offers **Style with AI** whenever a site has a Drawing — the same `CartographerAiStyleModal`, opened with the save target fixed to the site being edited rather than picked. Two things differ from the standalone flow above, both driven by an optional `site` option on `useMapExport`:

- **Input.** Both entry points fit their render to the campaign's resolved provider before sending — `fitStyleInputCanvas` (`src/cartographer/bake.ts`), given a `provider: "openai" | "gemini"` the client resolves the way `style-map` will (`useCampaignProviders().imageProvider`, which runs the server's own `chooseImageProvider` from `_shared/providerChoice.ts`: the DM's Quick/Detailed pick, moved to their own key and then to an offered provider when the admin has switched the pick off). Until provider_config loads it is null, the price is null too (the modal's `requireCredits` refuses it), and `onGenerateStyle` will not bake: an input fitted to a guessed provider is one `style-map` would answer with a 400. **"openai"** is flexible: the styler renders on its own model setting, `provider_config.map_style_model` (Admin → Providers → Map styler model; `gpt-image-2.5-sunburst` in production, because flare treated the input as a loose sketch; empty falls back to `image_model`), and every `gpt-image-2.5-*` model accepts any size that's a multiple of 16 per edge, an aspect ratio between 1:3 and 3:1, and a total of 655,360–8,294,400 px — `padToStyleAspect` pads into that window and `chooseStyleImageSize` spends the full 2560×1440 pixel budget at the map's own clamped aspect (sites are increasingly played fullscreen on a TV built into the table, so resolution is worth spending in full; cost stays flat via the credit charge regardless). **"gemini"** accepts only ten fixed aspect ratios instead (`@edge-shared/geminiAspect.ts`'s `GEMINI_ASPECT_RATIOS`), so its input pads to the *exact* nearest one (`nearestGeminiAspect`) rather than clamping into a range, then is still sized by the same pixel budget. The client always treats a plain `"openai"` campaign as flexible since it can't see which model the admin actually configured; `style-map` re-validates by the resolved *model* (only `gpt-image-2.5-*` accepts a flexible size), so an admin who points plain "openai" at an older model gets a clear 400 before any charge rather than a mismatched request reaching the provider. In Build, `bakeAiStyleInput` (`src/cartographer/aiStyleInput.ts`) composites what the DM actually sees before fitting: the site's Picture underneath, placed by `placePicture` at the position `MapStackImage.vue` already draws it, with a *transparent* live bake of the Drawing (`bakeMap` with `transparent: true`) on top. The Plan and the runtime-only layers (tokens, fog) never go into this image. Falls back to `bakeMapForAI`'s plain Drawing-only bake (also fitted) when there is no Picture yet, or it has no calibration to place it by. `liveDrawingCalibration()` computes the calibration the Drawing's *current* bake would carry if published right now, so the Picture is placed correctly mid-edit and its `origin_cell_x/y` survive into the fitted calibration below. `style-map/index.ts` derives the size it requests from the uploaded image's own PNG header (`_shared/imageSize.ts`'s `readPngDimensions`), never a client field, and re-validates before the rate limit and credit reservation: `isValidGeminiAspectRatio` for Gemini, a `gpt-image-2.5-*` model check (`_shared/openaiImageModel.ts`'s `isFlexibleOpenAiModel`) followed by `isValidStyleImageSize` for OpenAI. Gemini's actual output resolution stays the admin's `imageSize` quality knob regardless of what was sent.
- **Cost and BYOK.** `styleCost` and `styleByok` used to assume OpenAI unconditionally (`mapImageMultiplierFor("openai")`, `!!decryptedOpenAiKey`) — wrong the moment a campaign's `image_provider` was actually Gemini, whose multiplier is 0.5 in production: the DM would see OpenAI's price and a BYOK campaign with only a Gemini key would show as not-BYOK. Both now read the same `imageProviderKey` the sizing above resolves.
- **Output.** Saving calls `useSaveStyledSitePicture` (`useLocations.ts`) instead of `useUpdateLocationPicture` — one atomic `locations` update: `map_url` = the styled render, `grid_calibration` = a best-guess derived from the padding geometry (below), and `map_layer_url`, `map_layer_calibration`, `source_map_id` and `map_published_rev` all set to `null` in the same write. This is the "bubbles down" the site-workbench epic (#884, decision 1) describes: the render replaces the Picture, and the Drawing that used to sit on top of it is *unlinked*, not deleted — the `dungeon_maps` row survives untouched as an ordinary, standalone map in the Cartographer, so the DM can reopen it (or start a fresh one), draw corrections over the new Picture, and republish later, which puts tiles back on top. `map_published_rev` is cleared alongside `source_map_id` since a rev number for a Drawing the location no longer points at can only read as stale.

**`grid_calibration` is derived, not skipped, and fitting to a known shape per provider is what makes that safe.** Whichever pad function applies (`padToStyleAspect` for OpenAI, or `padToAspect` given `nearestGeminiAspect`'s exact ratio for Gemini), the render is padded, never cropped, at the *same* pixel scale — no rescale, only a border on whichever axis is short — then `chooseStyleImageSize` decides the actual send resolution for either. The pad step's geometry carries `cellsPerImageWidth` (grows by exactly the ratio the padding step grew the canvas by — a later resize to the send resolution can't change this, since it's a ratio a uniform-per-axis resize leaves unchanged) and `originXPct`/`originYPct` (where the un-padded content used to start). Since `style-map` derives the size it requests from this same sent image's own header — and for Gemini, that header's aspect is already exactly one of the ten ratios the model can render, so its own re-bucketing (`sizeToAspect`) picks the identical bucket back — the request always matches what was sent, so the geometry computed *before* sending is exactly as valid against whatever comes back, with nothing to measure to calibrate from. `styledPictureCalibration()` (`aiStyleInput.ts`) builds the calibration from that geometry plus `liveDrawingCalibration`'s `origin_cell_x/y` (padding shifts *where* image cell (0,0) sits, never *which map cell* it is), and a `grid_opacity` of `DEFAULT_GRID_OPACITY`. This is a first guess, not a guarantee: the model can still shrink or grow the grid a little in its own render — `useMapExport.ts`'s `warnIfStyleResultSizeDrifted` decodes the actual returned image and logs a console warning if its dimensions differ from the request by more than a couple of pixels, purely as a debugging signal. The fix either way is "Calibrate stays the safety net" below.

**Calibrate stays the safety net, and reopens seeded from the guess.** `MapLayersPanel.vue`'s Picture row shows its "Calibrate"/"Re-calibrate" button unconditionally whenever `stack.picture` exists (`:label="stack.picture.calibration ? 'Re-calibrate' : 'Calibrate'"`), never disabled or hidden by *how* the calibration got there — a flattened Picture reads as "Calibrated N cells wide" exactly like a DM-measured scan. `GridCalibrationDialog.vue`'s `onImageLoad` seeds its two drag handles from `existing` (whatever calibration is already on the location) rather than the dialog's own hardcoded default, so the DM's very first drag starts from the AI's guess and corrects it, rather than starting over from nothing.

**Recalibrating moves the grid over the image, never the Plan under it.** `location_map_regions.cells` (`useLocationMapRegions.ts`'s `useUpdateLocationMapRegion`, and its create sibling) is a jsonb array of abstract `CellKey` integers with no `grid_calibration` reference anywhere in that file — a region's cells never change when a calibration does. What changes is `mapStack.ts`'s `frameCalibration` (`primary.calibration`, and `primary` is the Picture once the Drawing is unlinked), which is what `cellRectInImageFractions` (`gridCalibration.ts`) reads to decide *where on the image* a given, unchanged cell key draws — so Calibrate genuinely repositions the grid over the picture, and every trace/door/placement keyed by cell number stays exactly where it was. `useUpdateLocationGridCalibration` (`useLocations.ts`) touches only the `locations.grid_calibration` column — no region, door or `dungeon_maps` row is written by a calibration save, so a correction drawing in progress is untouched by it too.

**The next "Start drawing" lines up with the calibrated Picture, verified by reading the code rather than assumed.** `useOpenSiteDrawing.ts` creates a brand-new, empty `dungeon_maps` row and points `source_map_id` at it — nothing carries over from the unlinked one. `MapWorkbench.vue`'s reference-ghost layer (`buildReferenceImage`, its own "Reference layer" section) draws the site's Picture beneath the canvas keyed *only* on `site.grid_calibration` and the Picture's own natural size — never on `source_map_id`, `map_layer_url/calibration`, or anything about a specific prior Drawing. So the calibration this save just wrote already lines up any Drawing linked to the site afterward — fresh or not — as an aligned reference underneath, and corrections drawn there land in the same absolute cell space the styled render occupied. The loop (style, draw corrections aligned to the ghost, style again, Calibrate if it drifted) is usable immediately; Calibrate is a correction available at any point in it, not a required step before it starts.

**A styled Picture can still end up invisible under its own Drawing, in the ordinary (not-yet-flattened) stack — reported rather than changed.** `buildMapStack()` always picks `primary = drawing ?? picture` (`mapStack.ts`), and `MapStackImage.vue`'s `showsUnderlyingPicture` only lets the Picture show through where the *primary* Drawing is transparent. The Drawing's transparent bake (`{ transparent: true }`) only skips the initial opaque ground fill in `renderToCanvas` — every painted floor, wall, solid-block, object and annotation tile still draws its own opaque pixels regardless of that flag. So on a site whose Drawing already covers most of its extent, a styled Picture saved *without* going through the flatten above (there is no such path left in this codebase, but the display mechanics are the same fact this section is recording) would only show in the bake's padding margin and any unpainted interior cells — everywhere there is real floor/wall/object art, the Drawing keeps covering it. This is exactly why the flatten unlinks the Drawing rather than leaving both layers in place: without it, "Style with AI" would appear to do nothing.

**Confirmation before generating, not after.** `CartographerAiStyleModal`'s Generate button asks a plain-language question first, only when `fixedTargetLabel` is set: *"The styled map replaces this site's picture. Your tile drawing is set aside, it stays in the Cartographer, so you can draw fixes on top and style again. Check that the grid still lines up; the AI can drift a little, and Calibrate fixes it."* This runs before credits are spent, not as a surprise on the later Save click.

#### Prompt composition

```ts
// Edge function builds: name + description + presetPrompt + userSuffix + watermark
[mapName, mapDescription, presetPrompt, suffix, WATERMARK_SUFFIX].filter(Boolean).join(", ")
```

`DungeonMap` has no `theme` field — `name` + `description` are used instead.

#### Files (as built)

- `src/cartographer/stylePresets.ts` — `StylePreset` interface + `CARTOGRAPHER_STYLE_PRESETS` array + `WATERMARK_SUFFIX`
- `src/cartographer/bake.ts` — `fitStyleInputCanvas()`/`bakeMapForAI()` take a `provider: "openai" | "gemini"` (default `"openai"`) that picks which pad function applies, returning `{ blob, geometry, size }`; `padToAspect()` (general), `padToStyleAspect()` (clamped to OpenAI's 1:3..3:1) and `chooseStyleImageSize()` (the 2560×1440 budget, rounded down to multiples of 16) are the independently-tested pure pieces both this file and `aiStyleInput.ts` build on
- `src/cartographer/aiStyleInput.ts` — `liveDrawingCalibration()` (the Drawing's would-be publish calibration, pure), `bakeAiStyleInput()` (Atlas Build's Picture+Drawing composite, fitted, or the plain fallback), `styledPictureCalibration()` (pure: fitting geometry + `liveDrawingCalibration`'s cell coordinates → a `GridCalibration`)
- `supabase/functions/_shared/imageSize.ts` — `readPngDimensions()` (reads width/height straight out of a PNG's IHDR chunk) and `isValidStyleImageSize()` (flexible OpenAI's multiple-of-16/aspect/edge/total-pixel rules), both pure and tested
- `supabase/functions/_shared/geminiAspect.ts` — `GEMINI_ASPECT_RATIOS`, `nearestGeminiAspect()` and `isValidGeminiAspectRatio()`, genuinely shared (not duplicated) between the edge function and the client via the `@edge-shared` alias — the same pattern `provenance/mark.ts` already uses across that boundary — so both sides agree on Gemini's buckets by construction rather than by a mirror test
- `supabase/functions/_shared/openaiImageModel.ts` — `isFlexibleOpenAiModel()` (a `gpt-image-2.5-*` prefix check), server-only: the client always sends a flexible-fitted image for "openai" regardless, since it can't see which model the admin has actually configured
- `supabase/functions/_shared/imageGen.ts` — `sizeToAspect()` (exported for its own tests) now delegates to `geminiAspect.ts`'s nearest-match instead of three crude thresholds; `ImageProviderKey`/`resolveImageProvider()` are `"openai" | "gemini"` only — the `"openai-mini"` provider (`gpt-image-1-mini`) was removed end to end (no production campaign ever used it, never billed) rather than extended for the fixed-size case
- `src/composables/cartographer/useMapExport.ts` — `imageProviderKey`, resolved from the campaign's `image_provider`, drives the bake calls' `provider` argument, `styleCost`'s multiplier lookup, and `styleByok`'s key check — all three previously hardcoded to OpenAI
- `src/ai/useImageGeneration.ts` — the unused `map_style` `ImagePurpose` removed (no caller ever requested it; the actual map styler runs through `useMapExport.ts`/`style-map` entirely, never this generic pipeline); the same cleanup has also since landed in `generate-chronicle-image/index.ts` and `_shared/imageJob.ts`
- `supabase/functions/style-map/index.ts` — edge function: auth, key resolution, credit check, derives + validates the request size from the uploaded image against the resolved provider/model's own rules (before the rate limit and credit reservation, so a rejected upload never holds a reservation), OpenAI/Gemini image call, usage recording with the real size
- `src/views/cartographer/CartographerEditorView.vue` — Style Picker modal, Result modal, `onGenerateStyle`, `onRetryStyle`, `onDownloadStyled`, `onSaveStyledToAtlas` (standalone flow — the save target picker is unchanged, but its input is now fitted to the model's window and its save now writes a derived calibration too)
- `src/components/locations/map/MapLayersPanel.vue` — Drawing row's **Style with AI** action
- `src/components/locations/atlas/AtlasSiteMapMode.vue` — the second `useMapExport` instance, wired with `site`, and its own `CartographerAiStyleModal`
- `src/components/cartographer/CartographerAiStyleModal.vue` — `fixedTargetLabel` prop: replaces the combobox, changes the Save button's label/guard, and gates Generate behind the plain-language confirm above
- `src/composables/locations/useLocations.ts` — `useSaveStyledSitePicture()` (the atomic flatten mutation, now taking a `calibration`) and `useUpdateLocationPicture()` (now takes an optional `calibration`, omitted by every caller except this flow)
- `src/manual/cartographer-overview.md` — DM guide: tools, layers, view/edit mode
- `src/manual/cartographer-export.md`, `src/manual/worldbuilding-sites.md` — DM-facing coverage of the Build entry point, the Drawing being set aside, the draw-fixes-and-style-again loop, and the check-and-Calibrate step

#### Implementation notes

- Logic lives in `src/composables/cartographer/useMapExport.ts` (extracted from the view 29 Aug 2026, pre-dating #868). #868 narrowed its scope rather than removing it: the composable's header now notes it "no longer bakes a plain WebP for a location's `map_url`" for the main drawing — that path moved to `useMapPublish.ts` — and only the AI-styled result still saves the old direct way, per the M8 bullet above. The composable's own header now also carries the fixed-target/composite-input/sizing write-up in full, since that's where a reader modifying this flow will already be standing.
- Input: PNG from `bakeMapForAI()` (fitted to the resolved provider/model's shape) on the standalone page; `bakeAiStyleInput()`'s Picture+Drawing composite (same fitting) in Atlas Build. Both return `{ blob, geometry, size }` — `size` is what was actually requested, used only to log a drift warning against the returned image, never to recompute the calibration.
- Output: image blob from the resolved provider — object URL for preview, uploadable to `locationImages` bucket. A `grid_calibration` derived from the geometry above travels with it into whichever save mutation runs.
- Credit type: `map_style_generation` — defaults to 1 credit if no admin entry exists, and stays flat regardless of the render's actual pixel size.
- No new DB columns needed — Atlas Build's flatten, and the standalone save's calibration write, both use columns that already exist.
- Gemini's `sizeToAspect` (`supabase/functions/_shared/imageGen.ts`) picks the nearest of the ten aspect ratios Gemini's image models actually support (`1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`, verified against Google's Gemini API docs), by log-space distance — a map's own aspect can land anywhere in that range, not just at a fixed square.

### M9 — Structure & Publish to Atlas (#868) ✅ shipped

> **Source:** GitHub issue #868, spec `atlas/Sites & Cartographer.html` on Claude Design. Three waves, one epic, on main as `f570b4a3` (schema + derivation + Structure tools), `d367a9c7` (Publish to Atlas + the Atlas place pane) and `546b10f4` (the site runner + battle map at cell scale — see `world-building.md` and `combat-encounters.md` for those halves).

Replaces M5's Save to Atlas outright — see the "Atlas Integration" section above for the full write-order and matching-rule description, and "Structure tool group" above for the Space tool and the derivation module. **The Space/Zone pair described below was narrowed to Space alone by epic #884 (wave 4, 14–15 Sep 2026)** — zoning moved to the Atlas Plan, authored directly as a `region_role: "zone"` region rather than derived from the Drawing. Summary (as originally shipped):

- The Cartographer derived *structure* (spaces, ways out, stairs, zones, links) from the drawing, live, via `deriveStructure()` — never stored separately, always recomputed off `layers`/`metadata`. Zones were dropped from that return by #884; the function now returns `spaces`, `ways`, `stairs`, `links`.
- Two new tools (`space` hotkey `p`, `zone` hotkey `z`) and `link` moved into the same "structure" tool group. The Zone tool no longer exists — see above.
- Publish to Atlas replaces the location-picker-and-overwrite flow with a review modal that bakes the picture and reconciles rooms, bound regions, ways out and placements against it — matched by cell signature / edge key / cell, never blindly overwritten, and never deleting what it can't match (orphaned instead).
- `dungeon_maps.rev` (bumped by trigger on any `layers`/`metadata` change) and `locations.map_published_rev` (which rev a site last received) replace a bare `updated_at` timestamp as "is this place stale" — surfaced as "N regions changed since last publish" in the editor's status bar and "N behind" in the Structure panel's Published-to list.
- `?publishTo=<siteId>` opens the publish modal preselected — used by the Atlas place pane's Re-publish/Preview buttons and by drawing a new level from `SiteLevelReusePanel`.

Done = a DM can redraw a dungeon, publish again, and trust that hand-named rooms, hand-set door locks and secrets, and everything they've prepped survive the re-publish untouched.

#### As-built files (#868, Cartographer-side)

| Path | Purpose |
| --- | --- |
| [src/cartographer/structure.ts](../../src/cartographer/structure.ts) | `deriveSpaces`/`deriveWays`/`deriveStairs`/`deriveLinks`/`deriveStructure`, `structureDelta` (`deriveZones` shipped here and was removed by #884) |
| [src/cartographer/structure.types.ts](../../src/cartographer/structure.types.ts) | `DerivedSpace`/`DerivedWay`/`DerivedStair`/`DerivedLink`/`DerivedStructure` contract (`DerivedZone` shipped here and was removed by #884) |
| [src/cartographer/cellSignature.ts](../../src/cartographer/cellSignature.ts) | `canonicalCells`, `cellSignature` (64-bit FNV-1a) |
| [src/lib/locations/publish.ts](../../src/lib/locations/publish.ts) | `planPublish` — the reconciliation planner (matching, held/orphan/reanchor rules) |
| [src/lib/locations/publish.test.ts](../../src/lib/locations/publish.test.ts) | 611-line TDD suite for the planner |
| [src/composables/cartographer/useMapPublish.ts](../../src/composables/cartographer/useMapPublish.ts) | Reactive publish state + `publish()` write path |
| [src/composables/cartographer/usePublishedSites.ts](../../src/composables/cartographer/usePublishedSites.ts) | Which Atlas locations a map backs (`source_map_id` reverse lookup) |
| [src/composables/cartographer/useCartographerStructure.ts](../../src/composables/cartographer/useCartographerStructure.ts) | Live structure, Structure-panel read models |
| [src/composables/cartographer/useCartographerStructureTools.ts](../../src/composables/cartographer/useCartographerStructureTools.ts) | Pointer wiring for the Space tool |
| [src/composables/locations/useSitePlacements.ts](../../src/composables/locations/useSitePlacements.ts) | Every trap/feature placement across a site's spaces, one query |
| [src/components/cartographer/CartographerStructurePanel.vue](../../src/components/cartographer/CartographerStructurePanel.vue) | The Spaces drawer's content: space list, room inspector, Published-to list |
| [src/components/cartographer/CartographerBar.vue](../../src/components/cartographer/CartographerBar.vue) | The 3rem bar: tile set, light, Spaces, settings, undo/redo, save state, host slots |
| [src/components/cartographer/CartographerToolRail.vue](../../src/components/cartographer/CartographerToolRail.vue) | The icon rail, Drawing and Plan |
| [src/components/cartographer/CartographerToolOptions.vue](../../src/components/cartographer/CartographerToolOptions.vue) | The active tool's options slip (the inspector's per-tool sections) |
| [src/components/cartographer/CartographerPlanOptions.vue](../../src/components/cartographer/CartographerPlanOptions.vue) | The Plan layer's options slip |
| [src/components/cartographer/CartographerOptionsSlip.vue](../../src/components/cartographer/CartographerOptionsSlip.vue) | The slip frame both options components share |
| [src/components/cartographer/CartographerDrawer.vue](../../src/components/cartographer/CartographerDrawer.vue) | The right drawer (a `MobileSheet` below `lg`) |
| [src/components/cartographer/CartographerPopover.vue](../../src/components/cartographer/CartographerPopover.vue) | The body-level popover the bar's menus use |
| [src/components/cartographer/CartographerPublishModal.vue](../../src/components/cartographer/CartographerPublishModal.vue) | The Publish to Atlas review modal shell |
| [src/components/cartographer/PublishPlanPreview.vue](../../src/components/cartographer/PublishPlanPreview.vue) | The plan rendered as a picture |
| [src/components/cartographer/PublishPlanRows.vue](../../src/components/cartographer/PublishPlanRows.vue) | The plan rendered as rows, grouped by change kind |
| [supabase/migrations/20260908215640_a_region_has_a_role.sql](../../supabase/migrations/20260908215640_a_region_has_a_role.sql) | `location_map_regions.region_role`, `zone_kind`, `zone_payload`, `derived_from`, `cell_signature`, pen `vertices` |
| [supabase/migrations/20260908215641_a_way_out_has_a_kind_and_may_join_two_spaces.sql](../../supabase/migrations/20260908215641_a_way_out_has_a_kind_and_may_join_two_spaces.sql) | `location_doors.door_kind`, `source_edge_key` (now `edge_key`, #884), `dungeon_feature_id` |
| [supabase/migrations/20260908215643_the_publish_remembers_what_it_wrote.sql](../../supabase/migrations/20260908215643_the_publish_remembers_what_it_wrote.sql) | `dungeon_maps.rev` + trigger, `locations.map_published_rev`, `location_placements.source_cell_key` |

**Deleted:** `CartographerSaveAtlasModal.vue` (the old location-picker modal) — no legacy path kept.

### M10: Dressing (#1062) ✅ shipped

A shared library of top-down props a DM places on any map, whatever pack it uses. Decisions in "Dressing: a prop library beside the packs" above; the tool under "Dressing tool".

#### As-built files

| Path | Purpose |
| --- | --- |
| [supabase/migrations/20261014102253_dressing_library.sql](../../supabase/migrations/20261014102253_dressing_library.sql) | `library_dressing`, the `grimoire-dressing` source, `get_library_dressing_sources()`, `dressing_images_srd_*` storage policies, the `layers` column default |
| [supabase/migrations/20261014102255_dressing_library_content.sql](../../supabase/migrations/20261014102255_dressing_library_content.sql) | The first catalog: 62 props, no art yet |
| [supabase/tests/dressing_library.test.sql](../../supabase/tests/dressing_library.test.sql) | Read for all, admin writes, footprint and group checks, the book listing, the layer default |
| [src/types/dressing.types.ts](../../src/types/dressing.types.ts) | `LibraryDressing`, `DRESSING_GROUPS` |
| [src/cartographer/dressing.ts](../../src/cartographer/dressing.ts) | Footprints, rotated bounds, hit testing by `z`, drawing and the placeholder (no vue) |
| [src/cartographer/dressingImages.ts](../../src/cartographer/dressingImages.ts) | The pack-independent image loader, cached by url, and the catalog builder |
| [src/cartographer/paintOps.ts](../../src/cartographer/paintOps.ts) | `placeDressing` / `moveDressing` / `rotateDressing` / `removeDressing` |
| [src/composables/cartographer/useLibraryDressing.ts](../../src/composables/cartographer/useLibraryDressing.ts) | The offered props (enabled books), every prop (resolution), and the live catalog |
| [src/composables/cartographer/useDressingTool.ts](../../src/composables/cartographer/useDressingTool.ts) | Place, select, drag, turn, delete, erase, ghost |
| [src/components/cartographer/CartographerDressingPanel.vue](../../src/components/cartographer/CartographerDressingPanel.vue) | The Dressing drawer's content |
| [src/components/cartographer/RotationControl.vue](../../src/components/cartographer/RotationControl.vue) | The rotate row, shared with the object stamp |

The art is made outside the app and published with `scripts/generate-library-art.ts`, kind `dressing`: transparent WebP at 256 px per cell (a 2x1 table is 512x256), seen from directly above, no cast shadow past the footprint, neutral enough to sit on any pack. Publish refuses a picture whose size does not match its row's footprint, and makes no focal guess (a prop is never cropped). The bucket joined every registry: `buckets.ts`, `STORAGE_WRITE_POLICY`, `dev-buckets.data.ts`, `IMAGE_COLUMNS`, `IMAGE_REFERENCES`, `LIBRARY_TABLES`, `move-library-art-to-srd.ts` and the R2 checklist in `infra/README.md`.

### Future (post-M7)

- Player view of maps (`/play/maps/:id`) — gated by `is_shared`.
- Fog-of-war mask layer.
- Live token positions on maps (the in-app VTT).
- Multi-DM collaborative editing.

---

## Starter Pack: Stone Dungeon (M1 asset list)

This is the asset list as first handed to AI generation for the starter pack (door rows brought to schema 4). All files are **128×128 WebP**, seamless tileable, generated with prompts including "top-down view, perpendicular grid alignment, seamless edges, no shadows beyond cell bounds". Place under `public/cartographer/stone-dungeon/v1/`.

| Path                              | Count  | Notes                                                          |
| --------------------------------- | ------ | -------------------------------------------------------------- |
| `floor/0.webp` … `floor/9.webp`   | 10     | Random variants; subtle wear; mostly stone blocks.             |
| `wallSegmentH/0.webp` … `3.webp`  | 4      | Wall on a horizontal cell edge (see design notes below).       |
| `wallSegmentV/0.webp` … `3.webp`  | 4      | Wall on a vertical cell edge (see design notes below).         |
| `doorwayH/0.webp`                 | 1      | The opening and its frame, in the horizontal wall band.        |
| `doorwayV/0.webp`                 | 1      | The same for a vertical wall (rotation of `doorwayH`).         |
| `doorLeaf/0.webp`                 | 1      | The door alone; the renderer swings it on its hinge.           |
| `solidBlock/0.webp` … `5.webp`    | 6      | Full-cell thick walls — dressed stone block, sand-filled mass. |
| `rubble/0.webp` … `rubble/3.webp` | 4      | Decorative debris; partial-cell coverage with alpha.           |
| **Total**                         | **31** | Optional categories deferred to v2 (see below).                |

**Wall segment design notes:**

- `wallSegmentH` is painted in a **centered ~18% horizontal band** (approximately y=53…75), designed to terminate cleanly at the left and right edges so two H segments along the same row abut seamlessly.
- `wallSegmentV` is painted in a **centered ~18% vertical band** (approximately x=53…75), terminating cleanly at top and bottom edges.
- Both must render correctly when overlaid on any floor tile — the rest of the 128×128 area is transparent.
- Optional categories deferred to v2: `wallJoint` (corner art), `stairsUp`, `stairsDown`, `debris`.

Plus `manifest.json` describing the pack (the `TilePackManifest` serialised).

### Generation prompt template (per category)

Historical prompt example (the #772 compiler now produces the authoritative per-slot prompt):

> *"Top-down view of a stone dungeon floor tile, seamless tileable on all four edges, perpendicular grid alignment, no light source bias, subtle wear and cracks, dark grey weathered flagstones, no characters, no text, no shadows extending past the tile bounds. Preserve clear shapes when reduced to 128×128. Variant 3 — vary crack patterns from previous variants."*

The shared style guide:

- View: **top-down (orthographic)**, not isometric.
- Lighting: even, no directional bias.
- Edges: **seamless** for floor; **clean perpendicular cuts** for walls.
- Style: matches Dungeon Grimoire's **2024 OneDnD aesthetic** (clean, modern — not crusty parchment).
- Generation candidate: 1024×1024 WebP from `gpt-image-2` low.
- Runtime format: deterministic 128×128 WebP normalization; transparent-footprint categories receive mechanical alpha masks.

---

## Open Questions (for future agents / sessions)

1. **Light layer** — should v2 include a "light" sub-layer (torches, glow effects) that bakes into the export? Probably yes for atmospheric maps.
2. **Multi-floor dungeons** — one map per floor, or layers within a single map? Lean: one map per floor, linked via `parent_map_id`.
3. **Hex grid support** — square grid only for M1–M7. Hex is a separate axis; defer.
4. **AI-assisted layout** — "generate a 4-room dungeon" prompt that produces a starting cell state. Possibly M7+.
5. **Token placement for VTT** — `npc_spawn_ids` / `monster_spawn_ids` are storage-level only in M4; the actual token render on the map is a future-VTT concern.

---

## Quick Reference

- **Source maps** live in `dungeon_maps` (user-scoped, private). Edited in Cartographer.
- **Baked maps** live as WebP images in Storage, referenced by `locations.map_url`. Published from Cartographer via **Publish to Atlas** (#868), which reconciles the site's rooms/doors/placements against the drawing's derived structure in the same action, never just overwrites the picture.
- **Tile packs** are versioned, schema-validated, WebP-only. Starter pack bundled; others from Storage.
- **Cells** carry per-cell pack references so a single map can mix themes cleanly (per-brush theme switching).
- **Walls** are **edge-based** by default (stored as `wallN` / `wallW` on floor cells, NW ownership). The `solidBlock` layer carries **cell-based** thick walls for masonry mass.
- **Doors** are edge state: they replace a wall segment on an edge, drawn as a doorway tile plus a leaf swung on its hinge (closed 0°, open `openDegrees`). Grates and sluices are edge state too.
- **Terrain** (`layers.terrain`) is drawn instead of the floor in its cell; curbs appear on its banks by themselves; shadows are drawn at render time by `drawMap.ts`, which the editor and the bake share.
- **No bitmask auto-tiler in M1** — wall segments are straight and abut at intersections; optional `wallJoint` corner art layers in M2 if packs provide it.
- **Movement / sight blocking** is derived per-edge from `wallN` / `wallW` / `solidBlock` — never stored.
- **Infinite canvas** with crop-on-export and 3-cell black padding.
- **Entity links** per cell preserve data for a future in-app VTT.
- **Two entry points**: Dungeon Craft tab and Publishing Tools nav group (same view).

---

## As-built (M1 + M2)

This appendix tracks where the implementation actually lives so future agents don't have to grep.

### Files created in M1

| Path | Purpose |
| --- | --- |
| [supabase/migrations/20260511000005_dungeon_maps_cartographer.sql](../../supabase/migrations/20260511000005_dungeon_maps_cartographer.sql) | `dungeon_maps` table + `locations.source_map_id` FK |
| [src/types/dungeonMap.types.ts](../../src/types/dungeonMap.types.ts) | `DungeonMap`, `FloorCell`, `SolidCell`, `EdgeSeg`, `CellKey` helpers |
| [src/cartographer/packSchema.ts](../../src/cartographer/packSchema.ts) | `TILE_PACK_SCHEMA`, `PackCategory`, `TilePackManifest`, `REQUIRED_CATEGORIES` |
| [src/cartographer/validatePack.ts](../../src/cartographer/validatePack.ts) | `validatePack()` → `{ valid, missing, extras, warnings }` |
| [src/cartographer/placeholderTile.ts](../../src/cartographer/placeholderTile.ts) | Procedural placeholder tiles (used when WebP asset missing or load fails) |
| [src/cartographer/packLoader.ts](../../src/cartographer/packLoader.ts) | `loadPack(manifestUrl)` → `TilePackRuntime` with `getTile(category, variant, side?)` |
| [public/cartographer/stone-dungeon/v1/manifest.json](../../public/cartographer/stone-dungeon/v1/manifest.json) | Starter pack manifest (declares full M1+M2 slot list) |
| [public/cartographer/stone-dungeon/v1/README.md](../../public/cartographer/stone-dungeon/v1/README.md) | Asset list + generation guidelines for the AI pipeline |
| [src/composables/cartographer/useDungeonMaps.ts](../../src/composables/cartographer/useDungeonMaps.ts) | `useDungeonMaps`, `useDungeonMap`, `useCreate/Update/DeleteDungeonMap` |
| [src/views/cartographer/CartographerListView.vue](../../src/views/cartographer/CartographerListView.vue) | `/cartographer` list view with filter state |
| [src/views/cartographer/CartographerEditorView.vue](../../src/views/cartographer/CartographerEditorView.vue) | `/cartographer/new` + `/cartographer/:id` editor (bar + rail + canvas + options slip + drawer) |

### Files modified in M1

- [src/lib/icons.ts](../../src/lib/icons.ts) — added `IconBrush`, `IconEraser`, `IconHand`, `IconWall`, `IconDoor`, `IconCube`.
- [src/router/routes.ts](../../src/router/routes.ts) — added three Cartographer routes.
- [src/stores/ui/cartographer.ts](../../src/stores/ui/cartographer.ts) — added `cartographerSearch`, `cartographerFilterPack`, `cartographerHasActiveFilters`, `resetCartographerFilters`.
- [src/views/dungeon-features/DungeonCraftView.vue](../../src/views/dungeon-features/DungeonCraftView.vue) — added the **Cartographer** tab (6th) with embedded map list.

### Placeholder-asset behaviour

The bundled Stone Dungeon pack ships a complete manifest but **no actual WebP files yet** — they're queued for the AI generation pipeline. The pack loader handles this gracefully:

1. `validatePack(manifest)` reports the manifest as valid (URLs are declared correctly).
2. `loadPack()` attempts to fetch each declared asset.
3. Any asset that 404s falls back to a **procedural placeholder tile** generated in [src/cartographer/placeholderTile.ts](../../src/cartographer/placeholderTile.ts).
4. Each placeholder's colour is derived from `hash(pack_id, category, side?, variant)` so variants stay stable across reloads.

When real WebP assets land at `public/cartographer/stone-dungeon/v1/floor/0.webp` etc., they replace the placeholders automatically — **no code change required**.

The editor displays an "N slot(s) missing. Using placeholders." warning in the tile set menu when the validator finds slots without art.

### Migration apply

The migration file is in place but **not yet applied to the remote Supabase project**. Run `supabase db push` from the project root when ready.

### M1 acceptance status

- [x] DB migration written (`dungeon_maps` + `locations.source_map_id`).
- [x] Tile pack schema + validator + loader in `src/cartographer/`.
- [x] Starter Stone pack manifest in `public/cartographer/stone-dungeon/v1/`.
- [x] List + editor views with floor brush, pan, zoom, per-cell hash variant.
- [x] Save/load via TanStack Query composable.
- [x] DC hub tab integration (6th tab).
- [x] Filter state in `useCartographerUiStore`.
- [x] Stale `pack_id` placeholder rendering.
- [ ] **Pending user action**: run `supabase db push` to apply migration.
- [ ] **Pending external work**: real WebP assets in the AI-gen pipeline.

### M2 acceptance status

- [x] Wall brush (W) — edge-hover targeting, drag runs, direction-lock, NW ownership.
- [x] Shift+click wall brush — wraps all 4 edges of the clicked cell.
- [x] Door tool (D) — click edge: place doorClosed; click doorClosed → doorOpen; click doorOpen → doorClosed; RMB → revert to wall.
- [x] Rock tool (S, then called Solid block): paints `solidBlock` layer; flat-render in M2 (bitmask deferred to M3+).
- [x] Rectangle tool (R) — drag fills rect with floor; Shift+drag also wraps perimeter walls.
- [x] Line tool (L) — Bresenham floor line between two cells.
- [x] Fill bucket (F) — floods from cursor through non-solidBlock cells planting floor (2 000-cell cap).
- [x] Wrap (X, then called Wrap walls): floods the connected floor region and places walls on every boundary edge facing void.
- [x] Undo/redo — CommandStack (100-step cap); Ctrl+Z / Ctrl+Shift+Z; undo/redo buttons in status bar. Each stroke or one-shot action is one undo unit.
- [x] Corner joints — programmatic filled-square fallback at H+V intersections; routes to `wallJoint` pack art when available (classifyJoint: L_NE/SE/SW/NW, T_N/E/S/W, CROSS).
- [x] SolidBlock rendering — full-cell tile above floor, below edge walls.
- [x] Door rendering: wallN/wallW type-aware: a `doorwayH/V` tile plus a `doorLeaf` (closed, or swung open on its hinge).
- [x] Zoom 5%–400%; center map (C); undo/redo indicators in status bar.

### New files added in M2

| Path | Purpose |
| --- | --- |
| [src/cartographer/edges.ts](../../src/cartographer/edges.ts) | `canonicaliseEdge` — NW ownership rule |
| [src/cartographer/edges.test.ts](../../src/cartographer/edges.test.ts) | TDD: NW ownership + edge helpers |
| [src/cartographer/edgeHover.ts](../../src/cartographer/edgeHover.ts) | `detectHoveredEdge` — pointer → edge snap |
| [src/cartographer/edgeHover.test.ts](../../src/cartographer/edgeHover.test.ts) | TDD: edge-hover threshold maths |
| [src/cartographer/commandStack.ts](../../src/cartographer/commandStack.ts) | `CommandStack` + `CompoundCommand` |
| [src/cartographer/commandStack.test.ts](../../src/cartographer/commandStack.test.ts) | TDD: undo/redo stack |
| [src/cartographer/floodFill.ts](../../src/cartographer/floodFill.ts) | `floodFill` + `boundaryEdges` |
| [src/cartographer/floodFill.test.ts](../../src/cartographer/floodFill.test.ts) | TDD: flood-fill + boundary-edge |
| [vitest.config.ts](../../vitest.config.ts) | Vitest config: happy-dom for component/view/composable tests, plain Node elsewhere |

### Wood Interior pack (post-M2)

A second bundled pack, `wood-interior`, ships alongside `stone-dungeon`. Real WebP assets present for floor (variants 0–9), wallSegmentH/V (0–3), wallJoint (generic `0.webp` — no directional variants), solidBlock (0–4), rubble (0–3). Door assets not yet available; manifest entries exist for fallback-to-procedural. Pack path: `public/cartographer/wood-interior/v1/`.

**Multi-pack bug fixes landed alongside this pack:**

- `paintCell` guard now checks `pack_id` *and* `variant` — previously skipped overpainting when variant number matched even across packs.
- `paintWallAtCellEdge` guard now allows overpainting if the existing wall belongs to a *different* pack (allows restyling a dungeon).
- Corner joint `thickness` corrected to `tilePx * (35/128)` to match extracted art strip width (was `0.18 × tilePx`).
- Corner joint pack detection now checks all four adjacent walls instead of just the SE pair, so corners don't flicker to `currentPackId` when the active pack changes.
- `wallJoint` generic tile lookup: renderer tries directional side-keyed tile first, then generic variant-0 (no side field), then procedural square. Packs only need `"wallJoint": [{ "variant": 0 }]` for uniform corners.

### M4 acceptance status

- [x] 6 optional object categories added to pack schema: `objectChest`, `objectBarrel`, `objectTable`, `objectStatue`, `objectPillar`, `objectBrazier`.
- [x] Procedural placeholder tiles for each object type (distinct recognisable shapes, transparent background).
- [x] Object stamp tool (O) — click to place, RMB to erase; drag paints; eraser removes object layer first.
- [x] Per-object rotation: Q/E keyboard shortcuts + rotation buttons in the options slip (0°/90°/180°/270°). Stored as `PackRef.rotation`.
- [x] Label tool (T, then called Annotate): click a cell to select it; the options slip shows the text input; label rendered on canvas centered in cell with drop-shadow.
- [x] Link tool (K, then called Link entity): click a cell to select it; the options slip shows Note + Encounter pickers (EntityCombobox); blue dot rendered on linked cells.
- [x] `metadata` ref persists entity links separately from `layers`; included in undo/redo snapshot and save payload.
- [x] Eraser priority: object → annotation (inline erase on keydown) → solidBlock → floor/edge.

### New files added in M4

| Path | Purpose |
| --- | --- |
| *(no new files — all changes in existing files)* | |

### Modified in M4

- [src/cartographer/packSchema.ts](../../src/cartographer/packSchema.ts) — 6 object categories + `OBJECT_CATEGORIES` + `ObjectCategory` type.
- [src/cartographer/placeholderTile.ts](../../src/cartographer/placeholderTile.ts) — procedural object placeholder renderer per category.
- [src/lib/icons.ts](../../src/lib/icons.ts) — `IconObjectStamp`, `IconAnnotate`, `IconEntityLink`.
- [src/views/cartographer/CartographerEditorView.vue](../../src/views/cartographer/CartographerEditorView.vue) — all M4 tool + rendering + inspector changes.

### Known M4 deferrals (deliberate)

- Minimap — deferred.
- Per-cell rotation for floors/walls — deferred (only object stamps rotate in M4).
- Sidebar list of all map contents — deferred to M5.
- npc_spawn_ids / monster_spawn_ids links — only note + encounter links in M4.

### M5 acceptance status

> **Historical record of what M5 shipped.** The "Save to Atlas" button, its modal and `CartographerSaveAtlasModal.vue` were deleted outright by #868 (d367a9c7) and replaced by Publish to Atlas — see "Atlas Integration" and M9 above. `bakeMap()`, `source_map_id`, the "↓ PNG" button and the Publish nav placement all survive unchanged; the checklist below is left as the M5-era record, not current behaviour.

- [x] `src/cartographer/bake.ts` — `bakeMap()` (WebP, 5 MB cap + quality retry) + `bakeMapAsPng()` (PNG, client download).
- [x] "↓ PNG" button in PageHeader actions — downloads full-res PNG to disk without uploading.
- [x] "Save to Atlas" button — opens modal with location picker (EntityCombobox against all locations).
- [x] Save to Atlas flow: bakes map → uploads WebP to `location-images` bucket → updates `locations.map_url` + `source_map_id` via `useUpdateLocationMapUrl`.
- [x] "Edit in Cartographer" link in LocationEditor map section when `source_map_id` is set.
- [x] `source_map_id` added to `Location` TS type.
- [x] `useUpdateLocationMapUrl()` mutation in `useLocations.ts`.
- [x] Cartographer added to Publishing Tools ("Publish") nav group.
- [x] Re-export: subsequent "Save to Atlas" overwrites `locations.map_url` + `source_map_id` for the chosen location.

### New files added in M5

| Path | Purpose |
| --- | --- |
| [src/cartographer/bake.ts](../../src/cartographer/bake.ts) | `bakeMap()` + `bakeMapAsPng()` — offline OffscreenCanvas composite |

### Modified in M5

- [src/types/location.types.ts](../../src/types/location.types.ts) — `source_map_id: string | null` added to `Location`.
- [src/composables/locations/useLocations.ts](../../src/composables/locations/useLocations.ts) — `useUpdateLocationMapUrl()` mutation.
- [src/lib/nav.ts](../../src/lib/nav.ts) — Cartographer entry in Publish nav group.
- [src/views/cartographer/CartographerEditorView.vue](../../src/views/cartographer/CartographerEditorView.vue) — Save to Atlas button + modal + Download PNG button + bake/upload logic.
- [src/components/locations/place/LocationEditor.vue](../../src/components/locations/place/LocationEditor.vue) — "Edit in Cartographer" link when `source_map_id` is set.

### Known M5 deferrals (deliberate)

- VTT-friendly export options (strip brand frame, no padding, 70 px/cell) — deferred; `bakeMap()` takes `BakeOptions` for easy extension.
- Brand frame watermark — deferred.
- Re-export conflict prompt (different `source_map_id`) — silently overwrites; improve UX in a follow-up.
- Sidebar list of map contents — deferred.

### Known M2 deferrals (deliberate)

- SolidBlock bitmask auto-tiler — deferred to M3+ (flat texture only in M2).
- `wallJoint` pack art — fallback is programmatic fill; joint tiles render when pack ships them.
- Object layer, annotation layer, entity links — M4.
- Export, Atlas integration, Publishing Tools nav entry — M5 ✓
