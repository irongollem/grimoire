#!/usr/bin/env tsx
/**
 * Puts the maintainer's painted stock parts on Book Nook's shelf (#1142): each PNG in the painter
 * folder becomes a WebP (alpha kept, longest side 1536 px) at `location-images/srd/nooks/<id>.webp`
 * on R2, and its `library_nook_parts` row is upserted with the CDN URL. Parts without a file are
 * left alone and listed as still to paint.
 *
 *   npm run nook:stock -- --check [--dir <path>]      # report only, local stack
 *   npm run nook:stock                                 # write to the local stack (needs R2 + CDN env)
 *   npm run nook:stock -- --production --yes-production   # the maintainer runs this himself
 *
 * Prints counts and part ids only; never a secret. A different object already at a key is replaced
 * only if its bytes differ (the key is the part id, so a repainted part is a deliberate update).
 */
import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { IMMUTABLE_CACHE_CONTROL, r2ConfigFrom, r2ObjectKey } from "../supabase/functions/_shared/r2/config.ts";
import { putObject, headObject } from "../supabase/functions/_shared/r2/client.ts";
import { assetCdnUrl } from "../supabase/functions/_shared/cdn-buckets.ts";
import { resolveServiceTarget, serviceHeaders } from "./lib/dev-stack.ts";
import { isCliEntry } from "./lib/cli.ts";
import { STOCK_PARTS, type StockPart } from "./book-nook-stock.data.ts";

export const BUCKET = "location-images";
export const MAX_SIDE = 1536;
export const DEFAULT_DIR = path.join(os.homedir(), "Desktop/art-955/scenes/out");

export function storagePath(id: string): string {
  return `srd/nooks/${id}.webp`;
}

/** Alpha below this (of 255) is haze the painter left round a thing, not the thing: it is cleared. */
export const HAZE_ALPHA = 15;
/** In a frame, everything joined to the middle and less opaque than this is the opening: high, because the painted checkerboard reached past half; the gilt rule round an opening is fully opaque. */
export const OPENING_ALPHA = 200;

/**
 * Cleans a part's alpha in place (RGBA bytes). Generated cut-outs keep a faint warm or green haze outside
 * their silhouette, which shows as a smudge on a room; it is cleared, leaving soft edges as painted. A frame's
 * opening must be fully clear, or the room is seen through a veil: the model painted a faint checkerboard into
 * the cameo's (5 Nov 2026), so the whole opening (the region joined to the middle that is not near-opaque) is
 * cleared, whatever was painted into it.
 */
export function cleanAlpha(rgba: Uint8Array, width: number, height: number, kind: "cutout" | "frame"): void {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < HAZE_ALPHA) rgba[i] = 0;
  if (kind !== "frame") return;
  const seen = new Uint8Array(width * height);
  const stack = [Math.floor(height / 2) * width + Math.floor(width / 2)];
  while (stack.length > 0) {
    const at = stack.pop() as number;
    if (seen[at]) continue;
    seen[at] = 1;
    if (rgba[at * 4 + 3] >= OPENING_ALPHA) continue;
    rgba[at * 4 + 3] = 0;
    const x = at % width;
    if (x > 0) stack.push(at - 1);
    if (x < width - 1) stack.push(at + 1);
    if (at >= width) stack.push(at - width);
    if (at < width * (height - 1)) stack.push(at + width);
  }
}

/** WebP with the alpha channel kept (and cleaned), no larger than MAX_SIDE on the longest side. */
export async function encodeWebp(png: Buffer, kind: "cutout" | "frame" = "cutout"): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  cleanAlpha(data, info.width, info.height, kind);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 })
    .toBuffer();
}

export function partRow(part: StockPart, imageUrl: string) {
  return {
    id: part.id,
    kind: part.kind,
    group_key: part.group_key,
    name: part.name,
    preset: part.preset,
    image_url: imageUrl,
    sort_order: part.sort_order,
  };
}

/** Which catalogue entries have a file in `dir` and which are still to paint. */
export function splitByFile(parts: readonly StockPart[], dir: string, exists: (p: string) => boolean = existsSync) {
  const present: StockPart[] = [];
  const missing: StockPart[] = [];
  for (const part of parts) (exists(path.join(dir, part.file)) ? present : missing).push(part);
  return { present, missing };
}

const md5 = (bytes: Uint8Array): string => createHash("md5").update(bytes).digest("hex");

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      dir: { type: "string", default: DEFAULT_DIR },
    },
  });
  const write = !values.check;
  if (write && values.production && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production.");
  }
  const dir = values.dir;
  const { present, missing } = splitByFile(STOCK_PARTS, dir);
  const target = resolveServiceTarget(values.production);
  console.log(`${write ? "Writing to" : "Checking"} ${target.label}; ${present.length} of ${STOCK_PARTS.length} parts painted in ${dir}.`);

  const cdnBase = (process.env.VITE_ASSET_CDN_URL ?? process.env.ASSET_CDN_URL)?.trim() ?? null;
  const r2 = r2ConfigFrom((k) => process.env[k]);
  if (write && (!cdnBase || r2 === null)) {
    throw new Error("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and the CDN base must be set to write.");
  }

  let uploaded = 0;
  let unchanged = 0;
  let upserted = 0;
  let failed = 0;
  for (const part of present) {
    try {
      const webp = await encodeWebp(readFileSync(path.join(dir, part.file)), part.kind);
      if (!write || r2 === null || cdnBase === null) continue;
      const key = r2ObjectKey(BUCKET, storagePath(part.id));
      const existing = await headObject(r2, key);
      const same = existing !== null && existing.etag !== null && existing.etag.replaceAll('"', "") === md5(webp);
      if (same) unchanged += 1;
      else {
        await putObject(r2, { key, body: webp, contentType: "image/webp", cacheControl: IMMUTABLE_CACHE_CONTROL });
        uploaded += 1;
      }
      const url = assetCdnUrl(BUCKET, storagePath(part.id), cdnBase);
      if (url === null) throw new Error("no CDN url");
      const res = await fetch(`${target.origin}/rest/v1/library_nook_parts?on_conflict=id`, {
        method: "POST",
        headers: serviceHeaders(target, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(partRow(part, url)),
      });
      if (!res.ok) throw new Error(`row write ${res.status}`);
      upserted += 1;
    } catch (error) {
      failed += 1;
      console.error(`${part.id}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  console.log(write ? `Uploaded ${uploaded}, already there ${unchanged}, rows upserted ${upserted}, failed ${failed}.` : `Would publish ${present.length} part(s); nothing written.`);
  console.log(`Still to paint (${missing.length}): ${missing.map((p) => p.id).join(", ") || "none"}`);
  if (failed > 0) process.exitCode = 1;
}

if (isCliEntry(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unexpected failure.");
    process.exit(1);
  });
}
