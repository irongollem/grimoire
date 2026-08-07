#!/usr/bin/env node
/**
 * One-off migration: converts legacy PNG faction images in Supabase Storage
 * to WebP. New uploads go through toWebP() automatically; this script fixes
 * rows that were saved before that pipeline was wired up.
 *
 * Pre-requisite: npm install --save-dev sharp
 *
 * Run with:
 *   VITE_SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/backfill-faction-images.mjs
 *
 * The script is idempotent — it skips rows whose image_url already ends in
 * .webp, and skips any row where the new .webp file already exists in storage.
 * Safe to re-run after partial failures.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  console.error("sharp not found. Run: npm install --save-dev sharp");
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET       = "asset-images";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// ── Supabase REST helper ──────────────────────────────────────────────────────

async function dbRequest(path, options = {}) {
  const { headers: extra, ...rest } = options;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...rest,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...extra,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB ${path}: ${res.status} — ${text}`);
  return text ? JSON.parse(text) : null;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function storageDownload(storagePath) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${storagePath}`);
  return Buffer.from(await res.arrayBuffer());
}

async function storageUpload(storagePath, buffer, contentType) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: buffer,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
}

function publicUrl(storagePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

// ── Extract storage path from a public URL ────────────────────────────────────

const STORAGE_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

function parseStoragePath(imageUrl) {
  const idx = imageUrl.indexOf(STORAGE_PREFIX);
  if (idx === -1) return null; // external URL, skip
  return imageUrl.slice(idx + STORAGE_PREFIX.length);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  // Fetch all factions with a non-null image_url stored in our bucket.
  const factions = await dbRequest(
    `/factions?select=id,image_url&image_url=not.is.null`,
    { headers: { Prefer: "return=representation" } },
  );

  const candidates = factions.filter((f) => {
    const path = parseStoragePath(f.image_url);
    if (!path) return false;           // external URL
    if (path.endsWith(".webp")) return false; // already converted
    return true;
  });

  console.log(`Found ${candidates.length} faction(s) with non-WebP storage images.`);
  if (!candidates.length) { console.log("Nothing to do."); return; }

  // Everything the filter dropped — external URLs and already-WebP images.
  const skipped = factions.length - candidates.length;
  let ok = 0;
  let errors = 0;

  for (const faction of candidates) {
    const srcPath = parseStoragePath(faction.image_url);
    const dstPath = srcPath.replace(/\.[^.]+$/, ".webp");

    console.log(`\n[${faction.id}] ${srcPath} → ${dstPath}`);

    try {
      // Download original
      const srcBuffer = await storageDownload(srcPath);

      // Convert to WebP (max 1920px, 85% quality — matches toWebP() in mediaConvert.ts)
      const webpBuffer = await sharp(srcBuffer)
        .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      // Upload WebP
      await storageUpload(dstPath, webpBuffer, "image/webp");

      // Update the DB row
      const newUrl = publicUrl(dstPath);
      await dbRequest(`/factions?id=eq.${faction.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ image_url: newUrl }),
      });

      console.log(`  ✓ converted (${srcBuffer.length} → ${webpBuffer.length} bytes)`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${ok} converted, ${skipped} skipped, ${errors} errors.`);
}

run().catch((err) => { console.error(err); process.exit(1); });
