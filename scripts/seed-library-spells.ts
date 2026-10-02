#!/usr/bin/env tsx
/**
 * Seeds the shared library_spells table from Open5e v2 — dual-edition by default
 * (SRD 5.1 "srd-2014" + SRD 5.2 "srd-2024") — then backfills image_url +
 * image_focal_point from library_spell_art_canonical (the one source of spell art).
 *
 * Reuses src/lib/library/open5eSpellImport.ts's fetchOpen5eSpells(), the single source
 * of truth for the Open5e v2 → row mapping (shared with the in-app admin
 * import flow). This script only adds CLI plumbing, the Supabase upsert, and
 * the SRD art backfill — it does not re-implement any field mapping.
 *
 * Run (seeds both 2014 + 2024 by default):
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-library-spells.ts
 *   npm run seed-library-spells
 *
 * Optional flags:
 *   --all              Seed from every supported 5e-gamesystem document (2014, 2024, and any future ones)
 *   --list             List available Open5e v2 documents and exit
 *   --dry-run          Fetch + map only; print row counts per edition + 2 sample rows; write nothing
 *   <key> [<key>…]     Seed only the listed Open5e v2 document keys (default: srd-2014 srd-2024)
 *
 * Required env vars in .env.local (not required for --list or --dry-run):
 *   VITE_SUPABASE_URL         — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 */

import {
  fetchOpen5eDocuments,
  fetchOpen5eSpells,
  planLibrarySpellImport,
  type ImportedLibrarySpell,
} from "@/lib/library/open5eSpellImport";
import { fetchOpen5eDocumentRefs, fetchSupported5eDocumentKeys } from "@/lib/library/open5eApi";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireEnv,
  installOpen5eUserAgent,
  createServiceClient,
  fetchAllRows,
  upsertBatch,
  parseSeedCliArgs,
  printAvailableDocuments,
  countByRuleset,
  assertRedistributableDocuments,
  DEFAULT_SRD_DOCUMENT_KEYS,
} from "./lib/seed-helpers";
import { pathToFileURL } from "node:url";

// ── library_spells table snapshot ────────────────────────────────────────────────

/**
 * Union of every column either the re-import plan (`planLibrarySpellImport`) or
 * the art backfill's name map needs. Both previously issued their own full
 * `library_spells` GET — one for `id,source_document_key,source_record_key,
 * mechanics_reviewed,image_url`, the other for `id,name` — doubling a fetch
 * that, at ~1400 rows, already needs pagination. Fetched once in `main()`
 * and reused for both.
 */
interface LibrarySpellRow {
  id: string;
  name: string;
  source_document_key: string;
  source_record_key: string;
  mechanics_reviewed: boolean;
  image_url: string | null;
}

// ── art backfill from library_spell_art_canonical ────────────────────────────────

interface CanonicalArtRow {
  entry_id: string;
  image_url: string;
  portrait_focal_point: { x: number; y: number } | null;
}

export interface ResolvedSpellArt {
  id: string;
  image_url: string;
  image_focal_point: { x: number; y: number } | null;
}

/**
 * The same rule as sync_library_spell_art(): a spell takes its own canonical row,
 * and without one the canonical art of a same-named spell (the other ruleset's
 * copy), the lowest entry_id deciding when several share a name. A spell with
 * neither is not in the result.
 */
export function resolveSpellArt(
  spells: ReadonlyArray<{ id: string; name: string }>,
  canonical: ReadonlyArray<CanonicalArtRow>,
): ResolvedSpellArt[] {
  const artById = new Map(canonical.map((row) => [row.entry_id, row]));
  const nameById = new Map(spells.map((s) => [s.id, s.name.toLowerCase()]));

  const byName = new Map<string, CanonicalArtRow>();
  for (const row of canonical) {
    const name = nameById.get(row.entry_id);
    if (name === undefined) continue;
    const held = byName.get(name);
    if (!held || row.entry_id < held.entry_id) byName.set(name, row);
  }

  const resolved: ResolvedSpellArt[] = [];
  for (const { id, name } of spells) {
    const art = artById.get(id) ?? byName.get(name.toLowerCase());
    if (!art) continue;
    resolved.push({ id, image_url: art.image_url, image_focal_point: art.portrait_focal_point });
  }
  return resolved;
}

async function backfillArt(supabase: SupabaseClient, spells: ReadonlyArray<{ id: string; name: string }>): Promise<void> {
  const canonical = await fetchAllRows<CanonicalArtRow>((from, to) =>
    supabase
      .from("library_spell_art_canonical")
      .select("entry_id,image_url,portrait_focal_point")
      .not("image_url", "is", null)
      .order("entry_id")
      .range(from, to)
      .returns<CanonicalArtRow[]>(),
  );
  if (!canonical.length) {
    console.log("  No canonical spell art found — skipping art backfill.");
    return;
  }
  const resolved = resolveSpellArt(spells, canonical);
  console.log(`  Found ${canonical.length} canonical spell art rows — backfilling ${resolved.length} library_spells…`);

  const PATCH_BATCH = 25;
  for (let i = 0; i < resolved.length; i += PATCH_BATCH) {
    await Promise.all(
      resolved.slice(i, i + PATCH_BATCH).map(async ({ id, image_url, image_focal_point }) => {
        const { error } = await supabase
          .from("library_spells")
          .update({ image_url, image_focal_point })
          .eq("id", id);
        if (error) throw error;
      }),
    );
    process.stdout.write(`\r  Art patched ${Math.min(i + PATCH_BATCH, resolved.length)} / ${resolved.length}`);
  }
  console.log();
}

// ── dry run ───────────────────────────────────────────────────────────────────

function printDryRunSummary(rows: ImportedLibrarySpell[]): void {
  console.log("=== Dry run — no data written ===\n");
  console.log(`Total mapped: ${rows.length}`);
  const counts = countByRuleset(rows);
  for (const [ruleset, count] of Object.entries(counts)) {
    console.log(`  ruleset ${ruleset}: ${count}`);
  }
  console.log("\nSample rows:");
  for (const row of rows.slice(0, 2)) {
    console.log(JSON.stringify({
      id: row.id,
      name: row.name,
      ruleset: row.ruleset,
      conceptual_key: row.conceptual_key,
      source_document_key: row.source_document_key,
      source_record_key: row.source_record_key,
      level: row.level,
      school: row.school,
    }, null, 2));
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  installOpen5eUserAgent();
  const parsed = parseSeedCliArgs(process.argv.slice(2));

  if (parsed.list) {
    console.log("Fetching available Open5e v2 documents…");
    printAvailableDocuments(await fetchOpen5eDocuments());
    return;
  }

  const documentKeys = parsed.all
    ? await fetchSupported5eDocumentKeys()
    : parsed.documentKeys.length
      ? parsed.documentKeys
      : [...DEFAULT_SRD_DOCUMENT_KEYS];

  console.log(`=== Seeding library_spells (sources: ${documentKeys.join(", ")}) ===\n`);

  console.log("Checking requested document(s) are licensed for hosted redistribution…");
  assertRedistributableDocuments(documentKeys, await fetchOpen5eDocumentRefs());

  console.log("Step 1: Fetching + mapping spells from Open5e v2…");
  const rows = await fetchOpen5eSpells(documentKeys);
  console.log(`  Mapped ${rows.length} spells.\n`);

  if (parsed.dryRun) {
    printDryRunSummary(rows);
    return;
  }

  const env = requireEnv();
  const supabase = createServiceClient(env);

  console.log("Step 2: Upserting to library_spells table…");
  // Re-runs must not clobber admin-reviewed rows (mechanics_reviewed = true)
  // or churn ids/art on existing rows — planLibrarySpellImport (shared with the
  // in-app import path) filters and pins those before the upsert. See #560.
  // Single paginated fetch of the full table (~1400 rows, past PostgREST's
  // unpaginated cap) — reused below for the art backfill's name map instead
  // of re-fetching the whole table a second time.
  const existing = await fetchAllRows<LibrarySpellRow>((from, to) =>
    supabase
      .from("library_spells")
      .select("id,name,source_document_key,source_record_key,mechanics_reviewed,image_url")
      .range(from, to)
      .returns<LibrarySpellRow[]>(),
  );
  const plan = planLibrarySpellImport(rows, existing);
  if (plan.skippedReviewed > 0) {
    console.log(`  Skipping ${plan.skippedReviewed} admin-reviewed rows (mechanics_reviewed).`);
  }
  await upsertBatch(supabase, "library_spells", plan.rows, "source_document_key,source_record_key");
  console.log(`  Done — ${plan.rows.length} rows upserted.\n`);

  console.log("Step 3: Backfilling art from library_spell_art_canonical…");
  // Names for the art name-map: `existing` (pre-upsert) covers every row
  // already in the table; `plan.rows` covers anything just upserted,
  // including brand-new spells `existing` couldn't have seen yet. A Map
  // keyed by id lets the freshly-upserted name win over the pre-upsert one.
  const idToName = new Map(existing.map((row) => [row.id, row.name]));
  for (const row of plan.rows) idToName.set(row.id, row.name);
  const spellIdentities = [...idToName.entries()].map(([id, name]) => ({ id, name }));
  await backfillArt(supabase, spellIdentities);
  console.log("  Art backfill complete.\n");

  console.log("=== Seeding complete ===");
}

// Entry-point guard: these modules also export helpers their .test.ts files
// import directly. Without it, a plain `import` runs main() — which reaches the
// network before vitest can tear the worker down, producing "Failed to
// terminate forks worker" on every full-suite run. Only auto-run when this file
// is the actual entrypoint.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
