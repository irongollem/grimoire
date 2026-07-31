#!/usr/bin/env tsx
/**
 * Seeds the shared library_species table from Open5e v2 — dual-edition by
 * default (SRD 5.1 "srd-2014" + SRD 5.2 "srd-2024"), non-subspecies rows only.
 *
 * Reuses src/lib/open5eSpeciesImport.ts's fetchLibrarySpecies(), buildImportedFields()
 * and buildCreateOnlyDefaults() — the single source of truth for the Open5e v2
 * → row mapping (shared with the in-app SpeciesOpen5ePanel.vue import flow).
 * This script only adds CLI plumbing, the non-subspecies filter, the
 * library_species.id derivation (stableSrdId), the shared-table source/source_title
 * override (the Open5e document slug rather than its display name — needed for
 * campaign_enabled_sources gating, unlike the panel's per-user import which
 * keeps the display name), and the Supabase upsert. There is no art backfill
 * step — species have no canonical art source yet (unlike library_monsters/
 * library_spells, which backfill from library_monster_art_canonical/library_art_defaults).
 *
 * Run (seeds both 2014 + 2024 by default):
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-library-species.ts
 *   npm run seed-library-species
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
  fetchLibrarySpecies,
  buildImportedFields,
  buildCreateOnlyDefaults,
} from "@/lib/open5eSpeciesImport";
// Generic Open5e v2 document lister — not species-specific, so reused as-is
// rather than duplicated (only read/imported here, this file does not modify
// src/lib/open5eMonsterImport.ts).
import { fetchOpen5eDocuments } from "@/lib/open5eMonsterImport";
import { fetchOpen5eDocumentRefs, fetchSupported5eDocumentKeys, stableSrdId } from "@/lib/open5eApi";
import type { Open5eDocumentRef } from "@/lib/open5eApi";
import type { RulesetKey } from "@/types/ruleset.types";
import {
  requireEnv,
  installOpen5eUserAgent,
  createServiceClient,
  upsertBatch,
  parseSeedCliArgs,
  printAvailableDocuments,
  countByRuleset,
  assertRedistributableDocuments,
  DEFAULT_SRD_DOCUMENT_KEYS,
} from "./lib/seed-helpers";
import { pathToFileURL } from "node:url";

// ── row shape ─────────────────────────────────────────────────────────────────

type ImportedFields = ReturnType<typeof buildImportedFields>;
type CreateOnlyDefaults = ReturnType<typeof buildCreateOnlyDefaults>;

/**
 * `library_species` row: `buildImportedFields` + `buildCreateOnlyDefaults`, minus
 * `notes` (that field is `species`-table-only — a DM-private note column that
 * `library_species`, per the 20260724000002 migration, deliberately has no
 * equivalent of), plus the shared-table id and the source/source_title
 * override described above. `ruleset` is narrowed to non-null: like
 * `library_monsters`, `library_species.ruleset` is `NOT NULL` with a
 * `('2014'|'2024')` check, so any row from a non-5e-2014/2024 document (e.g.
 * a5e) is filtered out — loudly — before upsert rather than silently coerced.
 */
type SeededSpecies = Omit<ImportedFields, "ruleset" | "source"> &
  Omit<CreateOnlyDefaults, "notes"> & {
    id: string;
    ruleset: RulesetKey;
    source: string;
    source_title: string;
  };

/**
 * Maps one non-subspecies Open5e race into a `library_species` row, or `null` if
 * its document doesn't resolve to a supported ruleset (see `SeededSpecies`'s
 * doc comment above).
 */
export function buildSeededSpeciesRow(
  race: Parameters<typeof buildImportedFields>[0],
  documentMetadata?: ReadonlyMap<string, Open5eDocumentRef>,
): SeededSpecies | null {
  const imported = buildImportedFields(race, documentMetadata);
  if (!imported.ruleset) return null;
  const { notes: _notes, ...createOnlyDefaults } = buildCreateOnlyDefaults();
  return {
    ...imported,
    ...createOnlyDefaults,
    ruleset: imported.ruleset,
    id: stableSrdId(race.key),
    source: race.document.key,
    source_title: race.document.display_name ?? race.document.name,
  };
}

// ── dry run ───────────────────────────────────────────────────────────────────

function printDryRunSummary(rows: SeededSpecies[]): void {
  console.log("=== Dry run — no data written ===\n");
  console.log(`Total mapped: ${rows.length}`);
  const rulesetCounts = countByRuleset(rows);
  for (const [ruleset, count] of Object.entries(rulesetCounts)) {
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
      source: row.source,
      source_title: row.source_title,
      size: row.size,
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

  console.log(`=== Seeding library_species (sources: ${documentKeys.join(", ")}) ===\n`);

  console.log("Checking requested document(s) are licensed for hosted redistribution…");
  // The embedded `document` ref on a /v2/species/ record never carries
  // `licenses` (verified against the live API) — only the full
  // /v2/documents/ listing does. Fetched once, reused both for the
  // redistribution guard and as the source_license lookup map below.
  const documents = await fetchOpen5eDocumentRefs();
  assertRedistributableDocuments(documentKeys, documents);
  const documentMetadata = new Map(documents.map((document) => [document.key, document]));

  console.log("Step 1: Fetching + mapping species from Open5e v2…");
  const races = await fetchLibrarySpecies(documentKeys);
  const coreRaces = races.filter((race) => !race.is_subspecies);
  const subspeciesSkipped = races.length - coreRaces.length;
  if (subspeciesSkipped > 0) {
    console.log(`  Skipped ${subspeciesSkipped} subspecies row(s) — shared table holds core species only.`);
  }

  const mapped = coreRaces.map((race) => buildSeededSpeciesRow(race, documentMetadata));
  const rows = mapped.filter((row): row is SeededSpecies => row !== null);
  const unsupported = mapped.length - rows.length;
  if (unsupported > 0) {
    console.log(`  Skipped ${unsupported} species from a non-5e-2014/2024 document (no supported ruleset).`);
  }
  console.log(`  Mapped ${rows.length} species.\n`);

  if (parsed.dryRun) {
    printDryRunSummary(rows);
    return;
  }

  const env = requireEnv();
  const supabase = createServiceClient(env);

  console.log("Step 2: Upserting to library_species table…");
  await upsertBatch(supabase, "library_species", rows, "source_document_key,source_record_key");
  console.log(`  Done — ${rows.length} rows upserted.\n`);

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
