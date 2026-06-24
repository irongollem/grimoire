# Damage-type icons — source & regeneration

Final assets ship from `public/assets/damage-types/<type>.svg` (one per
`DamageType` in `src/types/damage.types.ts`). They are single-colour silhouettes
rendered as CSS masks by `src/components/common/DamageIcon.vue`, so they inherit
`currentColor` and a shared `0 0 100 100` viewBox.

This folder holds the non-shipped source art and the build pipeline.

- `source-sheet.png` — the approved 4×4 sheet (black silhouettes on white),
  laid out row-major: acid, bludgeoning, cold, fire / force, lightning,
  necrotic, piercing / poison, psychic, radiant, slashing / thunder.
- `normalize.mjs` — wraps each tight potrace trace into the shared 100×100 box,
  centered with 10-unit padding.

## Regenerate

Requires `imagemagick` and `potrace`.

```sh
cd art-src/damage-types
mkdir -p _work && cd _work
magick ../source-sheet.png -crop 4x4@ +repage cell_%d.png

names=(acid bludgeoning cold fire force lightning necrotic piercing \
       poison psychic radiant slashing thunder)
i=0
for n in "${names[@]}"; do
  magick "cell_$i.png" -colorspace Gray -resize 200% "$n.pgm"
  potrace "$n.pgm" -s --tight -t 12 -a 1 -O 0.3 -o "$n.svg"
  i=$((i+1))
done

# normalize to shared viewBox -> writes public/assets/damage-types/*.svg
node ../normalize.mjs
cd .. && rm -rf _work
```

> Note: the loop uses an explicit counter because zsh arrays are 1-indexed —
> `${names[$i]}` with `i=0` would be empty and shift every name.

`normalize.mjs` reads traces from the current directory and resolves its output
to `public/assets/damage-types/` relative to its own location, so it lands the
SVGs correctly no matter where you invoke it.
