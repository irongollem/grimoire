#!/usr/bin/env tsx
/**
 * Makes the grain (tooth) of the two handmade paper scans (#1181): greyscale, high-pass (the scan minus a blur
 * of about 8 px, so stains and tone go and only the fibre stays), stretched to the full 0-255 range, at the
 * scan's own size. The ten stock papers get theirs from stockAssets.ts; these two have no generated source.
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/paintbox/scanGrains.ts
 *
 * Run `npm run art:manifest` afterwards. Re-running reproduces the same bytes.
 */
import path from "node:path";
import sharp from "sharp";
import { isCliEntry } from "../lib/cli.ts";

export const SCAN_IDS = ["grey", "warm-grey"] as const;
const PAPERS_DIR = path.join(import.meta.dirname, "../../public/assets/papers");
const GRAINS_DIR = path.join(import.meta.dirname, "../../public/assets/paintbox/grains");
/** An 8 px radius is a gaussian sigma of 4. */
const BLUR_SIGMA = 4;
/** Mirrored margin, so the blur has pixels to read at the edge and the high-pass does not darken it. */
const MARGIN = 32;

/** Grey values, high-passed by `blurred` and stretched so the lowest is 0 and the highest 255. */
export function stretchedHighPass(grey: Uint8Array, blurred: Uint8Array): Uint8Array {
  const diff = new Float32Array(grey.length);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < grey.length; i++) {
    const d = grey[i]! - blurred[i]!;
    diff[i] = d;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const span = hi - lo || 1;
  const out = new Uint8Array(grey.length);
  for (let i = 0; i < grey.length; i++) out[i] = Math.round(((diff[i]! - lo) / span) * 255);
  return out;
}

export async function scanGrain(id: string): Promise<string> {
  const src = path.join(PAPERS_DIR, `${id}.webp`);
  const { data: grey, info } = await sharp(src).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  // sharp runs extract before extend inside one pipeline, so the margin is cut off in a second one.
  const wide = await sharp(grey, { raw: { width, height, channels: 1 } })
    .extend({ top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, extendWith: "mirror" })
    .blur(BLUR_SIGMA)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const padded = await sharp(wide.data, { raw: { width: wide.info.width, height: wide.info.height, channels: 1 } })
    .extract({ left: MARGIN, top: MARGIN, width, height })
    .raw()
    .toBuffer();
  const out = stretchedHighPass(grey, padded);
  await sharp(out, { raw: { width, height, channels: 1 } })
    .webp({ lossless: true })
    .toFile(path.join(GRAINS_DIR, `${id}.webp`));
  return `${id}: grain ${width}x${height}`;
}

if (isCliEntry(import.meta.url)) {
  for (const id of SCAN_IDS) console.log(await scanGrain(id));
}
