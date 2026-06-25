# Campaign nav icons — source & regeneration

Custom hand-drawn glyphs for the **Campaign** nav section (+ Reliquary),
replacing the generic Lucide icons. Rendered as inline `<svg fill="currentColor">`
via `glyph()` (`src/lib/glyph.ts`), so they size from a class (`h-5 w-5`) and tint
with the surrounding text colour — drop-in for the Lucide components in
`src/lib/icons.ts` (exported as `IconNav*`, wired in `src/lib/nav.ts`).

The generated markup lives in `src/lib/navGlyphs.generated.ts` (do not hand-edit).

## Sources

- `sheet 3 old.png` — the main 4×4 set; most glyphs come from here.
- `sheet 2.png` — 4×4 set; the **NPC** noble figure (cell 7) is taken from here.
- `note-lyre-library.png` — 3×1; **Soundboard** = lyre (cell 1), **Reliquary** = library (cell 2).
- `campaign.png` — a single bold pennant (pole + bands + swallowtail flag) for the **Campaign** switcher's active-campaign icon. Standalone image, so it's traced directly (no `segment.mjs`).

## Pipeline

Requires `imagemagick`, `potrace`, and node.

```sh
cd art-src/nav-campaign
rm -rf _work _trace && mkdir _work _trace

# 1. Gutter-aware slice each sheet (cuts through the white gaps so glyph
#    extremities aren't clipped — a fixed grid crop shaved scroll curls etc.)
node segment.mjs "sheet 3 old.png" _work/s3 4 4
node segment.mjs "sheet 2.png"     _work/s2 4 4
node segment.mjs note-lyre-library.png _work/nll 3 1

# 2. Trace each chosen cell to a tight SVG, e.g.
cd _trace
magick ../_work/s3/cell_0.png -colorspace Gray -resize 200% t.pgm
potrace t.pgm -s --tight -t 10 -a 1 -O 0.3 -o dashboard.svg
#   ...repeat per glyph (cell→name map in the commit that added them)

# 2b. The campaign banner is a standalone image — trace it directly.
magick ../campaign.png -background white -flatten -colorspace Gray -threshold 50% -resize 200% t.pgm
potrace t.pgm -s --tight -t 10 -a 1 -O 0.3 -o campaign.svg

# 3. Normalize all into the shared 0 0 100 100 box + emit the TS data module
node ../gen-glyphs.mjs ../../../src/lib/navGlyphs.generated.ts \
  dashboard notes calendar quests atlas pantheon factions npcs \
  encounters party workshop soundboard settings reliquary campaign
```

**Swapping one icon:** drop the new art in, re-trace that cell, re-run
`gen-glyphs.mjs` for the full list — the matching `NAV_GLYPHS` entry (and thus
the `IconNav*` export) updates automatically.

> `gen-glyphs.mjs` strips potrace's hard-coded black fill so the glyph inherits
> `currentColor`, and uses `PAD = 6` for breathing room. The `segment.mjs` loop
> uses gutter midpoints, not band edges, to avoid clipping.
