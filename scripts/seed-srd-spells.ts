#!/usr/bin/env tsx
/**
 * Seeds the shared srd_spells table from Open5e v2 — dual-edition by default
 * (SRD 5.1 "srd-2014" + SRD 5.2 "srd-2024") — then backfills image_url +
 * image_focal_point from canonical srd_art_defaults rows.
 *
 * Reuses src/lib/open5eSpellImport.ts's fetchSrdSpells(), the single source
 * of truth for the Open5e v2 → row mapping (shared with the in-app admin
 * import flow). This script only adds CLI plumbing, the Supabase upsert, and
 * the SRD art backfill — it does not re-implement any field mapping.
 *
 * Run (seeds both 2014 + 2024 by default):
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-srd-spells.ts
 *   npm run seed-srd-spells
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
  fetchSrdSpells,
  planSrdSpellImport,
  type ImportedSrdSpell,
} from "@/lib/open5eSpellImport";
import { fetchSupported5eDocumentKeys } from "@/lib/open5eApi";
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
  DEFAULT_SRD_DOCUMENT_KEYS,
} from "./lib/seed-helpers";

// ── srd_spells table snapshot ────────────────────────────────────────────────

/**
 * Union of every column either the re-import plan (`planSrdSpellImport`) or
 * the art backfill's name map needs. Both previously issued their own full
 * `srd_spells` GET — one for `id,source_document_key,source_record_key,
 * mechanics_reviewed,image_url`, the other for `id,name` — doubling a fetch
 * that, at ~1400 rows, already needs pagination. Fetched once in `main()`
 * and reused for both.
 */
interface SrdSpellRow {
  id: string;
  name: string;
  source_document_key: string;
  source_record_key: string;
  mechanics_reviewed: boolean;
  image_url: string | null;
}

// ── art backfill from srd_art_defaults ───────────────────────────────────────

interface ArtDefaultRow {
  srd_slug: string;
  image_url: string;
  image_focal_point: { x: number; y: number } | null;
}

/**
 * Groups srd_spells row ids by lowercased name. srd_art_defaults keys art by
 * lower(name), but under dual-edition seeding a name can now match MULTIPLE
 * srd_spells rows (one per ruleset) — every matching row must get the art,
 * not just the first one found.
 */
export function groupIdsByLowerName(rows: ReadonlyArray<{ id: string; name: string }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { id, name } of rows) {
    const key = name.toLowerCase();
    const list = map.get(key);
    if (list) list.push(id);
    else map.set(key, [id]);
  }
  return map;
}

async function backfillArt(supabase: SupabaseClient, spells: ReadonlyArray<{ id: string; name: string }>): Promise<void> {
  const art = await fetchAllRows<ArtDefaultRow>((from, to) =>
    supabase
      .from("srd_art_defaults")
      .select("srd_slug,image_url,image_focal_point")
      .eq("content_type", "spell")
      .not("image_url", "is", null)
      .range(from, to)
      .returns<ArtDefaultRow[]>(),
  );
  if (!art.length) {
    console.log("  No canonical spell art found — skipping art backfill.");
    return;
  }
  console.log(`  Found ${art.length} spell art rows — backfilling srd_spells…`);

  const idsByName = groupIdsByLowerName(spells);

  const PATCH_BATCH = 25;
  let patched = 0;
  for (let i = 0; i < art.length; i += PATCH_BATCH) {
    await Promise.all(
      art.slice(i, i + PATCH_BATCH).flatMap(({ srd_slug, image_url, image_focal_point }) => {
        const ids = idsByName.get(srd_slug) ?? [];
        return ids.map(async (id) => {
          const { error } = await supabase
            .from("srd_spells")
            .update({ image_url, image_focal_point })
            .eq("id", id);
          if (error) throw error;
        });
      }),
    );
    patched = Math.min(i + PATCH_BATCH, art.length);
    process.stdout.write(`\r  Art patched ${patched} / ${art.length}`);
  }
  console.log();
}

// ── dry run ───────────────────────────────────────────────────────────────────

function printDryRunSummary(rows: ImportedSrdSpell[]): void {
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

  console.log(`=== Seeding srd_spells (sources: ${documentKeys.join(", ")}) ===\n`);

  console.log("Step 1: Fetching + mapping spells from Open5e v2…");
  const rows = await fetchSrdSpells(documentKeys);
  console.log(`  Mapped ${rows.length} spells.\n`);

  if (parsed.dryRun) {
    printDryRunSummary(rows);
    return;
  }

  const env = requireEnv();
  const supabase = createServiceClient(env);

  console.log("Step 2: Upserting to srd_spells table…");
  // Re-runs must not clobber admin-reviewed rows (mechanics_reviewed = true)
  // or churn ids/art on existing rows — planSrdSpellImport (shared with the
  // in-app import path) filters and pins those before the upsert. See #560.
  // Single paginated fetch of the full table (~1400 rows, past PostgREST's
  // unpaginated cap) — reused below for the art backfill's name map instead
  // of re-fetching the whole table a second time.
  const existing = await fetchAllRows<SrdSpellRow>((from, to) =>
    supabase
      .from("srd_spells")
      .select("id,name,source_document_key,source_record_key,mechanics_reviewed,image_url")
      .range(from, to)
      .returns<SrdSpellRow[]>(),
  );
  const plan = planSrdSpellImport(rows, existing);
  if (plan.skippedReviewed > 0) {
    console.log(`  Skipping ${plan.skippedReviewed} admin-reviewed rows (mechanics_reviewed).`);
  }
  await upsertBatch(supabase, "srd_spells", plan.rows, "source_document_key,source_record_key");
  console.log(`  Done — ${plan.rows.length} rows upserted.\n`);

  console.log("Step 3: Backfilling art from srd_art_defaults…");
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
