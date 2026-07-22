#!/usr/bin/env tsx
/**
 * Seeds the shared srd_monsters table from Open5e v2 — dual-edition by
 * default (SRD 5.1 "srd-2014" + SRD 5.2 "srd-2024") — then backfills
 * image_url + portrait_focal_point from any canonical rows in srd_monster_art.
 *
 * Reuses src/lib/open5eMonsterImport.ts's fetchSrdMonsters(), the single
 * source of truth for the Open5e v2 → row mapping (shared with the in-app
 * admin import flow). This script only adds CLI plumbing, the srd_monsters.id
 * derivation (MonsterInsert has no `id`), the Supabase upsert, and the SRD
 * art backfill — it does not re-implement any field mapping.
 *
 * Run (seeds both 2014 + 2024 by default):
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-srd-monsters.ts
 *   npm run seed-srd-monsters
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

import { fetchOpen5eDocuments, fetchSrdMonsters } from "@/lib/open5eMonsterImport";
import type { MonsterInsert } from "@/types/monster.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { fetchSupported5eDocumentKeys, stableSrdId } from "@/lib/open5eApi";
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

/**
 * Derives the app-facing srd_monsters.id (stable slug, e.g. "srd_srd_2024_owlbear")
 * from the Open5e v2 source_record_key. MonsterInsert (from the shared mapper)
 * has no `id` — the table's `id text primary key` is a seed-only concern, unlike
 * srd_spells where ImportedSrdSpell already carries a stable `id` (also derived
 * from `stableSrdId`, in src/lib/open5eSpellImport.ts). Thin wrapper kept as its
 * own named export for the test suite and call-site clarity. Open5e v2 record
 * keys are already document-prefixed (e.g. "srd-2024_owlbear" vs. "srd_owlbear"),
 * so this stays unique across editions without extra suffixing.
 */
export function srdMonsterId(sourceRecordKey: string): string {
  return stableSrdId(sourceRecordKey);
}

/**
 * `ruleset` narrowed to non-null: the shared monster mapper (unlike the spell
 * mapper, which self-filters unsupported gamesystems) always sets
 * `ruleset: rulesetForDocument(monster.document)`, which is `null` for a
 * non-5e gamesystem (e.g. a5e). srd_monsters.ruleset is NOT NULL with a
 * ('2014'|'2024') check, so those rows are filtered out — loudly — before
 * upsert rather than silently coerced. In practice this only bites explicit
 * non-5e document-key args; the default and --all paths never hit it.
 */
type SeededMonster = Omit<MonsterInsert, "ruleset"> & { id: string; ruleset: RulesetKey };

// ── art backfill from srd_monster_art ────────────────────────────────────────

interface MonsterArtRow {
  srd_id: string;
  image_url: string;
  portrait_focal_point: { x: number; y: number } | null;
}

async function backfillArt(supabase: SupabaseClient): Promise<void> {
  const art = await fetchAllRows<MonsterArtRow>((from, to) =>
    supabase
      .from("srd_monster_art")
      .select("srd_id,image_url,portrait_focal_point")
      .eq("is_canonical", true)
      .not("image_url", "is", null)
      .range(from, to)
      .returns<MonsterArtRow[]>(),
  );
  if (!art.length) {
    console.log("  No canonical art found — skipping art backfill.");
    return;
  }
  console.log(`  Found ${art.length} canonical art rows — backfilling srd_monsters…`);
  const PATCH_BATCH = 25;
  for (let i = 0; i < art.length; i += PATCH_BATCH) {
    await Promise.all(
      art.slice(i, i + PATCH_BATCH).map(async ({ srd_id, image_url, portrait_focal_point }) => {
        const { error } = await supabase
          .from("srd_monsters")
          .update({ image_url, portrait_focal_point })
          .eq("id", srd_id);
        if (error) throw error;
      }),
    );
    process.stdout.write(`\r  Art patched ${Math.min(i + PATCH_BATCH, art.length)} / ${art.length}`);
  }
  console.log();
}

// ── dry run ───────────────────────────────────────────────────────────────────

function printDryRunSummary(rows: SeededMonster[]): void {
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
      monster_type: row.monster_type,
      is_srd: row.is_srd,
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

  console.log(`=== Seeding srd_monsters (sources: ${documentKeys.join(", ")}) ===\n`);

  console.log("Step 1: Fetching + mapping monsters from Open5e v2…");
  const mapped = await fetchSrdMonsters(documentKeys);
  const supported = mapped.filter(
    (monster): monster is MonsterInsert & { ruleset: RulesetKey } => monster.ruleset != null,
  );
  const unsupported = mapped.length - supported.length;
  if (unsupported > 0) {
    console.log(`  Skipped ${unsupported} monster(s) from a non-5e-2014/2024 document (no supported ruleset).`);
  }
  const rows: SeededMonster[] = supported.map((monster) => {
    const sourceRecordKey = monster.source_record_key;
    if (!sourceRecordKey) {
      throw new Error(`Monster "${monster.name}" has no source_record_key — cannot derive a stable srd_monsters.id.`);
    }
    return { ...monster, id: srdMonsterId(sourceRecordKey) };
  });
  console.log(`  Mapped ${rows.length} monsters.\n`);

  if (parsed.dryRun) {
    printDryRunSummary(rows);
    return;
  }

  const env = requireEnv();
  const supabase = createServiceClient(env);

  console.log("Step 2: Upserting to srd_monsters table…");
  await upsertBatch(supabase, "srd_monsters", rows, "source_document_key,source_record_key");
  console.log(`  Done — ${rows.length} rows upserted.\n`);

  console.log("Step 3: Backfilling art from canonical srd_monster_art…");
  await backfillArt(supabase);
  console.log("  Art backfill complete.\n");

  console.log("=== Seeding complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
