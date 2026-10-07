---
name: glyph
description: Turn hand-drawn icon art from the maintainer's art-src/ dump into an app glyph — slice the sheet, pick the cell, trace it, add it to the generated glyph module, look at it, and wire it into icons.ts. Use when the user drops a glyph sheet or single icon image in art-src and asks for a nav, crafting, dice or damage-type icon, or to replace one.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Grep
  - Glob
---

# /glyph — from a drawn sheet to an app icon

The app's custom icons (Campaign nav, Workshop crafting disciplines, polyhedral
dice, damage types) are traced from hand-drawn art. The maintainer drops the art
in `art-src/`, a **local, gitignored dump** — none of it is in the repo. What is
committed is the output: a generated TS module of inline SVG markup (or, for
damage types, standalone SVGs). The deterministic steps are `scripts/glyphs/cli.ts`
(tested in `glyphTrace.test.ts`); this skill is the judgement around them.

| Set          | Generated output                              | Wired in                                                                  |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| `nav`        | `src/lib/navGlyphs.generated.ts`              | `src/lib/icons.ts` `IconNav*`, consumed by `src/lib/nav.ts`               |
| `nav-assets` | `src/lib/navGlyphs.assets.generated.ts`       | `src/lib/icons.ts`                                                        |
| `crafting`   | `src/lib/crafting/craftingGlyphs.generated.ts`| `src/lib/crafting/craftingIcons.ts` `IconCraft*`, `src/lib/crafting/disciplines.ts` |
| `dice`       | `src/lib/dice/diceGlyphs.generated.ts`        | `src/lib/dice/dieIcons.ts` `IconDie*` (d2-d12, d100), `DiceRoller.vue`, `QuickDiceWidget.vue` |
| `dice-d20`   | `src/lib/diceGlyphs.d20.generated.ts`         | `src/lib/icons.ts` `IconDice` / `IconDiceRoll`; `dieIcons.ts` re-exports it as `IconDie20` |
| damage types | `public/assets/damage-types/<type>.svg`       | `src/components/common/DamageIcon.vue`                                    |

**Where a glyph module is imported decides which chunk carries it.** `icons.ts`
has ~560 importers, so anything it imports lands in the entry chunk whole (a
bundler places a module in one chunk). That is why the nav sets (the sidebar is
on every page) and the d20 (17 consumers) are the only glyph data `icons.ts`
imports, and why crafting and the other dice sit in feature folders with their
own `*Icons.ts` that only their consumers import. A new glyph for a feature
that is not on every page goes in a feature-owned module, never in `icons.ts`.
The d20 is its own set so that replacing it does not pull the rest of the dice
into the entry; to redraw it use `add dice-d20 <traceDir> d20`.

Never hand-edit a generated module. `sources.md` beside this file records which
sheet and cell every existing glyph came from, and why rival candidates lost.

## Commands

Needs `magick` and `potrace` (both via Homebrew). Paths resolve against the
directory you run from; generated modules always land at their repo path.

```sh
npx tsx scripts/glyphs/cli.ts segment <sheet.png> <outDir> <cols> <rows>  # slice into cell_<i>.png, row-major
npx tsx scripts/glyphs/cli.ts add     <set> <traceDir> <name>             # splice ONE glyph in, others untouched
npx tsx scripts/glyphs/cli.ts module  <set> <traceDir> <name...>          # rewrite the whole set, in this order
npx tsx scripts/glyphs/cli.ts svg     <traceDir> <outDir> <name...>       # standalone SVGs (damage types)
npx tsx scripts/glyphs/cli.ts preview <set> <name> <out.png>              # render an entry, black on white
npx tsx scripts/glyphs/cli.ts optimize <set>                              # re-optimise a set's stored markup in place
npx tsx scripts/glyphs/cli.ts compare  <set> <beforeModule.ts>            # worst pixel difference vs an earlier copy
```

`add` is the normal case: the other glyphs' traces are long gone, so `module`
is only for when every trace of a set is to hand. Glyph names are object keys
and must be lowerCamel identifiers.

**Optimisation is built in.** `module` and `add` run every glyph through
`glyphOptimize.ts` (svgo: transforms baked, segments shortened, whitespace
gone), which roughly halves the path data. Each glyph takes the smallest of a
short ladder of settings that `glyphCompare.ts` renders identically at 24 and
96px (at most 12 pixels differing by more than 32 grey levels); a glyph whose
outline cannot take the rounding falls back to potrace's own integer
coordinates, which cannot differ. `optimize <set>` does the same to a module
that already exists, from the stored markup, and refuses to write if anything
moved. It is safe to re-run. To prove an optimisation against the original,
`git show <rev>:<module path> > /tmp/before.ts` then `compare <set> /tmp/before.ts`.

## Procedure

Work in `art-src/<folder>/_work` and `_trace` (gitignored with the rest of the
dump), or in your scratchpad.

1. **Find the art and the set.** Ask which file if the user did not say. A
   sheet of candidates ("five options for Sessions") means you will be choosing;
   a single image means you are not.

2. **Know the neighbours.** Read the target module's keys and the matching
   block of `src/lib/icons.ts`, and skim `sources.md`. A glyph must not repeat a
   shape that already means something else: the hourglass is Interlude, the
   pennant is Campaign, the tome is Reliquary/Journal.

3. **Slice.** `segment <sheet> _work/<name> <cols> <rows>`. Then **Read every
   cell PNG** and check none is clipped. `segment` cuts through gutter midpoints
   and is usually right, but decoration crossing a gutter (a banner's rod caps)
   defeats it; crop such a cell on its real gutters by hand instead
   (`magick sheet.png -crop WxH+X+Y +repage cell.png`).

4. **Choose, when there is a choice.** Recommend one cell with the reason in a
   line, and name what disqualifies the others (collisions from step 2, a reading
   that is wrong for the feature — the tombstone said "dead" for a Hall that also
   honours the retired). If the user did not name a pick, ask before tracing.

5. **Trace** the chosen cell to `_trace/<name>.svg`:

   ```sh
   magick cell.png -background white -flatten -colorspace Gray -threshold 50% -resize 200% _trace/t.pgm
   potrace _trace/t.pgm -s --tight -t 10 -a 1 -O 0.3 -o _trace/<name>.svg
   ```

   `-flatten` matters for art with transparency; `-threshold 50%` gives the
   crisp single-colour silhouette every set uses. (Damage types were traced
   without the threshold and with `-t 12`; keep that if you redo one.)

6. **Add it.** `add <set> _trace <name>` (replacing a glyph is the same command
   with the existing name). For a damage type, `svg _trace public/assets/damage-types <type>`.

7. **Look at it.** `preview <set> <name> <png>`, plus one or two neighbours from
   the same set, and Read them side by side (`magick a.png b.png +append both.png`).
   Check weight and fill against the neighbours, that negative space (numerals,
   a candle flame) survived, and that nothing was shaved. A bad trace is fixed by
   re-tracing, not by editing the module.

8. **Wire it** if the name is new: `export const IconNav<Name> = glyph(NAV_GLYPHS.<name>);`
   in its block of `src/lib/icons.ts` (crafting and per-die glyphs go in
   `src/lib/crafting/craftingIcons.ts` / `src/lib/dice/dieIcons.ts` instead) with a one-line comment naming the feature,
   issue and source sheet (as the Hearth and Fallen entries do), then use it
   where the feature needs it (`src/lib/nav.ts` for nav entries).

9. **Record it** in `sources.md`: the sheet, the cell, the issue, and why the
   rivals lost. That file is the only place this survives, since the sheet itself
   never enters the repo.

10. **Verify.** `npm run build` (it runs `vue-tsc -b` first) and `npm test`,
    then look at it in the running app at nav size, in light and dark.
