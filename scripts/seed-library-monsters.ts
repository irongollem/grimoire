#!/usr/bin/env tsx
/**
 * Seeds the shared library_monsters table from Open5e v2 — dual-edition by
 * default (SRD 5.1 "srd-2014" + SRD 5.2 "srd-2024") — then backfills
 * image_url + portrait_focal_point from library_monster_art_canonical.
 *
 * Reuses src/lib/library/open5eMonsterImport.ts's fetchOpen5eMonsters(), the single
 * source of truth for the Open5e v2 → row mapping (shared with the in-app
 * admin import flow). This script only adds CLI plumbing, the library_monsters.id
 * derivation (MonsterInsert has no `id`), the Supabase upsert, and the SRD
 * art backfill — it does not re-implement any field mapping.
 *
 * Run (seeds both 2014 + 2024 by default):
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-library-monsters.ts
 *   npm run seed-library-monsters
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

import { fetchOpen5eDocuments, fetchOpen5eMonsters } from "@/lib/library/open5eMonsterImport";
import { structureStatBlock } from "@/rules/statBlock/structureStatBlock";
import type { MonsterInsert, MonsterStatBlock } from "@/types/monster.types";
import type { ActionStructure, StatBlockEntry } from "@/types/statBlock.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { fetchOpen5eDocumentRefs, fetchSupported5eDocumentKeys, stableSrdId } from "@/lib/library/open5eApi";
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

/**
 * Derives the app-facing library_monsters.id (stable slug, e.g. "srd_srd_2024_owlbear")
 * from the Open5e v2 source_record_key. MonsterInsert (from the shared mapper)
 * has no `id` — the table's `id text primary key` is a seed-only concern, unlike
 * library_spells where ImportedLibrarySpell already carries a stable `id` (also derived
 * from `stableSrdId`, in src/lib/library/open5eSpellImport.ts). Thin wrapper kept as its
 * own named export for the test suite and call-site clarity. Open5e v2 record
 * keys are already document-prefixed (e.g. "srd-2024_owlbear" vs. "srd_owlbear"),
 * so this stays unique across editions without extra suffixing.
 */
export function libraryMonsterId(sourceRecordKey: string): string {
  return stableSrdId(sourceRecordKey);
}

/**
 * `ruleset` narrowed to non-null: the shared monster mapper (unlike the spell
 * mapper, which self-filters unsupported gamesystems) always sets
 * `ruleset: rulesetForDocument(monster.document)`, which is `null` for a
 * non-5e gamesystem (e.g. a5e). library_monsters.ruleset is NOT NULL with a
 * ('2014'|'2024') check, so those rows are filtered out — loudly — before
 * upsert rather than silently coerced. In practice this only bites explicit
 * non-5e document-key args; the default and --all paths never hit it.
 */
// `campaign_id` is excluded because library_monsters has no such column — see
// mapOpen5eV2Monster. The library-owned fields are excluded by seedRow below.
type MappedMonster = Omit<MonsterInsert, "ruleset" | "campaign_id"> & { ruleset: RulesetKey };
type SeededMonster = Omit<MappedMonster, "habitat" | "tags" | "notes" | "image_url" | "cutout_url"> & { id: string };

/**
 * The upserted row: only what Open5e supplies, so a re-run refreshes the stat
 * block and source metadata and leaves everything the library owns alone
 * (docs/library-reimport.md). The mapper fills `habitat`, `tags`, `notes` and
 * `image_url` with empties because it builds a whole `MonsterInsert`; sent as
 * they are, an upsert wiped them on every re-run, and `cutout_url` (which lives
 * in library_monster_art_canonical, not on this table) failed the whole batch
 * with PGRST204. `description` never comes from the mapper at all.
 */
export function seedRow(monster: MappedMonster, id: string): SeededMonster {
  const { habitat: _habitat, tags: _tags, notes: _notes, image_url: _imageUrl, cutout_url: _cutoutUrl, ...open5eFields } = monster;
  return { ...open5eFields, id };
}

// ── structures better than the parser's ───────────────────────────────────────

const ENTRY_LISTS = [
  "special_abilities",
  "actions",
  "bonus_actions",
  "reactions",
  "legendary_actions",
  "lair_actions",
] as const;

/** What a stored row holds for one entry: the old prose shape has no `structured`. */
function isSettledStructure(value: unknown): value is ActionStructure {
  if (typeof value !== "object" || value === null) return false;
  const source = (value as { source?: unknown }).source;
  return source === "extracted" || source === "manual";
}

/**
 * Carries the structures an agent (`extracted`) or a DM (`manual`) settled over
 * from the stored row onto a freshly mapped one (#1017). The mapper's structures
 * are all `parsed`; without this a re-seed would replace a hand-checked structure
 * with whatever the parser makes of the prose. An entry matches on list + name +
 * description, so a changed description (a new edition's wording) gets a fresh
 * parse. `structureStatBlock` then keeps the carried structure only if it still
 * passes the prose check (`manual` is always kept).
 *
 * `existing` is whatever the table holds, which may predate the structured shape
 * entirely, so it is read defensively rather than trusted as a `MonsterStatBlock`.
 */
export function preserveSettledStructures(fresh: MonsterStatBlock, existing: unknown): MonsterStatBlock {
  if (typeof existing !== "object" || existing === null) return fresh;
  const old = existing as Record<string, unknown>;
  const carried: Partial<Record<(typeof ENTRY_LISTS)[number], StatBlockEntry[]>> = {};
  let any = false;
  for (const list of ENTRY_LISTS) {
    const entries = fresh[list];
    if (!entries) continue;
    const oldEntries = Array.isArray(old[list]) ? (old[list] as Array<Partial<StatBlockEntry>>) : [];
    carried[list] = entries.map((entry) => {
      const match = oldEntries.find(
        (o) => o.name === entry.name && o.description === entry.description && isSettledStructure(o.structured),
      );
      if (!match || !isSettledStructure(match.structured)) return entry;
      any = true;
      return { ...entry, structured: match.structured };
    });
  }
  return any ? structureStatBlock({ ...fresh, ...carried }) : fresh;
}

interface ExistingStatBlockRow {
  source_record_key: string;
  stat_block: unknown;
}

/** The stored stat blocks of the rows about to be re-seeded, keyed by `source_record_key`. */
async function fetchExistingStatBlocks(
  supabase: SupabaseClient,
  documentKeys: readonly string[],
): Promise<Map<string, unknown>> {
  const rows = await fetchAllRows<ExistingStatBlockRow>((from, to) =>
    supabase
      .from("library_monsters")
      .select("source_record_key,stat_block")
      .in("source_document_key", [...documentKeys])
      .order("id")
      .range(from, to)
      .returns<ExistingStatBlockRow[]>(),
  );
  return new Map(rows.map((row) => [row.source_record_key, row.stat_block]));
}

// ── art backfill from library_monster_art_canonical ───────────────────────────────
// Reads the dedicated canonical table, not library_monster_art. Canonical art was
// split out of that per-user table in 20260730000010 (#584) so it is no longer
// owned by whoever uploaded it — library_monster_art now holds only private per-DM
// overrides, which must never be baked into the shared library_monsters rows, and
// its `is_canonical` discriminator is gone.

interface MonsterArtRow {
  entry_id: string;
  image_url: string;
  portrait_focal_point: { x: number; y: number } | null;
}

async function backfillArt(supabase: SupabaseClient): Promise<void> {
  const art = await fetchAllRows<MonsterArtRow>((from, to) =>
    supabase
      .from("library_monster_art_canonical")
      .select("entry_id,image_url,portrait_focal_point")
      .not("image_url", "is", null)
      .range(from, to)
      .returns<MonsterArtRow[]>(),
  );
  if (!art.length) {
    console.log("  No canonical art found — skipping art backfill.");
    return;
  }
  console.log(`  Found ${art.length} canonical art rows — backfilling library_monsters…`);
  const PATCH_BATCH = 25;
  for (let i = 0; i < art.length; i += PATCH_BATCH) {
    await Promise.all(
      art.slice(i, i + PATCH_BATCH).map(async ({ entry_id, image_url, portrait_focal_point }) => {
        const { error } = await supabase
          .from("library_monsters")
          .update({ image_url, portrait_focal_point })
          .eq("id", entry_id);
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
      is_shared: row.is_shared,
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

  console.log(`=== Seeding library_monsters (sources: ${documentKeys.join(", ")}) ===\n`);

  console.log("Checking requested document(s) are licensed for hosted redistribution…");
  assertRedistributableDocuments(documentKeys, await fetchOpen5eDocumentRefs());

  console.log("Step 1: Fetching + mapping monsters from Open5e v2…");
  const mapped = await fetchOpen5eMonsters(documentKeys);
  const supported = mapped.filter(
    (monster): monster is MappedMonster =>
      monster.ruleset != null,
  );
  const unsupported = mapped.length - supported.length;
  if (unsupported > 0) {
    console.log(`  Skipped ${unsupported} monster(s) from a non-5e-2014/2024 document (no supported ruleset).`);
  }
  const rows: SeededMonster[] = supported.map((monster) => {
    const sourceRecordKey = monster.source_record_key;
    if (!sourceRecordKey) {
      throw new Error(`Monster "${monster.name}" has no source_record_key — cannot derive a stable library_monsters.id.`);
    }
    return seedRow(monster, libraryMonsterId(sourceRecordKey));
  });
  console.log(`  Mapped ${rows.length} monsters.\n`);

  if (parsed.dryRun) {
    printDryRunSummary(rows);
    return;
  }

  const env = requireEnv();
  const supabase = createServiceClient(env);

  console.log("Step 2: Upserting to library_monsters table…");
  const existing = await fetchExistingStatBlocks(supabase, documentKeys);
  const seeded = rows.map((row) => ({
    ...row,
    // Every row has a key (checked when it was mapped); the guard is for the type.
    stat_block: row.source_record_key
      ? preserveSettledStructures(row.stat_block, existing.get(row.source_record_key))
      : row.stat_block,
  }));
  await upsertBatch(supabase, "library_monsters", seeded, "source_document_key,source_record_key", { insertOnly: parsed.insertOnly });
  console.log(`  Done — ${rows.length} rows upserted.\n`);

  console.log("Step 3: Backfilling art from library_monster_art_canonical…");
  await backfillArt(supabase);
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
