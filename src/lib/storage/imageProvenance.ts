/**
 * Per-image AI provenance (#935). The registry table `image_provenance` is
 * keyed by (bucket id, stem), where the stem is the object path without its
 * extension or `_w<digits>` variant suffix, so every file of one image (the
 * original and its size variants) answers to one row.
 *
 * Writers call `registerImageProvenance` at the upload choke points with the
 * provenance parsed from the image's own XMP marker; readers call
 * `loadImageProvenance` by image URL. A provenance record is immutable for a
 * key, so found records are cached for the session and nothing here polls.
 */

import { supabase } from "@/lib/supabase";
import { imageProvenanceStem } from "@edge-shared/provenance/key.ts";
import type { AiProvenance } from "@edge-shared/provenance/types.ts";
import { BUCKETS, type BucketKey } from "./buckets";
import { parsePublicUrl } from "./urls";

export interface ImageProvenanceKey {
  /** Storage bucket id, e.g. `npc-portraits` (not the BucketKey). */
  bucket: string;
  /** Object path without its final extension and any `_w<digits>` suffix. */
  stem: string;
}

/** Stems per `in (...)` query; keeps the request URL well under PostgREST limits. */
const CHUNK_SIZE = 100;

function cacheKey(key: ImageProvenanceKey): string {
  return `${key.bucket}\u0000${key.stem}`;
}

/**
 * Registry key for a stored image URL, in either URL shape. Null for URLs
 * outside the registered buckets, `blob:` and `data:` URLs and empty strings.
 */
export function imageProvenanceKey(url: string): ImageProvenanceKey | null {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return null;
  const parsed = parsePublicUrl(url);
  if (!parsed) return null;
  return { bucket: BUCKETS[parsed.bucket].id, stem: imageProvenanceStem(parsed.path) };
}

/** Record the mark carried by an uploaded image. Upserts on (bucket, stem). */
export async function registerImageProvenance(
  bucket: BucketKey,
  path: string,
  provenance: AiProvenance,
  userId: string,
): Promise<void> {
  const key: ImageProvenanceKey = { bucket: BUCKETS[bucket].id, stem: imageProvenanceStem(path) };
  const { error } = await supabase
    .from("image_provenance")
    .upsert({ bucket: key.bucket, stem: key.stem, user_id: userId, provenance }, { onConflict: "bucket,stem" });
  if (error) throw error;
  found.set(cacheKey(key), provenance);
}

/** Forget an image's mark, for when its object is replaced by an unmarked one. A missing row is fine. */
export async function clearImageProvenance(bucket: BucketKey, path: string): Promise<void> {
  const key: ImageProvenanceKey = { bucket: BUCKETS[bucket].id, stem: imageProvenanceStem(path) };
  const { error } = await supabase
    .from("image_provenance")
    .delete()
    .eq("bucket", key.bucket)
    .eq("stem", key.stem);
  if (error) throw error;
  found.delete(cacheKey(key));
}

interface Waiter {
  resolve: (value: AiProvenance | null) => void;
  reject: (reason: unknown) => void;
}

interface PendingEntry {
  key: ImageProvenanceKey;
  waiters: Waiter[];
}

/** Records already seen. Misses are not cached: a fresh upload registers after its first render. */
const found = new Map<string, AiProvenance>();
let pending = new Map<string, PendingEntry>();
let flushScheduled = false;

interface ProvenanceRow {
  bucket: string;
  stem: string;
  provenance: AiProvenance;
}

async function fetchChunk(entries: PendingEntry[]): Promise<void> {
  const stems = [...new Set(entries.map((e) => e.key.stem))];
  const { data, error } = await supabase
    .from("image_provenance")
    .select("bucket, stem, provenance")
    .in("stem", stems);
  if (error) throw error;
  // No error and no rows array is not an answer PostgREST gives for a select;
  // treating it as "no provenance" would unbadge every image in the batch.
  if (!data) throw new Error("image_provenance: the query returned neither rows nor an error");
  const rows = data as ProvenanceRow[];
  const byKey = new Map<string, AiProvenance>();
  for (const row of rows) byKey.set(cacheKey(row), row.provenance);
  for (const entry of entries) {
    const hit = byKey.get(cacheKey(entry.key));
    if (hit) found.set(cacheKey(entry.key), hit);
    for (const waiter of entry.waiters) waiter.resolve(hit ?? null);
  }
}

async function flush(): Promise<void> {
  const batch = [...pending.values()];
  pending = new Map();
  flushScheduled = false;
  const chunks: PendingEntry[][] = [];
  for (let i = 0; i < batch.length; i += CHUNK_SIZE) chunks.push(batch.slice(i, i + CHUNK_SIZE));
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        await fetchChunk(chunk);
      } catch (err) {
        for (const entry of chunk) for (const waiter of entry.waiters) waiter.reject(err);
      }
    }),
  );
}

/**
 * Provenance for one image key, or null when none is registered. Calls made in
 * the same tick share one query per 100 stems, so a grid of portraits costs a
 * request, not one per card. A database error rejects every caller in the batch
 * it hit.
 */
export function loadImageProvenance(key: ImageProvenanceKey): Promise<AiProvenance | null> {
  const id = cacheKey(key);
  const cached = found.get(id);
  if (cached) return Promise.resolve(cached);
  return new Promise<AiProvenance | null>((resolve, reject) => {
    const existing = pending.get(id);
    if (existing) {
      existing.waiters.push({ resolve, reject });
    } else {
      pending.set(id, { key, waiters: [{ resolve, reject }] });
    }
    if (!flushScheduled) {
      flushScheduled = true;
      setTimeout(() => void flush(), 0);
    }
  });
}
