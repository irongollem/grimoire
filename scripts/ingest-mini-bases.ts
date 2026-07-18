#!/usr/bin/env tsx
/**
 * Ingests the curated mini-base geometry (SIMULACRUM_PLAN.md §2 BASELESS
 * decision, #542) into the `mini-models` bucket: for every entry in
 * `_shared/mini-bases.ts` MINI_BASES, resolves an STL + a GLB and uploads
 * both to `mini-models/bases/<id>.stl|.glb`.
 *
 * Source layout, per base (see `MiniBase.src` in mini-bases.ts): early bases
 * drop flat as `art-src/bases/<id>.stl|.glb`; newer plinth exports nest each
 * base under its own directory (e.g.
 * `art-src/bases/2026-07 lava flow 4/round25-1-2/round25-1-2.stl`) — for
 * those, the registry's `src` field gives the path stem
 * (`art-src/bases/<src>.stl|.glb`) and takes priority over the flat `<id>`
 * convention.
 *
 * Axis/unit conventions:
 *   - Blender's native binary-STL export (plinth's STL output) is
 *     MILLIMETRES, Z-UP (height along +Z, origin at bottom-center). Every
 *     STL read from art-src is rotated Z-up→Y-up
 *     (`_shared/stl.ts` rotateStlZUpToYUp) before anything downstream ever
 *     sees it — composeStl/composeGlb/mesh-compose.ts all assume Y-up.
 *   - The procedural "plain" cylinder (`generateCylinderStl`) is already
 *     Y-up by construction — no rotation applied.
 *   - Blender's glTF export (plinth's optional artist-colored GLB sibling)
 *     is METRES, Y-up — glTF's own spec base unit. That GLB is uploaded
 *     AS-IS (never re-derived — rewriting it without full extension support
 *     could strip material extensions like KHR_materials_emissive_strength).
 *     Unit normalization (metres → mm) happens at COMPOSE time instead, via
 *     the 25mm-footprint heuristic in `_shared/glb-compose.ts` composeGlb —
 *     not here.
 *
 * STL source, per base:
 *   - `art-src/bases/<src|id>.stl` if it exists (first-party geometry from
 *     the sister repo "plinth"), rotated Z-up→Y-up.
 *   - Otherwise, "plain" ONLY falls back to a PROCEDURAL placeholder (a
 *     plain cylinder, `_shared/stl.ts` generateCylinderStl) — that's what
 *     ships today. Any other registry entry with no matching STL is skipped
 *     with a warning (adding a base is registry entry + running this
 *     script, never a migration — but the STL has to actually exist first).
 *
 * GLB source, per base (plinth can export Blender-baked, artist-colored GLBs
 * — vertex colors / materials an STL cannot carry):
 *   - `art-src/bases/<src|id>.glb` if it exists — uploaded AS-IS, never
 *     re-derived (it's the hand-colored version; the registry's `color` is
 *     only a fallback tint, not an override).
 *   - Otherwise, derived from the resolved (rotated, Y-up, mm) STL triangles
 *     via `_shared/glb-compose.ts` stlToGlb + the registry's flat `color`.
 *
 * Idempotent: every upload uses x-upsert, so re-running after dropping new
 * art-src files just overwrites the previous version.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/ingest-mini-bases.ts
 *
 * Required env vars:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MINI_BASES, BASE_STORAGE_PREFIX, DEFAULT_BASE_ID, type MiniBase } from "../supabase/functions/_shared/mini-bases.ts";
import { generateCylinderStl, parseBinaryStl, rotateStlZUpToYUp, stlBounds, writeBinaryStl } from "../supabase/functions/_shared/stl.ts";
import { stlToGlb } from "../supabase/functions/_shared/glb-compose.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ART_SRC_BASES_DIR = resolve(__dirname, "..", "art-src", "bases");
const BUCKET = "mini-models";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run via:\n" +
    "  npx tsx --env-file=.env.local scripts/ingest-mini-bases.ts",
  );
  process.exit(1);
}

// ── Storage upload (raw fetch, mirrors backfill-faction-images.mjs) ─────────

async function storageUpload(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
}

// ── Per-base source resolution ───────────────────────────────────────────────

const BASE_FOOTPRINT_MM = 25;
const BASE_FOOTPRINT_TOLERANCE_MM = 1;

/** Path stem for a base's art-src files — `src` (nested plinth export) if set, else the flat `<id>` convention. */
function baseArtPath(base: MiniBase, ext: "stl" | "glb"): string {
  return resolve(ART_SRC_BASES_DIR, `${base.src ?? base.id}.${ext}`);
}

/**
 * Sanity-checks the 25mm-footprint / bottom-center-origin invariant every
 * base is supposed to satisfy after axis/unit resolution (mini-bases.ts) —
 * warns loudly instead of throwing, since a slightly-off plinth export
 * should still ingest (and be visibly wrong in preview) rather than block
 * every other base in the registry.
 */
function validateBaseGeometry(base: MiniBase, tris: Float32Array): void {
  const bounds = stlBounds(tris);
  const spanX = bounds.max[0] - bounds.min[0];
  if (Math.abs(spanX - BASE_FOOTPRINT_MM) > BASE_FOOTPRINT_TOLERANCE_MM) {
    console.warn(
      `  ⚠ [${base.id}] x-span is ${spanX.toFixed(2)}mm, expected ~${BASE_FOOTPRINT_MM}mm (±${BASE_FOOTPRINT_TOLERANCE_MM}) — check the plinth export's units/scale`,
    );
  }
  if (Math.abs(bounds.min[1]) > BASE_FOOTPRINT_TOLERANCE_MM) {
    console.warn(
      `  ⚠ [${base.id}] min Y is ${bounds.min[1].toFixed(2)}, expected ~0 (origin at bottom-center) — check the rotation/export origin`,
    );
  }
}

type StlSource = { kind: "stl"; tris: Float32Array } | { kind: "skip"; reason: string };

function resolveBaseStl(base: MiniBase): StlSource {
  const artPath = baseArtPath(base, "stl");
  if (existsSync(artPath)) {
    // plinth/Blender's native binary-STL export is mm, Z-up — rotate into
    // the Y-up space every downstream consumer (composeStl, composeGlb,
    // mesh-compose.ts) assumes.
    const rawTris = parseBinaryStl(new Uint8Array(readFileSync(artPath)));
    const tris = rotateStlZUpToYUp(rawTris);
    validateBaseGeometry(base, tris);
    return { kind: "stl", tris };
  }
  if (base.id === DEFAULT_BASE_ID) {
    // Procedural placeholder — 25mm-diameter (12.5mm radius), 3.5mm-tall
    // cylinder, already Y-up by construction (no rotation needed) — until
    // real plinth output lands for this id.
    const tris = parseBinaryStl(generateCylinderStl(12.5, 3.5, 64));
    validateBaseGeometry(base, tris);
    return { kind: "stl", tris };
  }
  return { kind: "skip", reason: `no art-src/bases/${base.src ?? base.id}.stl and no procedural fallback for this id` };
}

/** A hand-provided, artist-colored GLB (Blender export via plinth) — used as-is when present, never re-derived. */
function resolveProvidedGlb(base: MiniBase): Uint8Array | null {
  const artPath = baseArtPath(base, "glb");
  return existsSync(artPath) ? new Uint8Array(readFileSync(artPath)) : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(`Ingesting ${MINI_BASES.length} registered base(s) into ${BUCKET}/${BASE_STORAGE_PREFIX}/...`);

  let ok = 0;
  let skipped = 0;
  let errors = 0;

  for (const base of MINI_BASES) {
    console.log(`\n[${base.id}] ${base.label}`);
    const source = resolveBaseStl(base);
    if (source.kind === "skip") {
      console.warn(`  ⚠ skipped — ${source.reason}`);
      skipped++;
      continue;
    }

    try {
      const stlBytes = writeBinaryStl([source.tris]);

      const providedGlb = resolveProvidedGlb(base);
      let glbBytes: Uint8Array;
      if (providedGlb) {
        glbBytes = providedGlb;
        console.log("  using provided colored GLB as-is (unit normalization happens at compose time)");
      } else {
        glbBytes = await stlToGlb(source.tris, base.color);
      }

      await storageUpload(`${BASE_STORAGE_PREFIX}/${base.id}.stl`, stlBytes, "model/stl");
      await storageUpload(`${BASE_STORAGE_PREFIX}/${base.id}.glb`, glbBytes, "model/gltf-binary");

      console.log(`  ✓ uploaded .stl (${stlBytes.length} bytes) + .glb (${glbBytes.length} bytes)`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.log(`\nDone: ${ok} ok, ${skipped} skipped, ${errors} errors.`);
  if (errors > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
