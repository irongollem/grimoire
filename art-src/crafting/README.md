# Crafting discipline icons — source & regeneration

Custom hand-drawn glyphs for the **Workshop**'s crafting disciplines, in the
same style as the Campaign nav glyphs (`art-src/nav-campaign/`). Rendered as
inline `<svg fill="currentColor">` via `glyph()` (`src/lib/glyph.ts`), so they
size from a class (`h-5 w-5`) and tint with the surrounding text colour.

The generated markup lives in `src/lib/craftingGlyphs.generated.ts` (do not
hand-edit). It is wired into `src/lib/icons.ts` as `IconCraft*` exports and
consumed by `src/lib/crafting-disciplines.ts`.

## Source

- `source-sheet.png` — a 4×4 set; the 14 disciplines occupy cells 0–13 in the
  exact order of the `CraftingDiscipline` union (`src/types/crafting.types.ts`):
  alchemy, smithing, leathercraft, woodcraft, jewelcrafting, herbalism,
  poisoncraft, tinkering, cooking, scribing, brewing, weaving, masonry,
  painting. Cells 14–15 are empty.

## Pipeline

Requires `imagemagick`, `potrace`, and node.

```sh
cd art-src/crafting
rm -rf _work _trace && mkdir _work _trace

# 1. Gutter-aware slice the sheet into cells.
node segment.mjs source-sheet.png _work 4 4

# 2. Trace each cell (0–13) to a tight SVG named after its discipline.
cd _trace
i=0
for n in alchemy smithing leathercraft woodcraft jewelcrafting herbalism \
         poisoncraft tinkering cooking scribing brewing weaving masonry painting; do
  magick "../_work/cell_$i.png" -colorspace Gray -threshold 50% -resize 200% t.pgm
  potrace t.pgm -s --tight -t 10 -a 1 -O 0.3 -o "$n.svg"
  i=$((i+1))
done

# 3. Normalize into the shared 0 0 100 100 box + emit the TS data module.
node ../gen-glyphs.mjs ../../../src/lib/craftingGlyphs.generated.ts \
  alchemy smithing leathercraft woodcraft jewelcrafting herbalism \
  poisoncraft tinkering cooking scribing brewing weaving masonry painting
```

**Swapping one icon:** drop the new art in, re-trace that cell, re-run
`gen-glyphs.mjs` for the full list — the matching `CRAFTING_GLYPHS` entry (and
thus the `IconCraft*` export) updates automatically.

> `gen-glyphs.mjs` rewrites potrace's hard-coded black fill to `currentColor`
> and pads with `PAD = 6`. `segment.mjs` cuts through gutter midpoints, not band
> edges, to avoid clipping glyph extremities.
