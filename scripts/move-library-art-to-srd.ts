#!/usr/bin/env tsx
/**
 * Moves canonical library art out of user folders and under `srd/` (#952, #978).
 *
 * ## Why
 *
 * Shared library art belongs under the admin-only `srd/` prefix and never under
 * a user uuid (CLAUDE.md, "Storage Path Convention"). 281 files broke that
 * rule, which is how a bulk delete under the admin's own folder destroyed the
 * files behind 117 references (#947).
 *
 * ## What it does
 *
 * Reads the source rows (`library_art_defaults.image_url` for items,
 * `library_monster_art_canonical.image_url` and `.cutout_url` for monsters,
 * `library_backgrounds.image_url` for backgrounds, `library_species.image_url`
 * for species), keeps those whose URL sits
 * in a user-uuid folder of a registered image bucket, and for each distinct
 * image:
 *
 * 1. fetches the old original (a 404 is a dead image: listed, nothing written);
 * 2. builds the new original: a real WebP is copied byte for byte, any other
 *    bytes (PNG, JPEG, or JPEG under a `.webp` name) are re-encoded to WebP at
 *    quality 85, with no resize;
 * 3. builds the four size variants from it (never upscaled, quality 80);
 * 4. carries the provenance packet through original and variants when the old
 *    original had one, and registers one `image_provenance` row for it;
 * 5. PUTs everything to R2 under `<bucket>/srd/<stem>[_wN].webp`, HEAD first,
 *    so an interrupted run resumes by running again. An object already there at
 *    another size is a failure, never an overwrite: `srd/` holds live art;
 * 6. only once every object is confirmed present by HEAD, updates the shared
 *    copies (`library_items`, `library_monsters`; backgrounds and species have none) whose
 *    URL equals the old one exactly, and the source row last. The source row is what makes an image a
 *    job, so it must be the last thing to change: updated first, a failure
 *    before the copies would leave them stale with no job left to finish them.
 *
 * Background art moves out of `asset-images`, where backgrounds uploaded until
 * #978 gave them `background-images`, into `background-images/srd/`. Species
 * art does the same into `species-images/srd/`: the Tome of Heroes pictures
 * carried over from the admin's vault copies when those were retired (#995).
 *
 * The per-user rows (`items`, `monsters`, `npcs`, `backgrounds`, ...) are never touched: the
 * old files stay where they are, so those rows keep working. **This script has
 * no delete path**: not an object, not a row.
 *
 * ## Dry run by default
 *
 * Without `--write` nothing is written and R2 is not contacted; it fetches the
 * old originals (plain GETs) to decide the encode and the marking. A non-loopback
 * project with `--write` additionally requires `--yes-production`.
 *
 * Usage:
 *   npm run library:move-art -- --out plan.json
 *   npm run library:move-art -- --limit 3 --write --yes-production --out first.json
 *
 * `--out` writes the full plan and result as JSON, including the old URL to new
 * URL of every image: it is the undo record. `--only <old file stem>` and
 * `--limit <n>` narrow a first small run. `--library-owner <uuid>` names the
 * owner of the provenance rows (default: the one admin). `--cdn-base <url>`
 * overrides `VITE_ASSET_CDN_URL`.
 */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { assetCdnUrl } from "../supabase/functions/_shared/cdn-buckets.ts";
import { embedXmpInWebp } from "../supabase/functions/_shared/provenance/embed.ts";
import { registerImageProvenance } from "../supabase/functions/_shared/provenance/register.ts";
import { sniffImageFormat } from "../supabase/functions/_shared/provenance/sniff.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";
import { buildXmpPacket } from "../supabase/functions/_shared/provenance/xmp.ts";
import { headObject, putObject } from "../supabase/functions/_shared/r2/client.ts";
import { IMMUTABLE_CACHE_CONTROL, r2ConfigFrom, r2ObjectKey, type R2Config } from "../supabase/functions/_shared/r2/config.ts";
import { fetchBytes, findAdmins, isLoopbackUrl, parseImageUrl, readProvenanceFromBytes } from "./backfill-image-provenance.ts";
import { variantPath, variantSize, VARIANT_WIDTHS } from "./generate-library-art.ts";
import { pooled } from "./lib/pool.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINAL_QUALITY = 85;
const VARIANT_QUALITY = 80;
const PAGE = 1000;
const CONCURRENCY = 4;

export type ArtKind = "item" | "monster" | "background" | "species";

/** The bucket each kind of canonical art lives in once moved. */
export const TARGET_BUCKET: Readonly<Record<ArtKind, string>> = {
  item: "item-images",
  monster: "monster-images",
  background: "background-images",
  species: "species-images",
};

interface ColumnSpec {
  table: string;
  column: string;
  kind: ArtKind;
}

/** Where the canonical URL is the source of truth, and the page key of the table. */
export const SOURCE_COLUMNS: readonly (ColumnSpec & { orderBy: string })[] = [
  { table: "library_art_defaults", column: "image_url", kind: "item", orderBy: "id" },
  { table: "library_monster_art_canonical", column: "image_url", kind: "monster", orderBy: "entry_id" },
  { table: "library_monster_art_canonical", column: "cutout_url", kind: "monster", orderBy: "entry_id" },
  { table: "library_backgrounds", column: "image_url", kind: "background", orderBy: "id" },
  { table: "library_species", column: "image_url", kind: "species", orderBy: "id" },
];

/**
 * The shared copies of the source URLs, edited by exact old URL after the move.
 * Backgrounds and species have none: `library_backgrounds` and `library_species`
 * are each both the source and the only copy.
 */
export const SHARED_COLUMNS: readonly ColumnSpec[] = [
  { table: "library_items", column: "image_url", kind: "item" },
  { table: "library_items", column: "mundane_image_url", kind: "item" },
  { table: "library_monsters", column: "image_url", kind: "monster" },
  { table: "library_monsters", column: "cutout_url", kind: "monster" },
];

// ---------------------------------------------------------------------------
// Pure parts: which rows qualify, and where they go

export interface Qualified {
  oldUrl: string;
  bucket: string;
  /** Old object path, e.g. `<uuid>/<stem>.png`. */
  path: string;
  /** The file name without its extension. */
  stem: string;
  extension: string;
  targetBucket: string;
  targetPath: string;
}

export type Disqualified = { skip: "already-srd" | "not-user-folder" | "unregistered-bucket" | "variant" };

/** The file stem of a path: its last segment without the extension. */
export function fileStem(path: string): { stem: string; extension: string } {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? { stem: name, extension: "" } : { stem: name.slice(0, dot), extension: name.slice(dot + 1).toLowerCase() };
}

/**
 * Whether a stored URL is canonical art in a user folder, and where it goes.
 * Only a first path segment that is a uuid qualifies; `srd/` is already home,
 * and a URL outside a registered image bucket is not ours to move.
 */
export function qualify(url: string, kind: ArtKind): Qualified | Disqualified {
  const ref = parseImageUrl(url);
  if (ref === null) return { skip: "unregistered-bucket" };
  const first = ref.path.split("/")[0];
  if (first === "srd") return { skip: "already-srd" };
  if (!UUID.test(first)) return { skip: "not-user-folder" };
  if (/_w\d+\.[A-Za-z0-9]+$/.test(ref.path)) return { skip: "variant" };
  const { stem, extension } = fileStem(ref.path);
  return {
    oldUrl: url,
    bucket: ref.bucket,
    path: ref.path,
    stem,
    extension,
    targetBucket: TARGET_BUCKET[kind],
    targetPath: `srd/${stem}.webp`,
  };
}

/** One distinct image to move: every old URL that points at the same target. */
export interface ImageJob {
  kind: ArtKind;
  targetBucket: string;
  targetPath: string;
  oldUrls: string[];
  /** Old file stems, for `--only`. */
  oldStems: string[];
  sources: string[];
}

export interface SourceRow {
  url: string;
  kind: ArtKind;
  source: string;
}

export interface Selection {
  jobs: ImageJob[];
  alreadyMoved: number;
  ignored: number;
}

/** Collapses source rows to one job per target `(bucket, path)`. Row order is kept. */
export function collectJobs(rows: readonly SourceRow[]): Selection {
  const byTarget = new Map<string, ImageJob>();
  let alreadyMoved = 0;
  let ignored = 0;
  for (const row of rows) {
    const q = qualify(row.url, row.kind);
    if ("skip" in q) {
      if (q.skip === "already-srd") alreadyMoved++;
      else ignored++;
      continue;
    }
    const key = `${q.targetBucket}\u0000${q.targetPath}`;
    let job = byTarget.get(key);
    if (!job) {
      job = { kind: row.kind, targetBucket: q.targetBucket, targetPath: q.targetPath, oldUrls: [], oldStems: [], sources: [] };
      byTarget.set(key, job);
    }
    if (!job.oldUrls.includes(q.oldUrl)) job.oldUrls.push(q.oldUrl);
    if (!job.oldStems.includes(q.stem)) job.oldStems.push(q.stem);
    if (!job.sources.includes(row.source)) job.sources.push(row.source);
  }
  return { jobs: [...byTarget.values()], alreadyMoved, ignored };
}

/** `--only` first, then `--limit`. An `--only` that names nothing is an error, not an empty run. */
export function selectJobs(jobs: readonly ImageJob[], opts: { only: string | null; limit: number | null }): ImageJob[] {
  let chosen = [...jobs];
  if (opts.only !== null) {
    chosen = chosen.filter((j) => j.oldStems.includes(opts.only as string));
    if (chosen.length === 0) throw new Error(`--only ${opts.only}: no image to move has that file stem.`);
  }
  return opts.limit === null ? chosen : chosen.slice(0, opts.limit);
}

export type EncodeDecision =
  | { action: "copy"; reason: string }
  | { action: "reencode"; reason: string };

/**
 * What to do with the old original, from its sniffed bytes and its extension.
 * A real WebP is copied whatever it is called; anything else becomes WebP.
 * Older files are JPEG bytes under a `.webp` name, which is why the bytes decide.
 */
export function decideEncode(bytes: Uint8Array, extension: string): EncodeDecision {
  const format = sniffImageFormat(bytes);
  if (format === "image/webp") return { action: "copy", reason: "already WebP" };
  if (format === "image/png") return { action: "reencode", reason: "PNG to WebP" };
  if (format === "image/jpeg") {
    return { action: "reencode", reason: extension === "webp" ? "JPEG bytes under a .webp name to WebP" : "JPEG to WebP" };
  }
  return { action: "reencode", reason: `unrecognised bytes (.${extension || "?"}) to WebP` };
}

/** The variant objects of an original: the same paths `uploadWithVariants` writes. */
export function variantPaths(originalPath: string): string[] {
  return VARIANT_WIDTHS.map((w) => variantPath(originalPath, w));
}

/** Rows whose URL equals one of the old URLs exactly. Never a prefix, never a name. */
export function selectRowsByExactUrl<T extends { url: string }>(rows: readonly T[], oldUrls: readonly string[]): T[] {
  const wanted = new Set(oldUrls);
  return rows.filter((r) => wanted.has(r.url));
}

export interface CliOptions {
  write: boolean;
  yesProduction: boolean;
  limit: number | null;
  only: string | null;
  out: string | null;
  libraryOwner: string | null;
  cdnBase: string | null;
}

export function parseCli(argv: readonly string[]): CliOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      write: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      limit: { type: "string" },
      only: { type: "string" },
      out: { type: "string" },
      "library-owner": { type: "string" },
      "cdn-base": { type: "string" },
    },
  });
  let limit: number | null = null;
  if (values.limit !== undefined) {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
  }
  const owner = values["library-owner"];
  if (owner !== undefined && !UUID.test(owner)) throw new Error("--library-owner must be a uuid.");
  return {
    write: values.write,
    yesProduction: values["yes-production"],
    limit,
    only: values.only ?? null,
    out: values.out ?? null,
    libraryOwner: owner === undefined ? null : owner.toLowerCase(),
    cdnBase: values["cdn-base"]?.trim() || null,
  };
}

/** A write needs `--yes-production` unless the project is loopback. */
export function assertMayWrite(opts: Pick<CliOptions, "write" | "yesProduction">, supabaseUrl: string): void {
  if (opts.write && !isLoopbackUrl(supabaseUrl) && !opts.yesProduction) {
    throw new Error("Refusing to write to a non-loopback project without --yes-production.");
  }
}

// ---------------------------------------------------------------------------
// Image building

export interface NewOriginal {
  bytes: Uint8Array;
  decision: EncodeDecision;
  /** The provenance the old original carried, or null for an unmarked one. */
  provenance: AiProvenance | null;
}

/** Marks WebP bytes with a provenance, or returns them unchanged for an unmarked image. */
function markIfNeeded(webp: Uint8Array, provenance: AiProvenance | null): Uint8Array {
  return provenance === null ? webp : embedXmpInWebp(webp, buildXmpPacket(provenance));
}

/** The new original from the old bytes: copied as is when already WebP, else re-encoded and re-marked. */
export async function buildNewOriginal(old: Uint8Array, extension: string): Promise<NewOriginal> {
  const provenance = readProvenanceFromBytes(old);
  const decision = decideEncode(old, extension);
  if (decision.action === "copy") return { bytes: old, decision, provenance };
  const webp = await sharp(old).webp({ quality: ORIGINAL_QUALITY }).toBuffer();
  return { bytes: markIfNeeded(new Uint8Array(webp), provenance), decision, provenance };
}

export interface MoveVariant {
  width: number;
  path: string;
  bytes: Uint8Array;
}

/** The four variants of the new original, never upscaled, each re-marked when the original is. */
export async function buildMoveVariants(original: Uint8Array, originalPath: string, provenance: AiProvenance | null): Promise<MoveVariant[]> {
  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read the original's dimensions.");
  const full = { width: meta.width, height: meta.height };
  return Promise.all(
    VARIANT_WIDTHS.map(async (width) => {
      const size = variantSize(full, width);
      const resized = await sharp(original).resize(size.width, size.height).webp({ quality: VARIANT_QUALITY }).toBuffer();
      return { width, path: variantPath(originalPath, width), bytes: markIfNeeded(new Uint8Array(resized), provenance) };
    }),
  );
}

// ---------------------------------------------------------------------------
// I/O shell

interface RowCount {
  table: string;
  column: string;
  count: number;
}

type JobStatus = "to-move" | "moved" | "dead" | "failed";

interface JobResult {
  kind: ArtKind;
  oldUrls: string[];
  newKey: string;
  newUrl: string | null;
  status: JobStatus;
  decision: string | null;
  marked: boolean;
  rows: RowCount[];
  objects: { key: string; result: "uploaded" | "skipped" | "would-upload" }[];
  error: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set (npm run uses --env-file=.env.local).`);
  return value;
}

/** Column does not exist on this project: a schema difference to report, not a reason to stop. */
function isMissingColumn(error: { code?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204";
}

async function readSourceRows(client: SupabaseClient): Promise<SourceRow[]> {
  const rows: SourceRow[] = [];
  for (const spec of SOURCE_COLUMNS) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await client
        .from(spec.table)
        .select(spec.column)
        .not(spec.column, "is", null)
        .order(spec.orderBy)
        .range(offset, offset + PAGE - 1);
      if (error) {
        if (isMissingColumn(error)) {
          console.log(`Column ${spec.table}.${spec.column} does not exist on this project; skipped.`);
          break;
        }
        throw new Error(`Could not read ${spec.table}.${spec.column}: ${error.message}`);
      }
      const page = data as unknown as Record<string, string | null>[];
      for (const row of page) {
        const url = row[spec.column];
        if (typeof url === "string" && url !== "") rows.push({ url, kind: spec.kind, source: `${spec.table}.${spec.column}` });
      }
      if (page.length < PAGE) break;
    }
  }
  return rows;
}

/** Every (table, column) the move touches for a job, with how many rows hold one of its old URLs. */
async function countRows(client: SupabaseClient, job: ImageJob): Promise<RowCount[]> {
  const columns = [...SOURCE_COLUMNS, ...SHARED_COLUMNS].filter((c) => c.kind === job.kind);
  const counts: RowCount[] = [];
  for (const spec of columns) {
    const { data, error } = await client.from(spec.table).select(spec.column).in(spec.column, job.oldUrls);
    if (error) {
      if (isMissingColumn(error)) continue;
      throw new Error(`Could not read ${spec.table}.${spec.column}: ${error.message}`);
    }
    const hits = (data as unknown as Record<string, string>[]).map((r) => ({ url: r[spec.column] }));
    const count = selectRowsByExactUrl(hits, job.oldUrls).length;
    if (count > 0) counts.push({ table: spec.table, column: spec.column, count });
  }
  return counts;
}

/**
 * The columns a job rewrites, in order: the shared copies, then the source rows.
 * Source rows come last because they are what `collectJobs` reads: while one
 * still holds the old URL, a re-run picks the job up again.
 */
export function updateOrder(kind: ArtKind): ColumnSpec[] {
  return [...SHARED_COLUMNS, ...SOURCE_COLUMNS].filter((c) => c.kind === kind);
}

/** Updates the shared copies, then the source rows, each by exact old URL. */
async function updateRows(client: SupabaseClient, job: ImageJob, newUrl: string): Promise<void> {
  const ordered = updateOrder(job.kind);
  for (const spec of ordered) {
    for (const oldUrl of job.oldUrls) {
      const { error } = await client.from(spec.table).update({ [spec.column]: newUrl }).eq(spec.column, oldUrl);
      if (error) {
        if (isMissingColumn(error)) continue;
        throw new Error(`Could not update ${spec.table}.${spec.column}: ${error.message}`);
      }
    }
  }
}

/** What to do about a target key, from what HEAD found there. Never an overwrite. */
export function putDecision(existingSize: number | null, newSize: number): "upload" | "skip" {
  if (existingSize === null) return "upload";
  if (existingSize === newSize) return "skip";
  throw new Error(`an object of ${existingSize} bytes is already there, and this one is ${newSize}; refusing to overwrite.`);
}

/** PUTs one object unless one of the same size is already there. A different one there is an error. */
async function putIfAbsent(r2: R2Config, key: string, bytes: Uint8Array): Promise<"uploaded" | "skipped"> {
  const existing = await headObject(r2, key);
  let decision: "upload" | "skip";
  try {
    decision = putDecision(existing === null ? null : existing.size, bytes.byteLength);
  } catch (error) {
    throw new Error(`${key}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (decision === "skip") return "skipped";
  await putObject(r2, { key, body: bytes, contentType: "image/webp", cacheControl: IMMUTABLE_CACHE_CONTROL });
  return "uploaded";
}

async function confirmPresent(r2: R2Config, key: string, size: number): Promise<void> {
  const existing = await headObject(r2, key);
  if (existing === null) throw new Error(`${key} is not in R2 after the upload.`);
  if (existing.size !== size) throw new Error(`${key} is ${existing.size} bytes in R2, expected ${size}.`);
}

interface Context {
  client: SupabaseClient;
  opts: CliOptions;
  cdnBase: string | null;
  r2: R2Config | null;
  owner: string | null;
}

async function fetchOldOriginal(job: ImageJob): Promise<{ bytes: Uint8Array; url: string } | { dead: string }> {
  let last = "404";
  for (const url of job.oldUrls) {
    const outcome = await fetchBytes(url);
    if (outcome.kind === "bytes") return { bytes: outcome.bytes, url };
    if (outcome.kind === "error") last = outcome.message;
  }
  return { dead: last };
}

async function processJob(ctx: Context, job: ImageJob): Promise<JobResult> {
  const newKey = r2ObjectKey(job.targetBucket, job.targetPath);
  const newUrl = assetCdnUrl(job.targetBucket, job.targetPath, ctx.cdnBase);
  const base = { kind: job.kind, oldUrls: job.oldUrls, newKey, newUrl, marked: false, decision: null, rows: [], objects: [], error: null };
  try {
    const old = await fetchOldOriginal(job);
    if ("dead" in old) return { ...base, status: "dead", error: old.dead };
    const sourceFile = fileStem(new URL(old.url).pathname);
    const original = await buildNewOriginal(old.bytes, sourceFile.extension);
    const rows = await countRows(ctx.client, job);
    const result = { ...base, decision: `${original.decision.action}: ${original.decision.reason}`, marked: original.provenance !== null, rows };
    if (!ctx.opts.write) {
      return { ...result, status: "to-move", objects: [{ key: newKey, result: "would-upload" }, ...variantPaths(job.targetPath).map((p) => ({ key: r2ObjectKey(job.targetBucket, p), result: "would-upload" as const }))] };
    }
    if (ctx.r2 === null || newUrl === null) throw new Error("R2 and the CDN base are required to write.");
    const variants = await buildMoveVariants(original.bytes, job.targetPath, original.provenance);
    const uploads = [
      { key: newKey, bytes: original.bytes },
      ...variants.map((v) => ({ key: r2ObjectKey(job.targetBucket, v.path), bytes: v.bytes })),
    ];
    const objects: JobResult["objects"] = [];
    for (const u of uploads) objects.push({ key: u.key, result: await putIfAbsent(ctx.r2, u.key, u.bytes) });
    // The database changes only once every object of the image is confirmed present.
    for (const u of uploads) await confirmPresent(ctx.r2, u.key, u.bytes.byteLength);
    if (original.provenance !== null) {
      if (ctx.owner === null) throw new Error("No provenance owner resolved.");
      await registerImageProvenance(ctx.client, job.targetBucket, job.targetPath, ctx.owner, original.provenance);
    }
    await updateRows(ctx.client, job, newUrl);
    return { ...result, status: "moved", objects };
  } catch (error) {
    return { ...base, status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

function printJob(r: JobResult): void {
  console.log(`${r.oldUrls.join("  |  ")}`);
  console.log(`  -> ${r.newUrl ?? "(no CDN base)"}  [${r.newKey}]`);
  if (r.status === "dead") return void console.log(`  DEAD: ${r.error}`);
  if (r.status === "failed") return void console.log(`  FAILED: ${r.error}`);
  console.log(`  encode: ${r.decision}; ${r.marked ? "marked" : "unmarked"}`);
  console.log(`  rows: ${r.rows.map((x) => `${x.table}.${x.column} x${x.count}`).join(", ") || "none"}`);
  if (r.status === "moved") console.log(`  objects: ${r.objects.map((o) => o.result).join(", ")}`);
}

async function main(): Promise<void> {
  const opts = parseCli(process.argv.slice(2));
  const url = requireEnv("VITE_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const loopback = isLoopbackUrl(url);
  console.log(`Target: ${url} (${loopback ? "loopback" : "NOT loopback"})`);
  console.log(`Mode:   ${opts.write ? "write" : "dry-run"}`);
  assertMayWrite(opts, url);

  const cdnBase = opts.cdnBase ?? process.env.VITE_ASSET_CDN_URL?.trim() ?? null;
  const r2 = r2ConfigFrom((k) => process.env[k]);
  if (opts.write) {
    if (!cdnBase) throw new Error("Refusing to write without a CDN base: set VITE_ASSET_CDN_URL or pass --cdn-base.");
    if (r2 === null) throw new Error("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must all be set to write.");
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let owner = opts.libraryOwner;
  if (opts.write && owner === null) {
    const admins = await findAdmins(client);
    if (admins.length !== 1) throw new Error(`Found ${admins.length} admin accounts; pass --library-owner <uuid> to name the owner of the provenance rows.`);
    owner = admins[0];
  }

  const rows = await readSourceRows(client);
  const collected = collectJobs(rows);
  const jobs = selectJobs(collected.jobs, { only: opts.only, limit: opts.limit });
  console.log(`Read ${rows.length} source URLs: ${collected.jobs.length} images to move, ${collected.alreadyMoved} already under srd/, ${collected.ignored} not in a user folder. Processing ${jobs.length}.`);

  const ctx: Context = { client, opts, cdnBase, r2, owner };
  const results: JobResult[] = [];
  const writeOut = (): void => {
    if (opts.out === null) return;
    writeFileSync(opts.out, JSON.stringify({ target: url, mode: opts.write ? "write" : "dry-run", results }, null, 2));
  };
  try {
    await pooled(jobs, CONCURRENCY, async (job) => {
      const result = await processJob(ctx, job);
      results.push(result);
      printJob(result);
      writeOut();
    });
  } finally {
    writeOut();
  }

  const byTable: Record<string, number> = {};
  for (const r of results) {
    for (const row of r.rows) {
      const name = `${row.table}.${row.column}`;
      byTable[name] = name in byTable ? byTable[name] + row.count : row.count;
    }
  }
  const count = (status: JobStatus) => results.filter((r) => r.status === status).length;
  const summary = {
    toMove: count("to-move"),
    moved: count("moved"),
    alreadyUnderSrd: collected.alreadyMoved,
    dead: count("dead"),
    failed: count("failed"),
    marked: results.filter((r) => r.marked).length,
    rowsByTable: byTable,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log(opts.write ? "Write run finished." : "Dry run: nothing written. Re-run with --write (and --yes-production on a hosted project) to apply.");
  if (opts.out !== null) console.log(`Detail written to ${opts.out}`);
  if (summary.failed > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
