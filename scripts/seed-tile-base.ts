#!/usr/bin/env tsx
/**
 * Seeds the neutral base tile set into storage so the generator can read it (#904).
 *
 * The set is the geometry reference every pack is generated FROM: 21 tiles, one
 * per grid-bound `(category, side)`, authored as SVG in `src/assets/tile-base/`
 * and rasterised here. A pack-phase render is already an edit — `generateImage`
 * posts its `sourceImages` to `/v1/images/edits`, not `/generations` — so what
 * these supply is the thing an edit needs and never had: something relevant to
 * edit from.
 *
 * NOT A `library_tile_packs` ROW, and that is deliberate. This is not a pack: it
 * can never be published, would render as holes and grey slabs if it ever were,
 * and a row would put it in the admin panel's pack list as though it could be.
 * It lives under a reserved `_base/` prefix in the same bucket instead. The
 * bucket's select policy keys the first path segment against a *published pack's
 * row id* (`library_tile_packs_object_select`, 20260917224309), and `_base` is
 * not a uuid, so no client can read it through the storage API; the edge
 * function reads it as service role. That falls out of the existing policy
 * rather than needing a new one.
 *
 * Rasterising here rather than committing bitmaps keeps the SVG the single
 * source of truth. A geometry reference that can drift from its source is the
 * exact failure the set exists to prevent.
 *
 *   npm run seed-tile-base            # against whatever .env.local points at
 *   npm run seed-tile-base -- --dry   # render and report, upload nothing
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./lib/seed-helpers";

const SRC = path.resolve("src/assets/tile-base");
const BUCKET = "library-tile-packs";

/**
 * Bumped when the geometry changes in a way already-generated packs should not
 * silently inherit. Versioning the prefix rather than overwriting means a run
 * started against v1 keeps resolving v1 while v2 seeds alongside it.
 */
const BASE_VERSION = 1;

/**
 * References are sent at the size the model renders at. The proof-tile style
 * references were reduced to 256px because three full-resolution ones cost
 * about five times the tile they help produce (20260826215832) — whether the
 * same reduction preserves *geometry* as well as it preserved style is an open
 * question (#904), so this stays configurable rather than assumed.
 */
const RENDER_PX = 1024;

/** `wallSegmentH.svg` → `wallSegmentH`; `stairsUp-N.svg` → `stairsUp-N`. */
function objectPath(file: string): string {
  return `_base/v${BASE_VERSION}/${file.replace(/\.svg$/, "")}.webp`;
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const files = readdirSync(SRC).filter((f) => f.endsWith(".svg")).sort();
  if (!files.length) {
    console.error(`No SVGs in ${SRC}`);
    process.exit(1);
  }

  const supabase = dry
    ? null
    : (() => {
        const { supabaseUrl, serviceKey } = requireEnv();
        return createClient(supabaseUrl, serviceKey);
      })();

  let uploaded = 0;
  for (const file of files) {
    // `density` drives librsvg's rasterisation, not the output size — too low
    // and the gradients band and the arcs stair-step before the resize sees
    // them.
    const webp = await sharp(path.join(SRC, file), { density: 384 })
      .resize(RENDER_PX, RENDER_PX, { fit: "fill" })
      .webp({ quality: 92 })
      .toBuffer();

    const target = objectPath(file);
    if (!supabase) {
      console.log(`${target.padEnd(44)} ${(webp.byteLength / 1024).toFixed(1)} KB (dry)`);
      continue;
    }
    const { error } = await supabase.storage.from(BUCKET)
      .upload(target, webp, { contentType: "image/webp", upsert: true });
    if (error) {
      console.error(`${target}: ${error.message}`);
      process.exit(1);
    }
    uploaded += 1;
    console.log(`${target.padEnd(44)} ${(webp.byteLength / 1024).toFixed(1)} KB`);
  }

  console.log(
    dry
      ? `\n${files.length} tiles rendered at ${RENDER_PX}px — nothing uploaded (--dry).`
      : `\n${uploaded} tiles seeded to ${BUCKET}/_base/v${BASE_VERSION}/ at ${RENDER_PX}px.`,
  );
}

// Surfaced rather than swallowed: a half-seeded reference set generates packs
// whose geometry silently varies by category, which is worse than not running.
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
