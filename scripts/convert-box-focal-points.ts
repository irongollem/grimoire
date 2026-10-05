#!/usr/bin/env tsx
/**
 * Converts focal points set with the old 3:4-box picker into picture
 * percentages (#966).
 *
 * ## Why
 *
 * `FocalImage` reads a focal point as a percentage of the source picture. From
 * 110c4213 (28 Apr 2026) until 6d3d47a4 (4 Oct 2026, #965) `FocalPointPicker`
 * drew the picture `object-cover` in a fixed 3:4 box and stored the click as a
 * percentage of the box instead. On a picture taller than 3:4 the box crops top
 * and bottom, so a stored `y` sits too close to the middle; on a wider one the
 * same happens to `x`. Before 28 Apr the picker showed the whole picture, so
 * older points are already right.
 *
 * ## Which rows
 *
 * Only the user-owned tables. Every library focal point (canonical art and its
 * copies) was written by a script in picture percentages (the 3 Oct publish, the
 * 4 Oct vision pass, publish-time guesses) or re-checked in the fixed queue; an
 * audit of all of them on 5 Oct 2026 found none set through the box picker.
 *
 * A focal point carries no timestamp of its own, and every row's `updated_at`
 * has been bumped by bulk migrations since, so the row's `created_at` is the
 * proxy: a point is almost always set when the picture is added, which is when
 * the record is made. A row created inside the window is converted unless its
 * picture and point are exactly those of a row created before the window, which
 * makes it a copy (a campaign copy, the demo) of a point set with the old,
 * correct picker. A point at the centre does not move and is left alone.
 *
 * ## Dry run by default
 *
 * Without `--write` nothing is written; it reads the rows and fetches each
 * picture (the `_w400` variant where there is one) to learn its shape. A
 * non-loopback project with `--write` additionally requires `--yes-production`.
 * Each update is conditional on the stored value still being the planned old
 * one, so a point someone re-clicked since the plan is left alone.
 *
 * `--out` writes every planned change (table, id, column, old, new, aspect) as
 * JSON: it is the undo record. `--restore <file>` writes the old values from such
 * a record back, again only where the stored value is still the converted one.
 *
 * ## Applied once, on 5 Oct 2026
 *
 * The production run converted 160 points (median move 1 percentage point, 90th
 * percentile 4, largest 15 on a 3:2 picture), across four accounts. A
 * conversion is not idempotent: a second run would find the same rows in the
 * window and move them again. So a convert write to a non-loopback project is
 * refused; dry runs and `--restore` still work. The undo record of that run is
 * kept outside the repo (it names rows on other accounts, and the repo is public).
 *
 * Usage:
 *   npm run focal:convert-box -- --out plan.json
 *   npm run focal:convert-box -- --restore applied.json --write --yes-production
 */

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { fetchBytes, isLoopbackUrl } from "./backfill-image-provenance.ts";
import { variantPath } from "./generate-library-art.ts";
import { pooled } from "./lib/pool.ts";

/** The shape of the old picker's box, width / height. */
export const BOX_ASPECT = 3 / 4;
/** 110c4213 put the picture in the box. */
export const BOX_FROM = "2026-04-28T05:57:03Z";
/** 6d3d47a4 took it out again. */
export const BOX_UNTIL = "2026-10-03T23:44:20Z";
/** When the conversion ran against production; a second run would convert the same points twice. */
export const APPLIED_TO_PRODUCTION = "2026-10-05";

const PAGE = 1000;
const CONCURRENCY = 8;

export interface FocalPoint {
  x: number;
  y: number;
}

/** Every user-owned column a `FocalPointPicker` wrote, with the picture it was set on. */
export const TARGETS = [
  { table: "npcs", urlColumn: "portrait_url", focalColumn: "portrait_focal_point" },
  { table: "npcs", urlColumn: "disguise_portrait_url", focalColumn: "disguise_portrait_focal_point" },
  { table: "hall_of_heroes", urlColumn: "portrait_url", focalColumn: "portrait_focal_point" },
  { table: "hall_of_heroes", urlColumn: "disguise_portrait_url", focalColumn: "disguise_portrait_focal_point" },
  { table: "items", urlColumn: "image_url", focalColumn: "image_focal_point" },
  { table: "items", urlColumn: "mundane_image_url", focalColumn: "mundane_image_focal_point" },
  { table: "monsters", urlColumn: "image_url", focalColumn: "portrait_focal_point" },
  { table: "deities", urlColumn: "portrait_url", focalColumn: "portrait_focal_point" },
  { table: "species", urlColumn: "image_url", focalColumn: "focal_point" },
  { table: "party_members", urlColumn: "portrait_url", focalColumn: "portrait_focal_point" },
  { table: "traps", urlColumn: "image_url", focalColumn: "image_focal_point" },
  { table: "spells", urlColumn: "image_url", focalColumn: "image_focal_point" },
  { table: "companions", urlColumn: "portrait_url", focalColumn: "portrait_focal_point" },
] as const;

export type Target = (typeof TARGETS)[number];

export interface FocalRow {
  table: Target["table"];
  focalColumn: Target["focalColumn"];
  id: string;
  url: string | null;
  focal: FocalPoint;
  createdAt: string;
}

export interface Change {
  table: Target["table"];
  focalColumn: Target["focalColumn"];
  id: string;
  url: string;
  aspect: number;
  old: FocalPoint;
  new: FocalPoint;
}

// ---------------------------------------------------------------------------
// Pure parts

const clampPercent = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/**
 * A point clicked in the 3:4 box, as a percentage of the picture of aspect
 * `aspect` (width / height). The box showed the picture `object-cover` at the
 * default centred position, so on the cropped axis it showed the middle
 * `k` of the picture, where k is the ratio of the two aspects.
 */
export function boxToPicture(point: FocalPoint, aspect: number): FocalPoint {
  if (aspect < BOX_ASPECT) {
    const k = aspect / BOX_ASPECT;
    return { x: point.x, y: clampPercent(point.y * k + ((1 - k) / 2) * 100) };
  }
  if (aspect > BOX_ASPECT) {
    const k = BOX_ASPECT / aspect;
    return { x: clampPercent(point.x * k + ((1 - k) / 2) * 100), y: point.y };
  }
  return { ...point };
}

const pointKey = (url: string, focal: FocalPoint) => `${url} ${focal.x} ${focal.y}`;

export function inBoxWindow(createdAt: string): boolean {
  const t = Date.parse(createdAt);
  return t >= Date.parse(BOX_FROM) && t < Date.parse(BOX_UNTIL);
}

export interface Selection {
  candidates: FocalRow[];
  copies: FocalRow[];
  noPicture: FocalRow[];
}

/** The rows whose point was set through the box: created in the window, and not a copy of an older row's point. */
export function selectCandidates(rows: readonly FocalRow[]): Selection {
  const older = new Set(
    rows.filter((r) => r.url !== null && Date.parse(r.createdAt) < Date.parse(BOX_FROM)).map((r) => pointKey(r.url!, r.focal)),
  );
  const selection: Selection = { candidates: [], copies: [], noPicture: [] };
  for (const row of rows) {
    if (!inBoxWindow(row.createdAt)) continue;
    if (row.focal.x === 50 && row.focal.y === 50) continue;
    if (row.url === null) selection.noPicture.push(row);
    else if (older.has(pointKey(row.url, row.focal))) selection.copies.push(row);
    else selection.candidates.push(row);
  }
  return selection;
}

/** The changes for the candidates whose picture shape is known; a point that rounds back to itself is no change. */
export function planChanges(candidates: readonly FocalRow[], aspects: ReadonlyMap<string, number | null>): Change[] {
  const changes: Change[] = [];
  for (const row of candidates) {
    const aspect = row.url === null ? null : (aspects.get(row.url) ?? null);
    if (aspect === null) continue;
    const converted = boxToPicture(row.focal, aspect);
    if (converted.x === row.focal.x && converted.y === row.focal.y) continue;
    changes.push({ table: row.table, focalColumn: row.focalColumn, id: row.id, url: row.url!, aspect, old: row.focal, new: converted });
  }
  return changes;
}

/** The smaller picture to measure first: the `_w400` variant of a WebP original. Query strings are dropped. */
export function measureUrls(url: string): string[] {
  const bare = url.split("?")[0]!;
  return bare.endsWith(".webp") ? [variantPath(bare, 400), bare] : [bare];
}

export function isFocalPoint(value: unknown): value is FocalPoint {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as Record<string, unknown>;
  return typeof x === "number" && typeof y === "number";
}

export interface CliOptions {
  write: boolean;
  yesProduction: boolean;
  out: string | null;
  restore: string | null;
}

export function parseCli(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      write: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      out: { type: "string" },
      restore: { type: "string" },
    },
  });
  return {
    write: values.write ?? false,
    yesProduction: values["yes-production"] ?? false,
    out: values.out ?? null,
    restore: values.restore ?? null,
  };
}

export function assertMayWrite(opts: Pick<CliOptions, "write" | "yesProduction" | "restore">, supabaseUrl: string): void {
  if (!opts.write || isLoopbackUrl(supabaseUrl)) return;
  if (!opts.yesProduction) throw new Error("Refusing to write to a non-loopback project without --yes-production.");
  if (!opts.restore) {
    throw new Error(`Refusing to convert again: production was converted on ${APPLIED_TO_PRODUCTION}, and a second run would move the same points twice.`);
  }
}

// ---------------------------------------------------------------------------
// I/O shell

async function readRows(client: SupabaseClient, target: Target): Promise<FocalRow[]> {
  const rows: FocalRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(target.table)
      .select(`id, created_at, ${target.urlColumn}, ${target.focalColumn}`)
      .not(target.focalColumn, "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${target.table}.${target.focalColumn}: ${error.message}`);
    for (const raw of data as unknown as Record<string, unknown>[]) {
      const focal = raw[target.focalColumn];
      if (!isFocalPoint(focal)) throw new Error(`${target.table} ${String(raw.id)}: ${target.focalColumn} is not a point`);
      const url = raw[target.urlColumn];
      rows.push({
        table: target.table,
        focalColumn: target.focalColumn,
        id: String(raw.id),
        url: typeof url === "string" && url !== "" ? url : null,
        focal,
        createdAt: String(raw.created_at),
      });
    }
    if (data.length < PAGE) break;
  }
  return rows;
}

async function measure(url: string): Promise<number | null> {
  for (const candidate of measureUrls(url)) {
    const outcome = await fetchBytes(candidate);
    if (outcome.kind !== "bytes") continue;
    const { width, height } = await sharp(outcome.bytes).metadata();
    if (width && height) return width / height;
  }
  return null;
}

/** Writes `to` where the column still holds `from`; returns whether a row changed. */
async function swap(client: SupabaseClient, change: Change, from: FocalPoint, to: FocalPoint): Promise<boolean> {
  const { data, error } = await client
    .from(change.table)
    .update({ [change.focalColumn]: to })
    .eq("id", change.id)
    .eq(`${change.focalColumn}->>x`, String(from.x))
    .eq(`${change.focalColumn}->>y`, String(from.y))
    .select("id");
  if (error) throw new Error(`${change.table} ${change.id}: ${error.message}`);
  return data.length === 1;
}

async function apply(client: SupabaseClient, changes: readonly Change[], direction: "forward" | "restore") {
  let written = 0;
  const stale: Change[] = [];
  for (const change of changes) {
    const [from, to] = direction === "forward" ? [change.old, change.new] : [change.new, change.old];
    if (await swap(client, change, from, to)) written++;
    else stale.push(change);
  }
  console.log(`Written: ${written}; left alone (value changed since the plan): ${stale.length}`);
  for (const s of stale) console.log(`  ${s.table} ${s.id} ${s.focalColumn}`);
}

async function main() {
  const opts = parseCli(process.argv.slice(2));
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  console.log(`Target: ${url} (${isLoopbackUrl(url) ? "loopback" : "NOT loopback"})`);
  console.log(`Mode:   ${opts.restore ? "restore" : "convert"}, ${opts.write ? "write" : "dry-run"}`);
  assertMayWrite(opts, url);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (opts.restore) {
    const changes = JSON.parse(readFileSync(opts.restore, "utf8")) as Change[];
    console.log(`Restore record: ${changes.length} changes`);
    if (opts.write) await apply(client, changes, "restore");
    return;
  }

  const rows = (await Promise.all(TARGETS.map((t) => readRows(client, t)))).flat();
  const { candidates, copies, noPicture } = selectCandidates(rows);
  const urls = [...new Set(candidates.map((r) => r.url!))];
  const aspects = new Map<string, number | null>();
  await pooled(urls, CONCURRENCY, async (u) => {
    aspects.set(u, await measure(u));
  });
  const missing = candidates.filter((r) => aspects.get(r.url!) === null);
  const changes = planChanges(candidates, aspects);

  const moves = changes.map((c) => Math.hypot(c.new.x - c.old.x, c.new.y - c.old.y)).sort((a, b) => a - b);
  console.log(`Rows with a focal point: ${rows.length}`);
  console.log(`Set inside the box window: ${candidates.length + copies.length + noPicture.length}`);
  console.log(`  copies of an older point (kept): ${copies.length}`);
  console.log(`  no picture (kept): ${noPicture.length}`);
  console.log(`  picture unreachable (kept): ${missing.length}`);
  console.log(`  already right after rounding: ${candidates.length - missing.length - changes.length}`);
  console.log(`To convert: ${changes.length}`);
  if (moves.length) {
    const at = (p: number) => moves[Math.min(moves.length - 1, Math.floor(p * moves.length))]!.toFixed(1);
    console.log(`  move in percentage points: median ${at(0.5)}, p90 ${at(0.9)}, max ${at(1)}`);
  }
  for (const r of missing) console.log(`  unreachable: ${r.table} ${r.id} ${r.url}`);

  if (opts.out) {
    writeFileSync(opts.out, JSON.stringify(changes, null, 2));
    console.log(`Plan written to ${opts.out}`);
  }
  if (opts.write) await apply(client, changes, "forward");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
