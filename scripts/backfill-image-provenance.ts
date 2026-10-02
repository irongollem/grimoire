#!/usr/bin/env tsx
/**
 * Backfills `image_provenance` from the XMP packet inside stored images (#935).
 *
 * ## Why
 *
 * The registry is written at upload time, so every image stored before it
 * existed has no row. The truth for those is in the bytes: marking has embedded
 * an IPTC `trainedAlgorithmicMedia` packet in every generated image since
 * August 2026. The migration backfills what `image_generation_jobs` knows; this
 * script covers the rest and corrects the job-derived rows, because the packet
 * is authoritative (the job log hard-codes the provider in places).
 *
 * ## What it does
 *
 * 1. Pages through every image column in `IMAGE_COLUMNS`, with the service-role
 *    key, and resolves each URL to `(bucket id, object path)`.
 * 2. Collapses variants and duplicates to one target per `(bucket, stem)`, and
 *    fetches the ORIGINAL bytes of each (a `_w400.webp` variant is re-encoded
 *    and carries no packet, so the original is looked up under .webp, .jpeg and
 *    .png when only a variant is referenced).
 * 3. Sniffs the format, reads the packet, parses it. Concurrency is bounded,
 *    transient fetch errors are retried, and one bad URL never aborts the run.
 * 4. Diffs what it found against the registry into insert / correct / skip.
 *
 * ## Dry run by default
 *
 * Without `--write` nothing is written: it prints a summary and, with `--out`,
 * the per-image detail as JSON. The target is whatever `VITE_SUPABASE_URL`
 * names, printed before anything happens. A non-loopback target with `--write`
 * additionally requires `--yes-production`. Reads of a production project are
 * plain GETs, so a dry run against one is allowed.
 *
 * Usage:
 *   npm run backfill:image-provenance -- --out report.json
 *   npm run backfill:image-provenance -- --write --yes-production
 *
 * `--library-owner <uuid>` names the owner of canonical `srd/` art; by default
 * it is the app admin when exactly one exists. `--limit <n>` scans only the
 * first n images (a quick trial).
 */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LOCAL_BUCKETS } from "./dev-buckets.data.ts";
import { pooled } from "./lib/pool.ts";
import { readXmpFromJpeg, readXmpFromPng, readXmpFromWebp } from "../supabase/functions/_shared/provenance/embed.ts";
import { imageProvenanceStem } from "../supabase/functions/_shared/provenance/key.ts";
import { sniffImageFormat } from "../supabase/functions/_shared/provenance/sniff.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";
import { parseXmpPacket } from "../supabase/functions/_shared/provenance/xmp.ts";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINAL_EXTENSIONS = ["webp", "jpeg", "png"] as const;
const PAGE = 1000;
const UPSERT_BATCH = 200;
const FETCH_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENCY = 8;

/** One image column and whether its table carries an owner and an `id` to page by. */
interface ImageColumn {
  table: string;
  column: string;
  /** False for the canonical library tables, which have no `user_id`. */
  owned: boolean;
  /** False for tables without an `id` column: they are paged by the URL column itself. */
  hasId: boolean;
}

const col = (table: string, column: string, owned = true, hasId = true): ImageColumn => ({ table, column, owned, hasId });

/** Every text-URL image column that can hold an AI-generated image. Held equal to the local schema by hand: a missing column is reported at run time. */
export const IMAGE_COLUMNS: readonly ImageColumn[] = [
  col("npcs", "portrait_url"),
  col("npcs", "cutout_url"),
  col("npcs", "disguise_portrait_url"),
  col("monsters", "image_url"),
  col("monsters", "cutout_url"),
  col("items", "image_url"),
  col("items", "mundane_image_url"),
  col("spells", "image_url"),
  col("locations", "image_url"),
  col("locations", "map_url"),
  col("traps", "image_url"),
  col("puzzle_rooms", "image_url"),
  col("factions", "emblem_url"),
  col("campaigns", "group_portrait_url"),
  col("party_members", "portrait_url"),
  col("companions", "portrait_url"),
  col("deities", "portrait_url"),
  col("deities", "symbol_image_url"),
  col("pantheons", "emblem_url"),
  col("hall_of_heroes", "portrait_url"),
  col("hall_of_heroes", "disguise_portrait_url"),
  col("hall_of_heroes", "card_art_url"),
  col("dungeon_features", "image_url"),
  col("species", "image_url"),
  col("backgrounds", "image_url"),
  col("minis", "stylized_image_url"),
  col("library_art_defaults", "image_url", false),
  col("library_monster_art", "image_url"),
  col("library_monster_art", "cutout_url"),
  col("library_monster_art_canonical", "image_url", false, false),
  col("library_monster_art_canonical", "cutout_url", false, false),
  col("library_spell_art", "image_url"),
  col("library_spell_art_canonical", "image_url", false, false),
  col("image_generation_jobs", "image_url"),
];

const IMAGE_BUCKET_IDS: ReadonlySet<string> = new Set(
  LOCAL_BUCKETS.filter((b) => b.mimeTypes.some((m) => m.startsWith("image/"))).map((b) => b.id),
);

// ---------------------------------------------------------------------------
// Pure parts

export interface ImageRef {
  /** Bucket id, e.g. `npc-portraits`. */
  bucket: string;
  /** Object path as stored, extension and variant suffix included. */
  path: string;
}

/**
 * Resolves a stored URL to its bucket id and object path. Handles the origin
 * (`.../object/public/<bucket>/<path>`) and CDN (`/<bucket>/<path>`) shapes, as
 * `parsePublicUrl` does in the app. Null for anything outside an image bucket.
 */
export function parseImageUrl(url: string): ImageRef | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  for (const id of IMAGE_BUCKET_IDS) {
    const marker = `/object/public/${id}/`;
    const at = pathname.indexOf(marker);
    if (at !== -1) return { bucket: id, path: decodeURIComponent(pathname.slice(at + marker.length)) };
  }
  const rest = pathname.replace(/^\/+/, "");
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const bucket = rest.slice(0, slash);
  if (!IMAGE_BUCKET_IDS.has(bucket)) return null;
  return { bucket, path: decodeURIComponent(rest.slice(slash + 1)) };
}

/** True for `_w<digits>.<ext>` size variants, which are re-encoded and carry no packet. */
export function isVariantPath(path: string): boolean {
  return /_w\d+\.[A-Za-z0-9]+$/.test(path);
}

/**
 * The owner of a stored object. Canonical library art lives under `srd/` and
 * only the app admin may write there, so `libraryOwner` (the admin, when there
 * is exactly one) owns it; with none known it stays null rather than guessing.
 * Otherwise the first path segment when it is a uuid (user folders are
 * `{userId}/...`), else the owning row's `user_id`, else the library owner for
 * a row that has no owner of its own, else null.
 */
export function resolveOwner(path: string, rowUserId: string | null, libraryOwner: string | null = null): string | null {
  const first = path.split("/")[0];
  if (first === "srd") return libraryOwner;
  if (UUID.test(first)) return first.toLowerCase();
  return rowUserId ?? libraryOwner;
}

/** A distinct image, however many rows and size variants point at it. */
export interface Target {
  bucket: string;
  stem: string;
  /** Object paths seen for this stem that are originals (not `_w<digits>` variants). */
  originalPaths: string[];
  /** Origin of the first URL seen, to rebuild an original's URL from a variant's. */
  urlPrefix: string;
  owner: string | null;
  /** Column sources, for the report. */
  sources: string[];
}

export interface UrlRow {
  url: string;
  userId: string | null;
  source: string;
}

/** Collapses URL rows to one target per `(bucket, stem)`. */
export function collectTargets(rows: readonly UrlRow[], libraryOwner: string | null = null): { targets: Target[]; ignored: number } {
  const byKey = new Map<string, Target>();
  let ignored = 0;
  for (const row of rows) {
    const ref = parseImageUrl(row.url);
    if (!ref) {
      ignored++;
      continue;
    }
    const stem = imageProvenanceStem(ref.path);
    const key = `${ref.bucket}\u0000${stem}`;
    const owner = resolveOwner(ref.path, row.userId, libraryOwner);
    let target = byKey.get(key);
    if (!target) {
      target = { bucket: ref.bucket, stem, originalPaths: [], urlPrefix: urlPrefixOf(row.url, ref), owner, sources: [] };
      byKey.set(key, target);
    }
    if (target.owner === null) target.owner = owner;
    if (!isVariantPath(ref.path) && !target.originalPaths.includes(ref.path)) target.originalPaths.push(ref.path);
    if (!target.sources.includes(row.source)) target.sources.push(row.source);
  }
  return { targets: [...byKey.values()], ignored };
}

/** Everything in a stored URL before `<path>`, so an object URL can be rebuilt next to it. */
function urlPrefixOf(url: string, ref: ImageRef): string {
  const parsed = new URL(url);
  const encodedPath = ref.path.split("/").map(encodeURIComponent).join("/");
  const at = parsed.pathname.lastIndexOf(encodedPath);
  const before = at === -1 ? parsed.pathname.slice(0, parsed.pathname.lastIndexOf("/") + 1) : parsed.pathname.slice(0, at);
  return `${parsed.origin}${before}`;
}

/** The original-object URLs to try for a target, in order: known originals first, then stem + each extension. */
export function candidateUrls(target: Target): string[] {
  const paths = [...target.originalPaths, ...ORIGINAL_EXTENSIONS.map((ext) => `${target.stem}.${ext}`)];
  const unique = [...new Set(paths)];
  return unique.map((path) => `${target.urlPrefix}${path.split("/").map(encodeURIComponent).join("/")}`);
}

export type Verdict = "insert" | "correct" | "skip" | "no-owner";

export interface PlanEntry {
  bucket: string;
  stem: string;
  verdict: Verdict;
  provenance: AiProvenance;
  user_id: string | null;
  previous: AiProvenance | null;
}

export interface RegisteredRow {
  bucket: string;
  stem: string;
  user_id: string;
  provenance: AiProvenance;
}

export function sameProvenance(a: AiProvenance, b: AiProvenance): boolean {
  return (
    a.generatorType === b.generatorType &&
    a.provider === b.provider &&
    a.model === b.model &&
    a.generatedAt === b.generatedAt &&
    a.edited === b.edited
  );
}

/**
 * Diffs one found packet against the registry. The packet wins, with one
 * exception: `edited` never reverts to false, so a registry row that already
 * says edited keeps it even though the bytes (immutable) still say false.
 */
export function planEntry(
  target: Pick<Target, "bucket" | "stem" | "owner">,
  found: AiProvenance,
  registered: RegisteredRow | null,
): PlanEntry {
  const base = { bucket: target.bucket, stem: target.stem };
  if (registered) {
    const merged: AiProvenance = { ...found, edited: found.edited || registered.provenance.edited };
    if (sameProvenance(merged, registered.provenance)) {
      return { ...base, verdict: "skip", provenance: registered.provenance, user_id: registered.user_id, previous: registered.provenance };
    }
    return { ...base, verdict: "correct", provenance: merged, user_id: registered.user_id, previous: registered.provenance };
  }
  if (target.owner === null) {
    return { ...base, verdict: "no-owner", provenance: found, user_id: null, previous: null };
  }
  return { ...base, verdict: "insert", provenance: found, user_id: target.owner, previous: null };
}

/** The row the upsert sends for an insert or a correction. */
export function toRegistryRow(entry: PlanEntry): { bucket: string; stem: string; user_id: string; provenance: AiProvenance } {
  if (entry.user_id === null) throw new Error(`No owner for ${entry.bucket}/${entry.stem}`);
  return { bucket: entry.bucket, stem: entry.stem, user_id: entry.user_id, provenance: entry.provenance };
}

/** Reads the AI packet out of image bytes. Null when the image carries none, or is not a known format. */
export function readProvenanceFromBytes(bytes: Uint8Array): AiProvenance | null {
  const format = sniffImageFormat(bytes);
  const packet =
    format === "image/webp" ? readXmpFromWebp(bytes)
    : format === "image/png" ? readXmpFromPng(bytes)
    : format === "image/jpeg" ? readXmpFromJpeg(bytes)
    : null;
  return packet === null ? null : parseXmpPacket(packet);
}

export function isLoopbackUrl(url: string): boolean {
  return LOOPBACK.has(new URL(url).hostname);
}

// ---------------------------------------------------------------------------
// I/O shell

type FetchOutcome =
  | { kind: "bytes"; bytes: Uint8Array; url: string }
  | { kind: "missing" }
  | { kind: "error"; message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One URL, retrying network errors, 429 and 5xx. A 404 is final. */
async function fetchBytes(url: string): Promise<FetchOutcome> {
  let message = "";
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok) return { kind: "bytes", bytes: new Uint8Array(await response.arrayBuffer()), url };
      if (response.status === 404 || response.status === 400) return { kind: "missing" };
      message = `HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) return { kind: "error", message };
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (attempt < FETCH_ATTEMPTS) await sleep(250 * 2 ** attempt);
  }
  return { kind: "error", message };
}

/** The first candidate that has bytes. Missing everywhere is "missing"; any hard error is reported. */
async function fetchOriginal(target: Target): Promise<FetchOutcome> {
  let lastError: FetchOutcome | null = null;
  for (const url of candidateUrls(target)) {
    const outcome = await fetchBytes(url);
    if (outcome.kind === "bytes") return outcome;
    if (outcome.kind === "error") lastError = outcome;
  }
  return lastError ?? { kind: "missing" };
}

async function readImageUrls(client: SupabaseClient): Promise<{ rows: UrlRow[]; missingColumns: string[] }> {
  const rows: UrlRow[] = [];
  const missingColumns: string[] = [];
  for (const spec of IMAGE_COLUMNS) {
    const select = spec.owned ? `${spec.column}, user_id` : spec.column;
    const order = spec.hasId ? "id" : spec.column;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await client
        .from(spec.table)
        .select(select)
        .not(spec.column, "is", null)
        .order(order)
        .range(offset, offset + PAGE - 1);
      if (error) {
        // An undefined table or column is a schema difference to report, not a reason to stop.
        if (error.code === "42703" || error.code === "42P01" || error.code === "PGRST200" || error.code === "PGRST205") {
          missingColumns.push(`${spec.table}.${spec.column} (${error.code})`);
          break;
        }
        throw new Error(`Could not read ${spec.table}.${spec.column}: ${error.message}`);
      }
      const page = data as unknown as Record<string, string | null>[];
      for (const row of page) {
        const url = row[spec.column];
        if (typeof url === "string" && url !== "") {
          rows.push({ url, userId: spec.owned ? row.user_id : null, source: `${spec.table}.${spec.column}` });
        }
      }
      if (page.length < PAGE) break;
    }
  }
  return { rows, missingColumns };
}

/** Admin accounts, by the `app_metadata.role` claim `private.is_app_admin()` reads. */
async function findAdmins(client: SupabaseClient): Promise<string[]> {
  const admins: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    for (const user of data.users) if (user.app_metadata?.role === "admin") admins.push(user.id);
    if (data.users.length < 200) break;
  }
  return admins;
}

async function readRegistry(client: SupabaseClient): Promise<Map<string, RegisteredRow>> {
  const registry = new Map<string, RegisteredRow>();
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client
      .from("image_provenance")
      .select("bucket, stem, user_id, provenance")
      .order("bucket")
      .order("stem")
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Could not read image_provenance: ${error.message}`);
    for (const row of data as RegisteredRow[]) registry.set(`${row.bucket}\u0000${row.stem}`, row);
    if (data.length < PAGE) break;
  }
  return registry;
}

interface Report {
  target: string;
  mode: "dry-run" | "write";
  summary: Record<string, number>;
  missingColumns: string[];
  entries: PlanEntry[];
  unmarked: number;
  unreadable: { bucket: string; stem: string; reason: string }[];
  noOwner: { bucket: string; stem: string; sources: string[] }[];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      write: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      out: { type: "string" },
      "library-owner": { type: "string" },
      limit: { type: "string" },
    },
  });
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (npm run uses --env-file=.env.local).");
  }
  const loopback = isLoopbackUrl(url);
  const mode = values.write ? "write" : "dry-run";
  console.log(`Target: ${url} (${loopback ? "loopback" : "NOT loopback"})`);
  console.log(`Mode:   ${mode}`);
  if (values.write && !loopback && !values["yes-production"]) {
    throw new Error("Refusing to write to a non-loopback project without --yes-production.");
  }

  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let libraryOwner: string | null = null;
  const explicitOwner = values["library-owner"];
  if (explicitOwner !== undefined) {
    if (!UUID.test(explicitOwner)) throw new Error("--library-owner must be a uuid.");
    libraryOwner = explicitOwner.toLowerCase();
  } else {
    const admins = await findAdmins(client);
    if (admins.length === 1) libraryOwner = admins[0];
    else console.log(`Found ${admins.length} admin accounts, so canonical srd/ images are reported as "no owner". Pass --library-owner <uuid> to name one.`);
  }
  const limit = values.limit === undefined ? null : Number(values.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer.");

  const { rows, missingColumns } = await readImageUrls(client);
  const collected = collectTargets(rows, libraryOwner);
  const ignored = collected.ignored;
  const targets = limit === null ? collected.targets : collected.targets.slice(0, limit);
  const registry = await readRegistry(client);
  console.log(`Read ${rows.length} image URLs (${ignored} outside image buckets) -> ${targets.length} distinct images, ${registry.size} registered.`);

  const entries: PlanEntry[] = [];
  const unreadable: Report["unreadable"] = [];
  const noOwner: Report["noOwner"] = [];
  let unmarked = 0;
  let done = 0;
  await pooled(targets, CONCURRENCY, async (target) => {
    const outcome = await fetchOriginal(target);
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${targets.length}`);
    if (outcome.kind !== "bytes") {
      unreadable.push({ bucket: target.bucket, stem: target.stem, reason: outcome.kind === "missing" ? "404" : outcome.message });
      return;
    }
    const found = readProvenanceFromBytes(outcome.bytes);
    if (!found) {
      unmarked++;
      return;
    }
    const entry = planEntry(target, found, registry.get(`${target.bucket}\u0000${target.stem}`) ?? null);
    if (entry.verdict === "no-owner") noOwner.push({ bucket: target.bucket, stem: target.stem, sources: target.sources });
    entries.push(entry);
  });

  const count = (verdict: Verdict) => entries.filter((e) => e.verdict === verdict).length;
  const summary = {
    scanned: targets.length,
    marked: entries.length,
    alreadyRegisteredAndEqual: count("skip"),
    toInsert: count("insert"),
    toCorrect: count("correct"),
    unreadableOr404: unreadable.length,
    noOwner: count("no-owner"),
    unmarked,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (missingColumns.length > 0) console.log(`Columns not found: ${missingColumns.join(", ")}`);

  if (values.write) {
    const writes = entries.filter((e) => e.verdict === "insert" || e.verdict === "correct").map(toRegistryRow);
    for (let i = 0; i < writes.length; i += UPSERT_BATCH) {
      const batch = writes.slice(i, i + UPSERT_BATCH);
      const { error } = await client.from("image_provenance").upsert(batch, { onConflict: "bucket,stem" });
      if (error) throw new Error(`Upsert failed at batch ${i / UPSERT_BATCH}: ${error.message}`);
    }
    console.log(`Wrote ${writes.length} rows.`);
  } else {
    console.log("Dry run: nothing written. Re-run with --write to apply.");
  }

  if (values.out) {
    const report: Report = { target: url, mode, summary, missingColumns, entries, unmarked, unreadable, noOwner };
    writeFileSync(values.out, JSON.stringify(report, null, 2));
    console.log(`Detail written to ${values.out}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
