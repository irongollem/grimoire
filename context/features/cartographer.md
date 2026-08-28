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

### Storage: private Supabase Storage bucket + bundled starter packs

**Chosen:**

- User tile packs live in the private Supabase Storage bucket `tile-packs/` under `<user_id>/<pack_id>/v<version>/`. Owners and members of campaigns to which a pack is shared receive signed URLs.
- The **Stone Dungeon** starter pack ships in `public/cartographer/stone/` so the editor never shows a "loading theme" spinner on first open.
- Bundled packs remain under `public/cartographer/`; custom packs are lazy-loaded from signed Storage URLs as the user picks them.

**Rejected:**

- Bundling everything in `public/` — bloats deploys past one starter pack.
- Public object URLs for private packs — a guessable URL must not bypass ownership or campaign membership.

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

Doors live on edges (replacing the wall segment on that edge) — exactly as in reality. Crossing a door = crossing an edge, not entering a cell.

### Infinite canvas with crop-on-export

**Chosen:** no fixed map dimensions. Pan/zoom; sparse storage; export computes the bounding box of painted cells and pads with N cells of black before rasterising.

**Why?** It removes the "what size map should I create?" friction at start. Painting starts at origin and grows. Hard safety cap at 500×500 painted extent (≈70 MB raw PNG at 128 px tiles — past that browser memory dies). Soft warning at 200×200.

### Data preserved for future VTT

**Chosen:** even though the current focus is *image creation*, map data is stored as structured cell records. Each cell can carry first-class links to Grimoire entities (traps, encounters, features, notes, NPC spawns). This is the **USP** vs. Dungeondraft / Inkarnate — those export images; Cartographer exports images **and** keeps the navigable data behind them.

---

## Tile Pack System

A tile pack is a versioned bundle of WebP assets keyed against a strongly-typed schema. The schema is the source of truth for what every pack must contain.

### Schema (`src/cartographer/packSchema.ts`)

```ts
export type CategoryKind =
  | 'random'        // multiple interchangeable variants, picked randomly per cell
  | 'directional'   // fixed set of side/orientation slots
  | 'optional'      // not required for pack validity

export type RandomCategory = { kind: 'random'; min: number; max: number }
export type DirectionalCategory = {
  kind: 'directional'
  sides: readonly string[]
  variantsPerSide?: number   // default 1
  optional?: boolean
}
export type OptionalCategory = { kind: 'optional'; min: 0; max: number }

export const TILE_PACK_SCHEMA = {
  version: 1,
  categories: {
    // Floor — full-cell tile under foot
    floor:            { kind: 'random',      min: 8, max: 16 },

    // Edge walls — sit on cell edges. The H/V split is for AI-generation quality
    // (perspective, lighting); the renderer picks H or V based on edge orientation.
    wallSegmentH:     { kind: 'random',      min: 2, max: 6 },     // wall on a horizontal edge (N or S of a cell)
    wallSegmentV:     { kind: 'random',      min: 2, max: 6 },     // wall on a vertical edge (E or W of a cell)

    // Optional corner art at grid intersections where 2+ walls meet.
    // M1 omits this — perpendicular wall segments simply abut at corners.
    // M2 can ship corners and the renderer will substitute them where they fit.
    wallJoint:        { kind: 'directional', sides: ['L_NE','L_SE','L_SW','L_NW','T_N','T_E','T_S','T_W','CROSS'], optional: true },

    // Doors are edges too — they replace the wall segment on that edge.
    doorClosedH:      { kind: 'random',      min: 1, max: 3 },
    doorClosedV:      { kind: 'random',      min: 1, max: 3 },
    doorOpenH:        { kind: 'random',      min: 1, max: 3 },
    doorOpenV:        { kind: 'random',      min: 1, max: 3 },

    // Cell-based thick walls — 5 ft cubes of solid material (battlement, mountain rock).
    // Lives on the `solidBlock` layer, not as an edge.
    solidBlock:       { kind: 'random',      min: 4, max: 12 },

    // Vertical traversal
    stairsUp:         { kind: 'directional', sides: ['N','E','S','W'], optional: true },
    stairsDown:       { kind: 'directional', sides: ['N','E','S','W'], optional: true },

    // Decorative overlays (alpha-transparent, sit on the object layer)
    rubble:           { kind: 'optional',    min: 0, max: 4 },
    debris:           { kind: 'optional',    min: 0, max: 4 },
  },
} as const

export type RequiredCategory = /* derived: all entries with optional !== true */
export type PackCategory = keyof typeof TILE_PACK_SCHEMA.categories

export interface TilePackManifest {
  pack_id: string              // e.g. "stone-dungeon"
  name: string                 // "Stone Dungeon"
  description: string
  pack_version: number         // bumped per pack release
  schema_version: number       // matches TILE_PACK_SCHEMA.version at author time
  base_tile_size: 128          // source resolution; always 128
  assets: Record<PackCategory, AssetSlot[]>
}

export interface AssetSlot {
  side?: string                // for directional categories
  variant: number              // 0-indexed
  url: string                  // relative to pack root or full URL
  byteSize: number             // for budget warnings
}
```

### Validator (`src/cartographer/validatePack.ts`)

```ts
validatePack(manifest: TilePackManifest): {
  valid: boolean
  missing: { category: PackCategory; side?: string; variant?: number }[]
  extras: string[]
  warnings: string[]   // oversize, wrong dimensions, suspect format
}
```

Validation runs at:

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
tile-packs/stone-dungeon/v1/doorClosedH/0.webp
tile-packs/stone-dungeon/v1/solidBlock/0.webp
```

Directional categories (`wallJoint`, `stairsUp`, `stairsDown`) keep the `<side>/` subfolder; random categories store variants directly under the category folder.

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

`validate` checks schema completeness plus deployed file existence, format, exact dimensions, alpha, and open-door clearance. It also fails on any `validatePack` warning (duplicate slot claim, non-WebP asset, a category over its schema max) and on a floor or solidBlock whose opposite edges differ by more than `MAX_EDGE_DELTA` — 40, set at roughly twice the worst of the twelve accepted `celestial-observatory/v1` tiles. `qa` additionally produces:

- a labelled contact sheet;
- repeated floor seam strips;
- a seeded 20×20 floor field with no immediate orthogonal repeats when alternatives exist;
- wall/door alignment;
- a procedurally assembled sample map;
- a machine-readable validation report.

The checked vertical slice is `celestial-observatory/v1`: all 20 schema-required slots plus directional rounded-corner, staircase, and cross-junction proofs. It demonstrates a non-standard theme with real interactively generated artwork; optional prop categories remain intentionally ungenerated.

This tooling is maintainer-only. It does not implement #384's customer UI, uploads/storage, RLS, campaign sharing, PRO gates, credit reservations, cancellation/refunds, or direct Images API execution.

#### Feasibility result for a future asynchronous generator

The #772 vertical slice supports a qualified **yes**: a user can eventually choose a theme and receive a complete generated pack asynchronously, provided "complete" means mechanically valid and review-ready—not guaranteed artistically perfect in one model pass.

The experiment established a useful boundary:

- Code can guarantee schema coverage, slot identity, paths, dimensions, WebP encoding, alpha masks, open-door gaps, rounded-corner silhouettes, stable variation selection, retry isolation, and reproducible QA.
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

### Pack versioning & the Update Tileset button

Every map cell stores `pack_id` **and** `pack_version`. The editor scans the set of distinct `(pack_id, pack_version)` pairs on load; if a newer version of any used pack exists, an **Update Tileset** affordance appears.

Update flow:

1. Show diff: "Stone Dungeon v1 → v3. 4 new floor variants, 2 wall variants replaced."
2. On confirm, walk cells with the stale pack version:
   - If the cell's `(category, side, variant)` still exists in the new manifest → bump `pack_version`, keep variant.
   - If the variant was removed → fall back to variant `0` of the same `(category, side)` slot, log a warning.
   - Never silently drop cells.
3. Save the map.

---

## Map Data Model

### `dungeon_maps` table

```sql
create table dungeon_maps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  layers      jsonb not null default '{"floor":{},"solidBlock":{},"object":{},"annotation":{}}'::jsonb,
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
  rotation?: 0 | 90 | 180 | 270   // optional; only meaningful for the object layer
}

// An edge segment — wall or door — owned by a cell on its N or W side
// (south/east edges are owned by the cell to the north/west — "NW ownership").
export interface EdgeSeg extends PackRef {
  type: 'wall' | 'doorClosed' | 'doorOpen'
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
    object:      Record<CellKey, ObjectCell>
    annotation:  Record<CellKey, AnnotationCell>
  }
  metadata: Record<CellKey, CellMetadata>      // entity links (see below)
  default_pack_id: string | null
  tags: string[]
  notes: TiptapDoc | null
  created_at: string
  updated_at: string
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

## Editor UX (`src/views/cartographer/CartographerEditor.vue`)

### Layout

```text
+--------------------------------------------------------------+
| PageHeader   [name input]              [Save] [Save to Atlas]|
+-----------+-------------------------------------+------------+
|           |                                     |            |
| Toolbox   |          Canvas (infinite)          |  Inspector |
| (left)    |                                     |  (right)   |
|           |                                     |            |
+-----------+-------------------------------------+------------+
|                Status bar (coords, brush, pack)              |
+--------------------------------------------------------------+
```

### Toolbox (left rail)

| Tool         | Icon       | Layer       | Notes                                                  |
| ------------ | ---------- | ----------- | ------------------------------------------------------ |
| Floor brush  | brush      | floor       | Paints floor cells with a random variant.              |
| Wall brush   | wall-icon  | floor.edges | Edge-hover targeting; see UX notes.                    |
| Door tool    | door       | floor.edges | Replaces wall on an edge; toggles open/closed.         |
| Solid block  | brick-cube | solidBlock  | Full-cell thick walls (battlement, mountain rock).     |
| Object stamp | crate      | object      | Picker for chests, statues, braziers, rubble, debris.  |
| Eraser       | eraser     | active      | Removes from the active layer / edge.                  |
| Rectangle    | rectangle  | floor       | Drag to fill a rect with floor. Shift = wrap walls.    |
| Line         | line       | floor       | Drag to draw a single-tile-wide line of floor.         |
| Fill         | bucket     | floor       | Flood-fill contiguous floor cells.                     |
| Wrap walls   | brick-wall | floor.edges | One-shot: walls every floor-region edge facing void.   |
| Annotate     | text       | annotation  | Text labels / icons.                                   |
| Link entity  | link       | metadata    | Attach a trap / encounter / feature / note to a cell.  |
| Pan          | hand       | —           | Middle-mouse or space-drag anywhere also pans.         |

#### UX notes for edge-based tools

- **Wall brush targeting**: when the cursor is within 25% of a cell edge, that edge highlights as a thick coloured strip. Click places a wall on it. Drag along multiple edges to lay a continuous run. `Shift`+click a cell = walls on all 4 of its edges.
- **Door tool**: hovers the same way as the wall brush. Click on a wall edge converts it to `doorClosed`. Click an existing door toggles `doorClosed` ↔ `doorOpen`. Right-click removes the door, leaving the wall.
- **Solid block vs. wall brush**: these are two different tools by design. The wall brush gives you a thin wall on an edge (a curtain, a partition, a worked-stone room boundary). The solid block tool gives you a thick wall in a cell (a sand-filled battlement, mountain rock, a 5 ft slab of masonry). The DM picks based on the dungeon's mass.
- **Rectangle + Shift**: Shift-dragging the rectangle tool fills the area with floor *and* runs `wrap walls` on the rectangle perimeter — the most common "make a room" gesture.

### Inspector (right rail)

Contextual to the active tool:

- **Pack picker** (always visible): grid of loaded packs with thumbnails; clicking sets the brush's pack. Shows "Load more packs" button to pull from storage.
- **Tool-specific options**: brush size (1, 3, 5 cells), rectangle fill mode (outline / filled), object rotation.
- **Cell inspector** (when a cell is selected): shows linked entities, edit/remove links.

### Canvas behaviour

- **Pan**: middle-mouse drag, or hold space + drag, or two-finger pan on trackpad.
- **Zoom**: mouse wheel; 25% to 400%.
- **Grid**: drawn procedurally per frame; only lines crossing the viewport are drawn (~50 lines max).
- **Hover preview**: shows the tile that would be placed if clicked (semi-transparent).
- **Stroke** = mousedown → drag → mouseup; recorded as a single undo unit.

### Undo/redo (command pattern)

Every mutation is a `Command` with `apply()` and `revert()`. Commands stacked in two arrays; `Ctrl+Z` / `Ctrl+Shift+Z` walk the stacks. Stroke = compound command (one undo per stroke, not per cell).

### Filter state

Map list filters (search by name, tag, pack) → `useUiStore`, with `hasActiveFilters` + `resetCartographerFilters()` per the CLAUDE.md rule.

---

## Wall Rendering (no bitmask auto-tiler in M1)

Edge-based walls eliminate the 8-neighbour bitmask problem entirely. A wall is a straight segment of one of two orientations (horizontal or vertical), so there is no "which variant fits this corner?" calculation. The renderer just picks a random variant from the pack's `wallSegmentH` or `wallSegmentV` slot, keyed deterministically by `hash(map_id, edgeKey) % variantCount`.

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

### When rendering recomputes

The renderer maintains a dirty set of `(layer, key)` entries. Recompute fires on:

- Edge wall paint / erase / door toggle.
- Solid block paint / erase.
- Pack update (Update Tileset action) — invalidates everything for the updated pack.

Floor and object layers do simple random-variant lookup keyed by `hash(map_id, x, y) % variantCount` — no recomputation needed.

---

## Atlas Integration

Cartographer is the authoring side; [Atlas](world-building.md) is where baked maps are published into the campaign.

### Save to Atlas flow

1. Cartographer Editor → **Save to Atlas** button.
2. Modal opens: location picker (EntityCombobox against the user's locations).
3. On confirm:
   - Bake current map to WebP (see Export Pipeline).
   - Upload to `location-maps/<location_id>.webp` (or a versioned filename).
   - Update `locations.map_url` with the new URL.
   - Update `locations.source_map_id` (new optional FK → `dungeon_maps.id`) so the link is preserved.
4. Toast: "Map saved to [Location Name]".

### Re-export prompt

If the chosen location already has `source_map_id` set:

- If `source_map_id === current_map_id` → "Update existing map for [Location]?" (one button).
- If different → "Replace [Location]'s map with this one? / Save to a different location?".

### Schema change required

Add to `locations` table:

```sql
alter table locations add column source_map_id uuid references dungeon_maps(id) on delete set null;
```

Done in the same migration that creates `dungeon_maps`.

### Reverse navigation

On a location detail page, if `source_map_id` is set, show an **Edit map in Cartographer** link that opens `/cartographer/:id`.

---

## Export Pipeline

### Bake to WebP (used by Save to Atlas)

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

Toolbox → **Link entity** tool → click a cell → side panel shows all link slots → each slot has an EntityCombobox against the appropriate table → save commits to `map.metadata[cellKey]`.

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
- Update Tileset button (pack-version migration).

Done = paint with two packs on one map; pack updates apply cleanly.

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
- Save to Atlas flow (location picker, `source_map_id` link, re-export prompt).
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
| Room template | `m` | Click center, drag to size. Three shapes: **Circle**, **Octagon**, **Hex**. Fills floor + auto-wraps walls around the perimeter. |
| Cave brush | `v` | Drag to paint organic floor blobs driven by smooth value noise. Brush sizes 3/5/7/9 cells. New noise seed per stroke. |
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
- `valueNoise2D(x, y, seed)` — smoothstep-interpolated value noise in `[0, 1]`; deterministic per `(coord, seed)`.
- `caveBrushCells(cx, cy, radius, seed)` — radial noise threshold; centre cells included reliably, edge cells fade out organically.

#### Files added/modified in M6

- `src/cartographer/geometry.ts` — new pure-functions module (room shapes + value noise + cave brush).
- `src/cartographer/geometry.test.ts` — 13 unit tests.
- `src/cartographer/packSchema.ts` — `TILE_PACK_SCHEMA.version` bumped to 2; `wallRoundJoint` category added.
- `src/cartographer/placeholderTile.ts` — rounded-corner placeholder renderer (`wallRoundJoint` branch + palette default).
- `src/types/dungeonMap.types.ts` — `PackRef.rotation` widened from `0 | 90 | 180 | 270` to `number`.
- `src/lib/icons.ts` — `IconRoomTemplate` (Hexagon) + `IconCave` (Cloud).
- `public/cartographer/stone-dungeon/v1/manifest.json` — `schema_version` bumped to 2; `wallRoundJoint` slots declared (use placeholder art until WebP lands).
- `src/views/cartographer/CartographerEditorView.vue` — two new tools wired into TOOLS, pointer handlers, inspector panels; round-corner rendering branch in `render()`; fine-rotation `[` / `]` hotkeys.

#### Open items

- Real bundled WebP art for `wallRoundJoint` on Stone Dungeon and other packs — existing bundled manifests still fall back to the placeholder. M7 now provides the production generation and QA loop; regenerating the fundamental bundled catalogue is a separate content-production pass after the customer workflow is proven.
- Other bundled packs still ship `schema_version: 1` and lack `wallRoundJoint` slots; corners on those packs render as before (sharp wallJoint).

### M7 — Community / custom packs (PRO) — ✅ shipped

> **Source:** GitHub issue #384. Implemented after #772 replaced the unreliable one-pass assumptions with a tested generation-plan, normalization, retry, and QA foundation.

- User-uploaded packs (private bucket, validated against schema).
- Pack sharing within a campaign (DM uploads → campaign members see it).
- AI pack generator (PRO, expensive): given a theme name + description, iterates schema slots and generates missing assets.
- Marketplace TBD.

Done = users own their aesthetic.

#### As-built upload and sharing

- `/cartographer/packs` accepts either a zip or a selected folder.
- The browser requires `manifest.json`, current schema v2, complete required slots, canonical WebP-only assets, and exact 128×128 decoded dimensions before any upload begins. Missing slots are displayed with `formatMissingForDisplay()`.
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
   - **Save to Atlas** — inline location combobox + upload to `locationImages` bucket
   - **↓ Download** — client-side WebP download
   - **Retry** — re-runs with same settings
   - **Back** — returns to Style Picker

All outputs include a `dungeongrimoire.com` watermark via a fixed prompt suffix.

#### Prompt composition

```ts
// Edge function builds: name + description + presetPrompt + userSuffix + watermark
[mapName, mapDescription, presetPrompt, suffix, WATERMARK_SUFFIX].filter(Boolean).join(", ")
```

`DungeonMap` has no `theme` field — `name` + `description` are used instead.

#### Files (as built)

- `src/cartographer/stylePresets.ts` — `StylePreset` interface + `CARTOGRAPHER_STYLE_PRESETS` array + `WATERMARK_SUFFIX`
- `src/cartographer/bake.ts` — `bakeMapForAI()` added: downscales to max 1024 px, returns PNG
- `supabase/functions/style-map/index.ts` — edge function: auth, key resolution, credit check, OpenAI images/edits call, usage recording
- `src/views/cartographer/CartographerEditorView.vue` — Style Picker modal, Result modal, `onGenerateStyle`, `onRetryStyle`, `onDownloadStyled`, `onSaveStyledToAtlas`
- `src/manual/cartographer-overview.md` — DM guide: tools, layers, view/edit mode
- `src/manual/cartographer-export.md` — DM guide: PNG download, Save to Atlas, AI Style presets + tips

#### Implementation notes

- No composable extracted — logic lives inline in the view (same pattern as M5 Save to Atlas).
- Input: PNG from `bakeMapForAI()` (max 1024 px, downscaled if needed).
- Output: WebP blob from OpenAI — object URL for preview, uploadable to `locationImages` bucket.
- Credit type: `map_style_generation` — defaults to 1 credit if no admin entry exists.
- No new DB columns needed.

### Future (post-M7)

- Player view of maps (`/play/maps/:id`) — gated by `is_shared`.
- Fog-of-war mask layer.
- Live token positions on maps (the in-app VTT).
- Multi-DM collaborative editing.

---

## Starter Pack: Stone Dungeon (M1 asset list)

This is the exact asset list to hand to AI generation for the starter pack. All files are **128×128 WebP**, seamless tileable, generated with prompts including "top-down view, perpendicular grid alignment, seamless edges, no shadows beyond cell bounds". Place under `public/cartographer/stone-dungeon/v1/`.

| Path                              | Count  | Notes                                                          |
| --------------------------------- | ------ | -------------------------------------------------------------- |
| `floor/0.webp` … `floor/9.webp`   | 10     | Random variants; subtle wear; mostly stone blocks.             |
| `wallSegmentH/0.webp` … `3.webp`  | 4      | Wall on a horizontal cell edge (see design notes below).       |
| `wallSegmentV/0.webp` … `3.webp`  | 4      | Wall on a vertical cell edge (see design notes below).         |
| `doorClosedH/0.webp`              | 1      | Closed wooden door; replaces a horizontal wall segment.        |
| `doorClosedV/0.webp`              | 1      | Closed wooden door; replaces a vertical wall segment.          |
| `doorOpenH/0.webp`                | 1      | Open variant of the horizontal door.                           |
| `doorOpenV/0.webp`                | 1      | Open variant of the vertical door.                             |
| `solidBlock/0.webp` … `5.webp`    | 6      | Full-cell thick walls — dressed stone block, sand-filled mass. |
| `rubble/0.webp` … `rubble/3.webp` | 4      | Decorative debris; partial-cell coverage with alpha.           |
| **Total**                         | **32** | Optional categories deferred to v2 (see below).                |

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
- **Baked maps** live as WebP images in Storage, referenced by `locations.map_url`. Published from Cartographer via Save to Atlas.
- **Tile packs** are versioned, schema-validated, WebP-only. Starter pack bundled; others from Storage.
- **Cells** carry per-cell pack references so a single map can mix themes cleanly (per-brush theme switching).
- **Walls** are **edge-based** by default (stored as `wallN` / `wallW` on floor cells, NW ownership). The `solidBlock` layer carries **cell-based** thick walls for masonry mass.
- **Doors** are edge state — they replace a wall segment on an edge.
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
| [src/views/cartographer/CartographerEditorView.vue](../../src/views/cartographer/CartographerEditorView.vue) | `/cartographer/new` + `/cartographer/:id` editor (canvas + toolbox + inspector) |

### Files modified in M1

- [src/lib/icons.ts](../../src/lib/icons.ts) — added `IconBrush`, `IconEraser`, `IconHand`, `IconWall`, `IconDoor`, `IconCube`.
- [src/router/routes.ts](../../src/router/routes.ts) — added three Cartographer routes.
- [src/stores/ui.ts](../../src/stores/ui.ts) — added `cartographerSearch`, `cartographerFilterPack`, `cartographerHasActiveFilters`, `resetCartographerFilters`.
- [src/views/dungeon-features/DungeonCraftView.vue](../../src/views/dungeon-features/DungeonCraftView.vue) — added the **Cartographer** tab (6th) with embedded map list.

### Placeholder-asset behaviour

The bundled Stone Dungeon pack ships a complete manifest but **no actual WebP files yet** — they're queued for the AI generation pipeline. The pack loader handles this gracefully:

1. `validatePack(manifest)` reports the manifest as valid (URLs are declared correctly).
2. `loadPack()` attempts to fetch each declared asset.
3. Any asset that 404s falls back to a **procedural placeholder tile** generated in [src/cartographer/placeholderTile.ts](../../src/cartographer/placeholderTile.ts).
4. Each placeholder's colour is derived from `hash(pack_id, category, side?, variant)` so variants stay stable across reloads.

When real WebP assets land at `public/cartographer/stone-dungeon/v1/floor/0.webp` etc., they replace the placeholders automatically — **no code change required**.

The editor displays a `Pack: stone-dungeon — N required slot(s) missing — using placeholders` warning in the inspector when the validator finds slots without art.

### Migration apply

The migration file is in place but **not yet applied to the remote Supabase project**. Run `supabase db push` from the project root when ready.

### M1 acceptance status

- [x] DB migration written (`dungeon_maps` + `locations.source_map_id`).
- [x] Tile pack schema + validator + loader in `src/cartographer/`.
- [x] Starter Stone pack manifest in `public/cartographer/stone-dungeon/v1/`.
- [x] List + editor views with floor brush, pan, zoom, per-cell hash variant.
- [x] Save/load via TanStack Query composable.
- [x] DC hub tab integration (6th tab).
- [x] Filter state in `useUiStore`.
- [x] Stale `pack_id` placeholder rendering.
- [ ] **Pending user action**: run `supabase db push` to apply migration.
- [ ] **Pending external work**: real WebP assets in the AI-gen pipeline.

### M2 acceptance status

- [x] Wall brush (W) — edge-hover targeting, drag runs, direction-lock, NW ownership.
- [x] Shift+click wall brush — wraps all 4 edges of the clicked cell.
- [x] Door tool (D) — click edge: place doorClosed; click doorClosed → doorOpen; click doorOpen → doorClosed; RMB → revert to wall.
- [x] Solid block tool (S) — paints `solidBlock` layer; flat-render in M2 (bitmask deferred to M3+).
- [x] Rectangle tool (R) — drag fills rect with floor; Shift+drag also wraps perimeter walls.
- [x] Line tool (L) — Bresenham floor line between two cells.
- [x] Fill bucket (F) — floods from cursor through non-solidBlock cells planting floor (2 000-cell cap).
- [x] Wrap walls (X) — floods the connected floor region and places walls on every boundary edge facing void.
- [x] Undo/redo — CommandStack (100-step cap); Ctrl+Z / Ctrl+Shift+Z; undo/redo buttons in status bar. Each stroke or one-shot action is one undo unit.
- [x] Corner joints — programmatic filled-square fallback at H+V intersections; routes to `wallJoint` pack art when available (classifyJoint: L_NE/SE/SW/NW, T_N/E/S/W, CROSS).
- [x] SolidBlock rendering — full-cell tile above floor, below edge walls.
- [x] Door rendering — wallN/wallW type-aware: picks doorClosedH/V or doorOpenH/V tile category.
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
| [vitest.config.ts](../../vitest.config.ts) | Vitest + happy-dom test config |

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
- [x] Per-object rotation: Q/E keyboard shortcuts + inspector buttons (0°/90°/180°/270°). Stored as `PackRef.rotation`.
- [x] Annotation tool (T) — click a cell to select it; inspector shows text input; label rendered on canvas centered in cell with drop-shadow.
- [x] Entity link tool (K) — click a cell to select it; inspector shows Note + Encounter pickers (EntityCombobox); blue dot rendered on linked cells.
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
- [src/components/locations/LocationEditor.vue](../../src/components/locations/LocationEditor.vue) — "Edit in Cartographer" link when `source_map_id` is set.

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
