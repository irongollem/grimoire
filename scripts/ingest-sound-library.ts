#!/usr/bin/env tsx
/**
 * Ingests the curated CC0 / CC-BY sound library into the `sounds` bucket and
 * the `sound_library` catalogue table (#572 phase 3).
 *
 * Source of truth is `art-src/sounds/manifest.json` — a provenance record per
 * file, carrying the licence and a ready-to-display attribution string that was
 * verified against the source page at curation time. That folder is gitignored
 * (it holds ~180 MB of audio), so this script is the only tracked description
 * of how the catalogue gets built.
 *
 * What lands where:
 *   - audio  → `sounds/library/<collection>/<name>.ogg` (admin-only prefix)
 *   - row    → `public.sound_library`, keyed on the manifest's own id
 *
 * Nothing here is SRD content, so nothing is filed under an `srd/` prefix. It
 * is Creative Commons audio from OpenGameArt, Wikimedia Commons and the
 * Internet Archive, and the catalogue records exactly that per row.
 *
 * Idempotent: uploads use x-upsert and rows upsert on `slug`, so re-running
 * after adding files to the manifest only does the new work.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ingest-sound-library.ts [--dry-run] [--skip-upload]
 *
 * `--skip-upload` re-writes only the catalogue rows. Useful when the audio is
 * already in the bucket and a classification rule changed — re-pushing 180 MB
 * to fix a tag would be a slow way to make the same point.
 *
 * Required env vars:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { oggDurationSeconds } from "./lib/ogg-duration.ts";
import {
  boardCategory,
  isLoopable,
  libraryPublicUrl,
  libraryStoragePath,
  libraryTags,
} from "./lib/sound-library-classify.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOUNDS_SRC_DIR = resolve(__dirname, "..", "art-src", "sounds");
const MANIFEST_PATH = resolve(SOUNDS_SRC_DIR, "manifest.json");
const BUCKET = "sounds";

/** The `sounds` bucket's own limit. Anything larger is rejected by storage. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const SKIP_UPLOAD = process.argv.includes("--skip-upload");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run via:\n" +
      "  npx tsx --env-file=.env.local scripts/ingest-sound-library.ts",
  );
  process.exit(1);
}

/** One record of `art-src/sounds/manifest.json`. */
interface ManifestRecord {
  id: string;
  category: string;
  title: string;
  author: string;
  source: string;
  source_page: string;
  license: string;
  /** Absent entirely on some records, not merely null — see `nullable()`. */
  license_url?: string | null;
  attribution_required: boolean;
  attribution?: string | null;
  normalized_file?: string;
}

/**
 * Collapses "key absent" and "key null" into null.
 *
 * `JSON.stringify` drops undefined-valued keys, and PostgREST rejects a bulk
 * insert whose objects do not all carry the same keys ("All object keys must
 * match"). A manifest record that simply omits `license_url` would therefore
 * poison the whole batch, so absence is made explicit here rather than left to
 * serialisation.
 */
function nullable(value: string | null | undefined): string | null {
  return value === undefined ? null : value;
}

interface CatalogueRow {
  slug: string;
  collection: string;
  category: string;
  title: string;
  author: string;
  source: string;
  source_page: string;
  license: string;
  license_url: string | null;
  attribution: string | null;
  storage_path: string;
  file_url: string;
  duration_seconds: number;
  tags: string[];
  is_loopable: boolean;
  sort_order: number;
}

// ── Remote calls ───────────────────────────────────────────────────────────

async function storageUpload(storagePath: string, bytes: Uint8Array): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "audio/ogg",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
}

async function upsertRows(rows: CatalogueRow[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sound_library?on_conflict=slug`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Catalogue upsert failed (${res.status}): ${await res.text()}`);
}

// ── Per-record resolution ──────────────────────────────────────────────────

type Resolved =
  | { kind: "row"; row: CatalogueRow; bytes: Uint8Array }
  | { kind: "skip"; reason: string };

function resolveRecord(record: ManifestRecord, index: number): Resolved {
  if (!record.normalized_file) {
    return { kind: "skip", reason: "no normalized_file in the manifest — re-run normalize_sounds.sh" };
  }

  const localPath = resolve(SOUNDS_SRC_DIR, record.normalized_file);
  if (!existsSync(localPath)) {
    return { kind: "skip", reason: `missing on disk: ${record.normalized_file}` };
  }

  const size = statSync(localPath).size;
  if (size > MAX_UPLOAD_BYTES) {
    return {
      kind: "skip",
      reason:
        `${(size / 1024 / 1024).toFixed(1)} MB exceeds the bucket's 20 MB limit — ` +
        "trim it at the source rather than raising the cap for user uploads",
    };
  }

  const bytes = new Uint8Array(readFileSync(localPath));
  const duration = oggDurationSeconds(bytes);
  if (duration === null) {
    // Not Ogg Vorbis. Worth reporting rather than defaulting, because duration
    // decides which mixer bus the sound lands on — a silent zero would file a
    // twenty-minute bed as a one-shot effect.
    return { kind: "skip", reason: "not readable as Ogg Vorbis (wrong codec or corrupt)" };
  }

  const slug = record.id;
  const storagePath = libraryStoragePath(slug);

  return {
    kind: "row",
    bytes,
    row: {
      slug,
      collection: record.category,
      category: boardCategory(record.category, duration),
      title: record.title,
      author: record.author,
      source: record.source,
      source_page: record.source_page,
      license: record.license,
      license_url: nullable(record.license_url),
      // Only carried when the licence actually requires it. A placeholder here
      // would put a credit line on CC0 content and imply an obligation that
      // does not exist.
      attribution: record.attribution_required ? nullable(record.attribution) : null,
      storage_path: storagePath,
      file_url: libraryPublicUrl(SUPABASE_URL!, storagePath),
      duration_seconds: Number(duration.toFixed(3)),
      tags: libraryTags(record.category),
      is_loopable: isLoopable(slug, record.title),
      sort_order: index,
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

/** Upserted in batches so one 800-row request cannot time out. */
const ROW_BATCH_SIZE = 100;
/** Uploads run concurrently; small enough not to trip storage rate limits. */
const UPLOAD_CONCURRENCY = 6;

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function run(): Promise<void> {
  const manifest: ManifestRecord[] = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  console.log(`Manifest: ${manifest.length} record(s) from ${MANIFEST_PATH}`);
  if (DRY_RUN) console.log("DRY RUN — nothing will be uploaded or written.\n");

  const uploads: { row: CatalogueRow; bytes: Uint8Array }[] = [];
  const skipped: { slug: string; reason: string }[] = [];

  manifest.forEach((record, index) => {
    const resolved = resolveRecord(record, index);
    if (resolved.kind === "skip") {
      skipped.push({ slug: record.id, reason: resolved.reason });
      return;
    }
    uploads.push({ row: resolved.row, bytes: resolved.bytes });
  });

  const byCategory = uploads.reduce<Record<string, number>>((acc, u) => {
    acc[u.row.category] = (acc[u.row.category] ?? 0) + 1;
    return acc;
  }, {});
  const needingCredit = uploads.filter((u) => u.row.attribution !== null).length;

  console.log(`Ready: ${uploads.length} · skipped: ${skipped.length}`);
  console.log(`  buses: ${Object.entries(byCategory).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`  requiring attribution: ${needingCredit}`);

  if (skipped.length > 0) {
    console.log("\nSkipped:");
    for (const s of skipped) console.log(`  ⚠ ${s.slug} — ${s.reason}`);
  }

  if (DRY_RUN) {
    console.log("\nDry run complete.");
    return;
  }

  let failed = 0;
  if (SKIP_UPLOAD) {
    console.log("\n--skip-upload: leaving the bucket alone, rewriting catalogue rows only.");
  } else {
    console.log(`\nUploading ${uploads.length} file(s) to ${BUCKET}/library/ …`);
    let done = 0;
    await mapWithConcurrency(uploads, UPLOAD_CONCURRENCY, async ({ row, bytes }) => {
      try {
        await storageUpload(row.storage_path, bytes);
        done++;
        if (done % 50 === 0) console.log(`  … ${done}/${uploads.length}`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${row.slug}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    console.log(`Uploaded ${done}, failed ${failed}.`);
  }

  console.log(`\nUpserting ${uploads.length} catalogue row(s) …`);
  for (let i = 0; i < uploads.length; i += ROW_BATCH_SIZE) {
    const batch = uploads.slice(i, i + ROW_BATCH_SIZE).map((u) => u.row);
    await upsertRows(batch);
    console.log(`  … ${Math.min(i + ROW_BATCH_SIZE, uploads.length)}/${uploads.length}`);
  }

  console.log("\nDone.");
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
