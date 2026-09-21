# Neutral base tile set — geometry references for pack generation

One SVG per category (per side, where sides differ geometrically). These are
**not shippable tiles**. Their only job is to be the best possible input to an
image edit that says "like this, but in <material>".

## The rule these are drawn to

Measured 21 Sep 2026 by restyling three candidate `doorOpenH` bases into two
dissimilar materials (weathered oak; wet sewer brick) on `gpt-image-2.5-flare`:

- **Flat vs shaded barely mattered.** Both transferred geometry equally well.
- **Explicit part articulation decided it.** Under oak, all candidates looked
  fine — "planks + iron banding" differentiates wall from leaf by itself. Under
  a uniform material the plain candidates collapsed: the door leaf became the
  same mossy slab as the wall, just lying at an angle. The candidate carrying
  hinge knuckles, a handle and an edge seam kept reading as a door.

So: **mark which parts are different things.** Material is exactly what gets
replaced, so it cannot be what distinguishes a leaf from a wall. Hardware,
seams and silhouette must.

`hazardPlaceholders.ts` reached the same conclusion independently for the
procedural fallbacks — "every shape uses a different SILHOUETTE, never just a
different fill colour" — which is the principle to carry into the glyph tiles.

## Conventions

- `viewBox 0 0 1024 1024` = exactly one grid cell.
- Wall band is 25% (`WALL_BAND_RATIO`), so y 384..640 for a horizontal band,
  centred on the gridline at 512. An edge tile is drawn straddling that line,
  covering half of each adjacent cell.
- Doorway opening is 50% of the cell: x 256..768.
- An open door's leaf is hinged at the opening's edge, is as long as the
  opening is wide, and swings 60° into the adjacent half-cell (reach 443px,
  inside the 512px available).
- Neutral greys only. No colour, no material identity — that is the part the
  generator replaces.
- **No annotation.** No text, no guide lines, no dimension marks. The previous
  `templates/` PNGs carried labels and red dashed guides; an edit reproduces
  those as painted art. That is why they were never usable.

## Where these live

`src/assets/tile-base/` — tracked like any other asset, beside
`src/assets/brands/`. They are authored source, not scratch: `art-src/` is a
gitignored dump for raw material, and an asset that must not drift has no
business in a folder the repo deliberately ignores.

Rasterise with `node scripts/base-set-raster.mjs`, which writes to
`dist/tile-base/` (already gitignored). The bitmaps are always derived — never
committed — so the SVG cannot silently disagree with what the generator sees.

## Progress

60 distinct geometries, one per `(category, side)` — variants of a category
share a shape, so `floor:0` and `floor:7` need one reference between them. That
is fewer files than a pack has slots (52-57) and they are authored once for
every pack ever generated.

| group | files | done |
|---|---|---|
| structural — floor, solidBlock, wallSegment H/V | 4 | yes |
| doors — closed and open, H/V | 4 | yes |
| joints — wallJoint, wallRoundJoint x4 | 5 | yes |
| stairs — up/down x4 sides | 8 | yes |
| scatter — rubble, debris | — | **not in the set** (see below) |
| objects — chest, barrel, table, statue, pillar, brazier | — | **not in the set** (see below) |
| hazards | 12 | no — convert `hazardPlaceholders.ts` |
| features | 11 | no — convert `featurePlaceholders.ts` |

The first eight are exactly the schema's REQUIRED categories, so every pack's
20 mandatory slots now has a geometry reference; everything remaining is an
optional category a pack may ship nothing for.

**`wallJoint` needs one file, not nine.** The renderer scales it to a
band-sized square at the grid intersection, full-bleed, so an L, a T and a
cross are the same shape — `side` tells the generator which walls to match
materially, not what to draw. Reference lookup should fall back from
`category:side` to `category`. `wallRoundJoint` is the opposite case: its
quarter-circle is carved from a different corner per side, so it genuinely
needs four.

## Validating a tile

A base tile is accepted on its RESTYLES, never on itself. Restyle it into two
materials with nothing in common and check the geometry and part boundaries
survive both. Under a sympathetic material everything passes — oak's planks and
iron banding differentiate a door from a wall by themselves — so a single
material tells you nothing.

Pass the footprint correctly when testing, mirroring `job.mechanics.alpha`:
a full-cell tile restyled under "make everything outside the shapes
transparent" comes back with holes punched through it and objects invented in
the gaps. That was a harness bug that briefly looked like a bad tile.

## What deliberately has no base tile

**Scatter and objects — rubble, debris, and the six `object*` categories.** A
reference would carry nothing they need. Their footprint is already imposed
downstream: `normalizeGeneratedTile` insets every `centered-overlay` tile by
10% and strips the boundary alpha whatever the model drew, so "centred, inside
the cell, transparent around it" is mechanical rather than something a
reference has to teach. And their shape is exactly where model diversity is
welcome — a pile of rubble does not have to fit anything, and forcing every
pack's rubble to one silhouette would make twelve packs look like one.

What they actually lack is distinct prompt text: `rubble` and `debris` share
`categoryRequest`'s fallback branch and so differ by a single noun, which is
why they generate as the same picture. That is #902, and no base tile fixes it.

**Hazards and features are the opposite case, despite also being overlays.**
Their job is to be distinguishable FROM EACH OTHER — a DM has to tell a pit
from a pressure plate from a tripwire at a glance on a 128px cell. That is a
functional requirement, not creative latitude, and describing 23 distinct small
shapes in prose is what a prompt is worst at. Hence references for these and
not for scatter.
