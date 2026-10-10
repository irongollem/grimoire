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
 *   npm run backfill:image-provenance -- --library-is-ai --write --yes-production
 *
 * `--fail-on-dead` (#952) makes the scan a check: after it, exit with status 1 when
 * any referenced image is unreadable, naming each one's bucket, stem and the
 * table.column that references it. Two kinds are reported apart because they can
 * be repaired, and count as dead all the same: an original that is gone while its
 * `_w600.webp` variant survives (restore it from the variant), and a referenced
 * file that is gone while the same image survives under another extension
 * (re-point the row). The second is checked per referenced file, not per image:
 * the scan itself is satisfied by any original of a stem, which is right for
 * reading a mark and would hide a dead `.png` behind a live `.webp`.
 * `npm run check:images` is this, as a dry run.
 *
 * `--library-is-ai` is a one-off backfill of the canonical `srd/` art that
 * existed on 10 Oct 2026: an image that carries no packet, has no row and was
 * uploaded before `LIBRARY_AI_CUTOFF` is recorded as OpenAI image output
 * (`libraryArtProvenance`). That art was made by Dungeon Grimoire with OpenAI's
 * image models, most of it before marking began, so its bytes cannot say so;
 * the maintainer's call (10 Oct 2026). It is bounded by date, not a rule that
 * unmarked library art is AI, because the hope is to pay artists for library
 * art one day and their work must never be labelled AI by default. An image
 * with no Last-Modified cannot be placed before the cutoff and is left alone,
 * and a row already in the registry is never touched. The recorded date is the
 * Last-Modified of the original a row points at, and only when it postdates the
 * bulk copy into R2 (`R2_COPY_COMPLETED`); any other answer (a guessed sibling
 * extension, a copy-time stamp) records the art as AI with an unknown date. The
 * dry run reports both counts (`libraryArtDatedByOriginal`, `libraryArtDateUnknown`).
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
  // The shared content tables hold their own copy of the art URL (seeded from
  // the defaults and canonical tables above, and edited since), so they are
  // read too rather than assumed equal to their sources.
  col("library_monsters", "image_url", false),
  col("library_spells", "image_url", false),
  col("library_items", "image_url", false),
  col("library_items", "mundane_image_url", false),
  col("library_species", "image_url", false),
  col("library_backgrounds", "image_url", false),
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
  return unique.map((path) => pathUrl(target, path));
}

/** The URL of an object path next to where the target's first URL was stored. */
function pathUrl(target: Pick<Target, "urlPrefix">, path: string): string {
  return `${target.urlPrefix}${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * The originals some row actually points at, other than the one just read.
 * `candidateUrls` is satisfied by any original of the stem; these are the ones
 * that must each resolve for no stored link to be dead.
 */
export function otherReferencedOriginals(target: Pick<Target, "originalPaths" | "urlPrefix">, readUrl: string): { path: string; url: string }[] {
  return target.originalPaths.map((path) => ({ path, url: pathUrl(target, path) })).filter((o) => o.url !== readUrl);
}

/** The variant used to tell "restorable" from "gone": the largest one the app writes. */
const SURVIVOR_VARIANT = "_w600.webp";

/** The URL of a target's `_w600.webp` variant, next to where its original lives. */
export function survivorVariantUrl(target: Pick<Target, "stem" | "urlPrefix">): string {
  return pathUrl(target, `${target.stem}${SURVIVOR_VARIANT}`);
}

/** One image that could not be read, and what references it. */
export interface Unreadable {
  bucket: string;
  stem: string;
  reason: string;
  /** `table.column` of every column that references this image. */
  sources: string[];
  /**
   * What is left of the image: `sibling` when another original of the same stem
   * reads (only the files in `deadPaths` are gone), `variant` when no original
   * reads but the `_w600.webp` variant does, `none` when nothing does.
   */
  survivor: "sibling" | "variant" | "none";
  /** The referenced object paths that do not resolve. Set for a `sibling` survivor. */
  deadPaths: string[];
}

export interface UnreadableByKind {
  fullyDead: Unreadable[];
  originalMissingVariantSurvives: Unreadable[];
  referenceDeadSiblingSurvives: Unreadable[];
}

/** Splits unreadable images into the fully dead and the two repairable kinds. */
export function categorizeUnreadable(unreadable: readonly Unreadable[]): UnreadableByKind {
  return {
    fullyDead: unreadable.filter((u) => u.survivor === "none"),
    originalMissingVariantSurvives: unreadable.filter((u) => u.survivor === "variant"),
    referenceDeadSiblingSurvives: unreadable.filter((u) => u.survivor === "sibling"),
  };
}

/** The lines `--fail-on-dead` prints: one per unreadable image, naming bucket, stem and referencing columns. */
export function deadReportLines(unreadable: readonly Unreadable[]): string[] {
  const { fullyDead, originalMissingVariantSurvives, referenceDeadSiblingSurvives } = categorizeUnreadable(unreadable);
  const line = (u: Unreadable) => `  ${u.bucket}/${u.stem}  (${u.reason})  referenced by ${u.sources.join(", ")}`;
  const fileLine = (u: Unreadable) => `  ${u.deadPaths.map((path) => `${u.bucket}/${path}`).join(", ")}  (${u.reason})  one of the files referenced by ${u.sources.join(", ")}`;
  const lines: string[] = [];
  if (fullyDead.length > 0) lines.push(`Dead (no original, no variant): ${fullyDead.length}`, ...fullyDead.map(line));
  if (originalMissingVariantSurvives.length > 0) {
    lines.push(`Original missing, _w600 variant survives (restorable): ${originalMissingVariantSurvives.length}`, ...originalMissingVariantSurvives.map(line));
  }
  if (referenceDeadSiblingSurvives.length > 0) {
    lines.push(
      `Referenced file missing, the same image survives under another extension (re-point the row): ${referenceDeadSiblingSurvives.length}`,
      ...referenceDeadSiblingSurvives.map(fileLine),
    );
  }
  return lines;
}

/** Exit status of the scan: 1 only when `--fail-on-dead` is set and any referenced image is unreadable. */
export function deadExitCode(failOnDead: boolean, unreadable: readonly Unreadable[]): 0 | 1 {
  return failOnDead && unreadable.length > 0 ? 1 : 0;
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

/**
 * What the `--library-is-ai` default actually records: only the library images
 * it labelled whose verdict is insert or correct, the rows `--write` sends. An
 * image labelled AI but stopped at "no owner" is written nowhere and is already
 * listed under `noOwner`, so counting it here would report a backfill as done
 * that wrote nothing.
 */
export function libraryArtCounts(
  entries: readonly PlanEntry[],
  defaulted: ReadonlySet<string>,
): { libraryArtRecordedAsAi: number; libraryArtDatedByOriginal: number; libraryArtDateUnknown: number } {
  const recorded = entries.filter(
    (e) => (e.verdict === "insert" || e.verdict === "correct") && defaulted.has(`${e.bucket}\u0000${e.stem}`),
  );
  const unknown = recorded.filter((e) => e.provenance.generatedAt === UNKNOWN_GENERATED_AT).length;
  return {
    libraryArtRecordedAsAi: recorded.length,
    libraryArtDatedByOriginal: recorded.length - unknown,
    libraryArtDateUnknown: unknown,
  };
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

/** True for canonical library art, which only the admin can write. */
export function isLibraryStem(stem: string): boolean {
  return stem.startsWith("srd/");
}

/** `--library-is-ai` covers only canonical art uploaded before this instant (see the header). */
export const LIBRARY_AI_CUTOFF = new Date("2026-10-11T00:00:00Z");

/**
 * The R2 migration (#577) copied every existing object into R2 in bulk and
 * finished on 7 Aug 2026. The CDN serves R2, so an object older than that
 * answers with the copy's Last-Modified, not its upload. A Last-Modified before
 * this instant therefore dates nothing; one after it is a direct upload.
 */
export const R2_COPY_COMPLETED = new Date("2026-08-08T00:00:00Z");

/** `generatedAt` for art whose generation date cannot be read. The registry only requires the key; the badge omits the "Generated" line for an empty value. */
export const UNKNOWN_GENERATED_AT = "";

/**
 * The record `--library-is-ai` gives canonical art with no packet: OpenAI image
 * output. Null when the Last-Modified is missing, unreadable or not before the
 * cutoff: that image is not part of the backfill.
 *
 * The date is the object's Last-Modified (its upload, the nearest thing to a
 * generation date the bytes keep) only when that header dates the original:
 * `datesOriginal` is true when it came from an object a row actually points at
 * (not a guessed sibling extension that may be a later re-upload), and the
 * value is after the bulk copy into R2. Otherwise the art is still recorded as
 * AI (it is, and leaving it unlabelled would be the worse error) but with an
 * unknown generation date rather than a wrong one.
 */
export function libraryArtProvenance(lastModified: string | null, datesOriginal: boolean): AiProvenance | null {
  const date = lastModified ? new Date(lastModified) : null;
  if (!date || isNaN(date.getTime()) || date >= LIBRARY_AI_CUTOFF) return null;
  const dated = datesOriginal && date >= R2_COPY_COMPLETED;
  return {
    generatorType: "library-art",
    provider: "openai",
    model: "gpt-image",
    generatedAt: dated ? date.toISOString() : UNKNOWN_GENERATED_AT,
    edited: false,
  };
}

/** True when `url` is one of the objects a row points at, so its headers describe the original and not a guessed sibling. */
export function isReferencedOriginal(target: Pick<Target, "originalPaths" | "urlPrefix">, url: string): boolean {
  return target.originalPaths.some((path) => pathUrl(target, path) === url);
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

export type FetchOutcome =
  | { kind: "bytes"; bytes: Uint8Array; url: string; lastModified: string | null }
  | { kind: "missing" }
  | { kind: "error"; message: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One URL, retrying network errors, 429 and 5xx. A 404 is final. */
export async function fetchBytes(url: string): Promise<FetchOutcome> {
  let message = "";
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.ok) {
        return { kind: "bytes", bytes: new Uint8Array(await response.arrayBuffer()), url, lastModified: response.headers.get("last-modified") };
      }
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
export async function findAdmins(client: SupabaseClient): Promise<string[]> {
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
  unreadable: Unreadable[];
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
      "fail-on-dead": { type: "boolean", default: false },
      "library-is-ai": { type: "boolean", default: false },
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
  const libraryDefaulted = new Set<string>();
  let done = 0;
  await pooled(targets, CONCURRENCY, async (target) => {
    const outcome = await fetchOriginal(target);
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${targets.length}`);
    if (outcome.kind !== "bytes") {
      const variant = await fetchBytes(survivorVariantUrl(target));
      unreadable.push({
        bucket: target.bucket,
        stem: target.stem,
        reason: outcome.kind === "missing" ? "404" : outcome.message,
        sources: target.sources,
        survivor: variant.kind === "bytes" ? "variant" : "none",
        deadPaths: [],
      });
      return;
    }
    // The image exists. Each other file a row points at must resolve too.
    const deadPaths: string[] = [];
    for (const other of otherReferencedOriginals(target, outcome.url)) {
      if ((await fetchBytes(other.url)).kind !== "bytes") deadPaths.push(other.path);
    }
    if (deadPaths.length > 0) {
      unreadable.push({ bucket: target.bucket, stem: target.stem, reason: "404", sources: target.sources, survivor: "sibling", deadPaths });
    }
    const registered = registry.get(`${target.bucket}\u0000${target.stem}`) ?? null;
    let found = readProvenanceFromBytes(outcome.bytes);
    if (!found && values["library-is-ai"] && isLibraryStem(target.stem) && !registered) {
      found = libraryArtProvenance(outcome.lastModified, isReferencedOriginal(target, outcome.url));
      if (found) {
        libraryDefaulted.add(`${target.bucket}\u0000${target.stem}`);
      }
    }
    if (!found) {
      unmarked++;
      return;
    }
    const entry = planEntry(target, found, registered);
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
    fullyDead: categorizeUnreadable(unreadable).fullyDead.length,
    originalMissingVariantSurvives: categorizeUnreadable(unreadable).originalMissingVariantSurvives.length,
    referenceDeadSiblingSurvives: categorizeUnreadable(unreadable).referenceDeadSiblingSurvives.length,
    noOwner: count("no-owner"),
    unmarked,
    ...libraryArtCounts(entries, libraryDefaulted),
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

  if (unreadable.length > 0 && values["fail-on-dead"]) {
    console.error(`${unreadable.length} referenced image(s) no longer resolve:`);
    for (const line of deadReportLines(unreadable)) console.error(line);
  }
  process.exitCode = deadExitCode(values["fail-on-dead"], unreadable);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
