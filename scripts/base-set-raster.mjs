/**
 * Rasterise the neutral base tile set (art-src/cartographer/base-set/*.svg).
 *
 * The SVGs are the source of truth — hand-authored, diffable, and reviewable in
 * a PR. The bitmaps are derived, which is why they are gitignored: a geometry
 * reference that can drift from its source is the exact failure this set exists
 * to prevent.
 *
 * Rendered with sharp (librsvg), not a browser, so the output is deterministic
 * and reproducible in CI.
 *
 *   node scripts/base-set-raster.mjs [--size 1024]
 */
import { readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SRC = "art-src/cartographer/base-set";
const OUT = join(SRC, "raster");
const sizeArg = process.argv.indexOf("--size");
const SIZE = sizeArg > -1 ? Number(process.argv[sizeArg + 1]) : 1024;

mkdirSync(OUT, { recursive: true });
const svgs = readdirSync(SRC).filter((f) => f.endsWith(".svg")).sort();
if (!svgs.length) { console.error(`no SVGs in ${SRC}`); process.exit(1); }

for (const file of svgs) {
  const name = file.replace(/\.svg$/, "");
  const png = join(OUT, `${name}.png`);
  await sharp(join(SRC, file), { density: 384 })
    .resize(SIZE, SIZE, { fit: "fill" })
    .png()
    .toFile(png);
  const { width, height, channels } = await sharp(png).metadata();
  console.log(`${name.padEnd(16)} ${width}x${height} ch=${channels}`);
}
console.log(`\n${svgs.length} tiles -> ${OUT} at ${SIZE}px`);
