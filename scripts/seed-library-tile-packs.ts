/**
 * Migrates the bundled Cartographer tile packs into `library_tile_packs` (#889 S7).
 *
 * Until this ran, the packs every DM sees were a hardcoded array in
 * MapWorkbench.vue pointing at static manifests under `public/cartographer/`.
 * S6 deleted that array; this puts the same packs in the table it now reads,
 * so the picker's contents become data an admin can change instead of a
 * constant only a deploy can change.
 *
 * TEN OF THE TWELVE PACKS SHIP NO ART, AND THAT IS NOT A PROBLEM TO FIX HERE.
 * Only `wood-interior` (24 tiles) and `celestial-observatory` (29) have real
 * `.webp` files. The other ten — including `stone-dungeon`, the long-standing
 * default — declare their full slot list in the manifest and ship zero images;
 * `packLoader.ts` draws procedural placeholder tiles from the manifest's
 * `palette` for any slot whose image fails to load, which is how those packs
 * have always rendered. Migrating them as-is reproduces today's behaviour
 * exactly: the manifest travels into the row, the absent bytes stay absent, the
 * URL 404s, and the loader falls back as it always did. Filling them in with
 * real art is what the admin generation lane (S3/S5) is *for*, one pack at a
 * time, with no code change and no second migration.
 *
 * PROVENANCE IS EMBEDDED ON THE WAY IN, not assumed to be present. The 53 tiles
 * that do exist were produced before the generator learned to mark its output
 * (#889 S2), so they carry no XMP packet at all — they are AI-generated images
 * shipping to every user with no machine-readable disclosure, which is the gap
 * EPIC #611 exists to close. Each byte is marked here as it is uploaded, and
 * the pack row carries the matching `ai_provenance`.
 *
 * Idempotent: rows upsert on (pack_id, pack_version) and objects upload with
 * `upsert: true`, so a re-run repairs rather than duplicates.
 *
 * Env:
 *   VITE_SUPABASE_URL         — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 *
 * Run:
 *   npm run seed-library-tile-packs -- --dry-run
 *   npm run seed-library-tile-packs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, requireEnv } from "./lib/seed-helpers";
import { markGeneratedImage } from "../supabase/functions/_shared/provenance/mark.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";

/** Literal rather than imported from `src/lib/storage/buckets.ts`: that module
 *  reads `import.meta.env` at module scope and cannot load under node — the same
 *  reason `dev-buckets.data.ts` restates the registry. */
const BUCKET = "library-tile-packs";

const PACKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/cartographer");

/**
 * Display order, preserving exactly the order the hardcoded `BUNDLED_PACKS`
 * array used, so no DM's picker reshuffles on the day this lands.
 * `celestial-observatory` was never in that array (it postdates it) and goes
 * last. `sort_order` is hand-set here for the same reason `content_sources`
 * hand-sets its own: which pack a DM sees first is an editorial call, and an
 * admin can change it afterwards without touching this script.
 */
const PACK_ORDER = [
  "stone-dungeon", "icy-cave", "wood-interior", "sandy-ruins", "forest", "black-rock",
  "lava-cavern", "underdark", "water", "sewer-swamp", "marble-palace", "celestial-observatory",
] as const;

/**
 * Which packs are AI-generated, and what we can honestly say about how.
 *
 * Absent from this map means "not AI-generated" — the ten procedural packs
 * draw from a palette and were never model output, so marking them would be a
 * false disclosure in the other direction.
 *
 * `celestial-observatory` was produced by `scripts/cartographer-pack.ts`, which
 * runs the same `gpt-image-2` path the edge generator does, so its provider and
 * model are known. `wood-interior` predates any record of how it was made; the
 * maintainer confirms it is AI-generated but not by what. `"unknown"` is
 * recorded rather than a plausible guess: the Art 50 obligation is to disclose
 * *that* the image is AI-generated, which this satisfies, and inventing a model
 * id would make the record wrong in a way nobody could later detect.
 *
 * `generatedAt` is the date each pack's art entered the repository, not the
 * time this script runs — the field means when the image was generated.
 */
const AI_PROVENANCE: Readonly<Record<string, AiProvenance>> = {
  "celestial-observatory": {
    generatorType: "tile",
    provider: "openai",
    model: "gpt-image-2",
    generatedAt: "2026-08-26T00:03:23+02:00",
    edited: false,
  },
  "wood-interior": {
    generatorType: "tile",
    provider: "unknown",
    model: "unknown",
    generatedAt: "2026-05-12T00:28:15+02:00",
    edited: false,
  },
};

interface ManifestSlot {
  url: string;
  byteSize?: number;
}

interface BundledManifest {
  pack_id: string;
  pack_version: number;
  name: string;
  description: string;
  schema_version: number;
  assets: Record<string, ManifestSlot[] | undefined>;
}

/** Every `.webp` under `dir`, as paths relative to it. */
function tilePaths(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...tilePaths(full, prefix ? `${prefix}/${entry}` : entry));
    else if (entry.endsWith(".webp")) found.push(prefix ? `${prefix}/${entry}` : entry);
  }
  return found.sort();
}

function versionDir(packId: string): { dir: string; version: number } {
  const packDir = path.join(PACKS_DIR, packId);
  const versions = readdirSync(packDir).filter((entry) => /^v[1-9][0-9]*$/.test(entry)).sort();
  const latest = versions[versions.length - 1];
  if (!latest) throw new Error(`${packId}: no v<n> directory`);
  return { dir: path.join(packDir, latest), version: Number(latest.slice(1)) };
}

async function seedPack(
  supabase: SupabaseClient,
  packId: string,
  sortOrder: number,
  dryRun: boolean,
): Promise<void> {
  const { dir, version } = versionDir(packId);
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as BundledManifest;
  const tiles = tilePaths(dir);
  const provenance = AI_PROVENANCE[packId] ?? null;

  // Stamp `byteSize` onto every slot whose file actually exists on disk, and
  // leave it absent on the rest. The generator already writes this field per
  // completed tile, so the manifests it produces carry it — the older bundled
  // ones do not, which left no way to tell a fully-drawn pack from one that is
  // entirely procedural placeholders short of listing the bucket. That
  // distinction is the whole point of the admin surface (it exists to find and
  // fill artless packs), so the fact belongs in the data rather than being
  // re-derived, differently, by each reader.
  const onDisk = new Set(tiles);
  for (const slots of Object.values(manifest.assets)) {
    for (const slot of slots ?? []) {
      if (onDisk.has(slot.url)) slot.byteSize = statSync(path.join(dir, slot.url)).size;
      else delete slot.byteSize;
    }
  }

  const declared = Object.values(manifest.assets).reduce((total, slots) => total + (slots?.length ?? 0), 0);
  console.log(
    `${packId} v${version}: ${tiles.length}/${declared} slot${declared === 1 ? "" : "s"} with art` +
      `${tiles.length === 0 ? " (procedural — renders from the manifest palette)" : ""}` +
      `${provenance ? `, AI-marked as ${provenance.provider}/${provenance.model}` : ""}`,
  );
  if (dryRun) return;

  const { data: row, error: upsertError } = await supabase.from("library_tile_packs").upsert({
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    name: manifest.name,
    description: manifest.description,
    schema_version: manifest.schema_version,
    manifest,
    // Published outright: these twelve are what every DM already sees, so
    // landing them as drafts would silently empty the picker.
    status: "published",
    content_source_key: "grimoire-art",
    // CC0 for the generated packs, per the epic's licensing decision. The
    // procedural ones are our own palette-derived output and carry the same
    // terms — there is nothing in them we would want to reserve.
    license_keys: ["cc0"],
    ai_provenance: provenance,
    sort_order: sortOrder,
  }, { onConflict: "pack_id,pack_version" }).select("id").single();
  if (upsertError) throw new Error(`${packId}: ${upsertError.message}`);

  for (const relative of tiles) {
    const bytes = new Uint8Array(readFileSync(path.join(dir, relative)));
    // Marked only where we can truthfully say the image is AI-generated. An
    // unmarked procedural tile is correct, not an omission.
    const body = provenance ? markGeneratedImage(bytes, "image/webp", provenance) : bytes;
    const objectPath = `${row.id}/v${version}/${relative}`;
    const { error } = await supabase.storage.from(BUCKET)
      .upload(objectPath, body, { contentType: "image/webp", upsert: true });
    if (error) throw new Error(`${packId}/${relative}: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const env = requireEnv();
  const supabase = createServiceClient(env);

  console.log(`=== Seeding library_tile_packs from public/cartographer${dryRun ? " (dry run)" : ""} ===\n`);
  const onDisk = readdirSync(PACKS_DIR).filter((entry) => statSync(path.join(PACKS_DIR, entry)).isDirectory());
  const unlisted = onDisk.filter((packId) => !(PACK_ORDER as readonly string[]).includes(packId));
  // Loud rather than silent: a pack added to the folder and not to PACK_ORDER
  // would otherwise be dropped on the floor by a script whose whole job is to
  // not lose one.
  if (unlisted.length) throw new Error(`Packs on disk but missing from PACK_ORDER: ${unlisted.join(", ")}`);

  for (const [index, packId] of PACK_ORDER.entries()) {
    await seedPack(supabase, packId, (index + 1) * 10, dryRun);
  }
  console.log(`\nDone — ${PACK_ORDER.length} packs.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
