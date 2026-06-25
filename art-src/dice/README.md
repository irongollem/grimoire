# Dice icons — source & regeneration

Custom hand-drawn polyhedral-dice glyphs, in the same style as the Campaign nav
glyphs (`art-src/nav-campaign/`) and crafting glyphs (`art-src/crafting/`).
Rendered as inline `<svg fill="currentColor">` via `glyph()` (`src/lib/glyph.ts`),
so they size from a class (`h-5 w-5`) and tint with the surrounding text colour.

The generated markup lives in `src/lib/diceGlyphs.generated.ts` (do not
hand-edit). It is wired into `src/lib/icons.ts` as `IconDie*` exports (and the
generic `IconDice`/`IconDiceRoll`, both pointing at the iconic d20). The
`DiceRoller` grid (`src/components/common/DiceRoller.vue`) consumes the per-die
glyphs.

## Source

- `source-sheet.png` — a 4×2 set; the 8 dice occupy cells 0–7 in order:
  d2 (coin), d4, d6, d8, d10, d12, d20, d100. Numerals on the numbered dice are
  negative space (white holes) and trace cleanly via potrace's even-odd fill.
- `image.png` — an alternative set (crafting + dice). Only its **d8** and
  **d100** are used (cleaner octahedron + circular percentile die); the rest is
  ignored. Its dice live in a single bottom row of 8.

The d8 and d100 entries in the generated module therefore come from `image.png`;
the other six come from `source-sheet.png`.

## Pipeline

Requires `imagemagick`, `potrace`, and node.

```sh
cd art-src/dice
rm -rf _work _trace && mkdir _work _trace

# 1. Gutter-aware slice the sheet into cells.
node segment.mjs source-sheet.png _work 4 2

# 2. Trace each cell (0–7) to a tight SVG named after its die.
cd _trace
i=0
for n in d2 d4 d6 d8 d10 d12 d20 d100; do
  magick "../_work/cell_$i.png" -colorspace Gray -threshold 50% -resize 200% t.pgm
  potrace t.pgm -s --tight -t 10 -a 1 -O 0.3 -o "$n.svg"
  i=$((i+1))
done

# 2b. Override d8 + d100 from image.png's bottom dice row (8 cols, glyphs only).
magick ../image.png -crop 1536x140+0+710 +repage ../_g.png
node ../segment.mjs ../_g.png ../_work2 8 1
magick ../_work2/cell_3.png -colorspace Gray -threshold 50% -resize 200% t.pgm
potrace t.pgm -s --tight -t 10 -a 1 -O 0.3 -o d8.svg
magick ../_work2/cell_7.png -colorspace Gray -threshold 50% -resize 200% t.pgm
potrace t.pgm -s --tight -t 10 -a 1 -O 0.3 -o d100.svg

# 3. Normalize into the shared 0 0 100 100 box + emit the TS data module.
node ../gen-glyphs.mjs ../../../src/lib/diceGlyphs.generated.ts \
  d2 d4 d6 d8 d10 d12 d20 d100
```

**Swapping one icon:** drop the new art in, re-trace that cell, re-run
`gen-glyphs.mjs` for the full list — the matching `DICE_GLYPHS` entry (and thus
the `IconDie*` export) updates automatically.
