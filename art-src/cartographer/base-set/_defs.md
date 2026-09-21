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

## Why these files are force-added

`art-src/` is gitignored wholesale (.gitignore:61) and individual sources are
force-added when they are authored input worth keeping — the same treatment
`art-src/crafting/gen-glyphs.mjs` and the 13 tracked SVGs elsewhere get. These
SVGs are the source of truth for every pack's geometry, so they are tracked:

    git add -f art-src/cartographer/base-set/*.svg art-src/cartographer/base-set/_defs.md

`raster/` stays untracked and is regenerated with
`node scripts/base-set-raster.mjs`. A geometry reference that can drift from
its source defeats the point of having one.
