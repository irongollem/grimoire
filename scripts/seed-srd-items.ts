#!/usr/bin/env tsx
/**
 * Seeds the shared srd_items table (issue #303) from two sources:
 *
 *   1. Open5e v2 weapons/armor/magicitems — dual-edition by default (SRD 5.1
 *      "srd-2014" + SRD 5.2 "srd-2024"), via src/lib/open5eImport.ts's
 *      fetchSrdItems(), the single source of truth for the Open5e v2 → row
 *      mapping (shared with the in-app admin import flow). These rows keep
 *      their mapped ruleset ('2014'/'2024').
 *   2. The grimoire-bundled mundane datasets (src/data/gear.ts,
 *      provisions.ts, services.ts, ammunition.ts) — ALWAYS included
 *      regardless of the requested document keys, since they're
 *      grimoire-owned, not Open5e-sourced. Unlike the per-user
 *      useImportSrdItems() import this seed replaces, these are stamped
 *      `ruleset: null` (edition-neutral) rather than "2014" — mundane gear
 *      must show up in both 2014 and 2024 campaigns, not just 2014 ones.
 *
 * Then backfills image_url + image_focal_point from canonical
 * srd_art_defaults rows (content_type = 'item').
 *
 * This script only adds CLI plumbing, the srd_items.id derivation
 * (ItemInsert has no `id`), the bundled-dataset identity derivation, the
 * Supabase upsert, and the SRD art backfill — it does not re-implement the
 * Open5e → row field mapping (that lives in src/lib/open5eImport.ts).
 *
 * Run (seeds both 2014 + 2024, plus the bundled datasets, by default):
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-srd-items.ts
 *   npm run seed-srd-items
 *
 * Optional flags:
 *   --all              Seed Open5e items from every supported 5e-gamesystem document (2014, 2024, and any future ones)
 *   --list              List available Open5e v2 documents and exit
 *   --dry-run           Fetch + map only; print row counts per ruleset + 2 sample rows (one API, one bundled); write nothing
 *   <key> [<key>…]      Seed Open5e items only from the listed document keys (default: srd-2014 srd-2024)
 *
 * The bundled datasets are seeded unconditionally regardless of which
 * document keys are requested — they aren't Open5e content.
 *
 * Required env vars in .env.local (not required for --list or --dry-run):
 *   VITE_SUPABASE_URL         — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 */

import { fetchSrdItems } from "@/lib/open5eImport";
import { fetchAll, fetchSupported5eDocumentKeys, rulesetForDocument, slugifyKey, stableSrdId } from "@/lib/open5eApi";
import type { Open5eDocumentRef } from "@/lib/open5eApi";
import type { ItemInsert, StaticItemData } from "@/types/item.types";
import type { RulesetKey } from "@/types/ruleset.types";
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
  type DocumentSummary,
} from "./lib/seed-helpers";

/**
 * Unlike the monster/spell/background importers, src/lib/open5eImport.ts
 * (items) has no `fetchOpen5eDocuments()` of its own — each of those files
 * independently duplicates the same "list 5e-gamesystem documents" query.
 * Rather than adding a fourth copy there (out of scope for this script) or
 * importing a same-named helper from an unrelated importer module, this is
 * reimplemented locally from the shared open5eApi.ts primitives.
 */
async function fetchOpen5eDocumentSummaries(): Promise<DocumentSummary[]> {
  const docs = await fetchAll<Open5eDocumentRef>("https://api.open5e.com/v2/documents/");
  return docs
    .filter((document) => rulesetForDocument(document) !== null)
    .map((document) => ({ slug: document.key, title: document.display_name || document.name }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

// ── row shape ─────────────────────────────────────────────────────────────────

/**
 * srd_items row, seed-script side. `spell_ids` (not a srd_items column — see
 * the migration), `campaign_id`, and `dm_notes` (per-user-only concerns, not
 * meaningful on a shared/admin-only table) are dropped from `ItemInsert`.
 * `ruleset` is narrowed to `RulesetKey | null` (never `undefined`): API rows
 * always carry one of the two supported rulesets (unsupported-gamesystem
 * rows are filtered out below), bundled rows are explicitly `null`.
 */
type SeededItem = Omit<ItemInsert, "spell_ids" | "campaign_id" | "dm_notes" | "ruleset"> & {
  id: string;
  ruleset: RulesetKey | null;
};

const BUNDLED_SOURCE_DOCUMENT_KEY = "grimoire-bundled";

/** Type guard: narrows an ItemInsert's optional `ruleset`/`source_record_key` to non-null. */
function isSupportedApiItem(item: ItemInsert): item is ItemInsert & { ruleset: RulesetKey; source_record_key: string } {
  return (item.ruleset === "2014" || item.ruleset === "2024") && item.source_record_key != null;
}

/**
 * Maps Open5e-sourced ItemInsert rows (already carrying full identity
 * metadata from open5eImport.ts's `metadata()`) to SeededItem rows. Drops
 * anything without a supported ruleset or a source_record_key (no stable id
 * derivable) — mirrors seed-srd-monsters.ts's non-5e-document handling.
 */
function mapApiRows(items: readonly ItemInsert[]): { rows: SeededItem[]; skipped: number } {
  const supported = items.filter(isSupportedApiItem);
  const rows: SeededItem[] = supported.map((item) => {
    const { spell_ids: _spellIds, campaign_id: _campaignId, dm_notes: _dmNotes, ...rest } = item;
    return { ...rest, id: stableSrdId(item.source_record_key) };
  });
  return { rows, skipped: items.length - supported.length };
}

/**
 * Maps the grimoire-bundled static datasets (GEAR/PROVISIONS/SERVICES/
 * AMMUNITION) to SeededItem rows. Identity fields are derived the same way
 * useImportSrdItems() (src/composables/useItems.ts) derives them for its
 * per-user import — conceptual_key = slugified name, source_document_key =
 * "grimoire-bundled", source_record_key = "grimoire-bundled:<slug>",
 * source_revision = "bundled", provenance = { provider: "grimoire" } — with
 * one deliberate difference: `ruleset: null`. The old per-user import
 * stamped these "2014", which starved 2024 campaigns of mundane gear;
 * mundane gear is edition-neutral and belongs in both.
 *
 * `source`/`source_title` are left exactly as the data files define them
 * (mostly "srd", some `null` for grimoire-original crafting ingredients) —
 * not overridden.
 */
function mapBundledRows(items: readonly StaticItemData[]): SeededItem[] {
  return items.map((item) => {
    const slug = slugifyKey(item.name);
    const sourceRecordKey = `${BUNDLED_SOURCE_DOCUMENT_KEY}:${slug}`;
    const { spell_ids: _spellIds, campaign_id: _campaignId, dm_notes: _dmNotes, ...rest } = item;
    return {
      ...rest,
      curse_description: null,
      is_arcane_focus: false,
      ruleset: null,
      conceptual_key: slug,
      source_document_key: BUNDLED_SOURCE_DOCUMENT_KEY,
      source_record_key: sourceRecordKey,
      source_revision: "bundled",
      source_license: null,
      provenance: { provider: "grimoire" },
      id: stableSrdId(sourceRecordKey),
    };
  });
}

async function loadBundledDatasets(): Promise<SeededItem[]> {
  const [{ GEAR }, { PROVISIONS }, { SERVICES }, { AMMUNITION }] = await Promise.all([
    import("@/data/gear"),
    import("@/data/provisions"),
    import("@/data/services"),
    import("@/data/ammunition"),
  ]);
  return mapBundledRows([...GEAR, ...PROVISIONS, ...SERVICES, ...AMMUNITION]);
}

// ── art backfill from srd_art_defaults ───────────────────────────────────────

interface ArtDefaultRow {
  srd_slug: string;
  image_url: string;
  image_focal_point: { x: number; y: number } | null;
}

/**
 * Groups srd_items row ids by lowercased name. srd_art_defaults keys art by
 * lower(name), and a name can match MULTIPLE srd_items rows — the same
 * weapon/armor appears once per ruleset (2014 + 2024) — so every matching
 * row must get the art, not just the first one found. Mirrors
 * seed-srd-spells.ts's groupIdsByLowerName.
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

async function backfillArt(supabase: SupabaseClient, items: ReadonlyArray<{ id: string; name: string }>): Promise<void> {
  const art = await fetchAllRows<ArtDefaultRow>((from, to) =>
    supabase
      .from("srd_art_defaults")
      .select("srd_slug,image_url,image_focal_point")
      .eq("content_type", "item")
      .not("image_url", "is", null)
      .range(from, to)
      .returns<ArtDefaultRow[]>(),
  );
  if (!art.length) {
    console.log("  No canonical item art found — skipping art backfill.");
    return;
  }
  console.log(`  Found ${art.length} item art rows — backfilling srd_items…`);

  const idsByName = groupIdsByLowerName(items);

  const PATCH_BATCH = 25;
  let patched = 0;
  for (let i = 0; i < art.length; i += PATCH_BATCH) {
    await Promise.all(
      art.slice(i, i + PATCH_BATCH).flatMap(({ srd_slug, image_url, image_focal_point }) => {
        const ids = idsByName.get(srd_slug) ?? [];
        return ids.map(async (id) => {
          const { error } = await supabase
            .from("srd_items")
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

/** Tallies rows per ruleset for the --dry-run summary, bucketing `null` under "neutral" (bundled gear). */
function countByRulesetOrNeutral(rows: ReadonlyArray<{ ruleset: RulesetKey | null }>): Record<string, number> {
  return countByRuleset(rows.map((row) => ({ ruleset: row.ruleset ?? "neutral" })));
}

function printDryRunSummary(rows: SeededItem[]): void {
  console.log("=== Dry run — no data written ===\n");
  console.log(`Total mapped: ${rows.length}`);
  const counts = countByRulesetOrNeutral(rows);
  for (const [ruleset, count] of Object.entries(counts)) {
    console.log(`  ruleset ${ruleset}: ${count}`);
  }

  const apiSample = rows.find((row) => row.source_document_key !== BUNDLED_SOURCE_DOCUMENT_KEY);
  const bundledSample = rows.find((row) => row.source_document_key === BUNDLED_SOURCE_DOCUMENT_KEY);

  console.log("\nSample rows:");
  for (const row of [apiSample, bundledSample]) {
    if (!row) continue;
    console.log(JSON.stringify({
      id: row.id,
      name: row.name,
      item_type: row.item_type,
      ruleset: row.ruleset,
      conceptual_key: row.conceptual_key,
      source_document_key: row.source_document_key,
      source_record_key: row.source_record_key,
    }, null, 2));
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  installOpen5eUserAgent();
  const parsed = parseSeedCliArgs(process.argv.slice(2));

  if (parsed.list) {
    console.log("Fetching available Open5e v2 documents…");
    printAvailableDocuments(await fetchOpen5eDocumentSummaries());
    return;
  }

  const documentKeys = parsed.all
    ? await fetchSupported5eDocumentKeys()
    : parsed.documentKeys.length
      ? parsed.documentKeys
      : [...DEFAULT_SRD_DOCUMENT_KEYS];

  console.log(`=== Seeding srd_items (Open5e sources: ${documentKeys.join(", ")}; plus grimoire-bundled) ===\n`);

  console.log("Step 1: Fetching + mapping items from Open5e v2…");
  const apiItems = await fetchSrdItems(documentKeys);
  const { rows: apiRows, skipped } = mapApiRows(apiItems);
  if (skipped > 0) {
    console.log(`  Skipped ${skipped} item(s) with no supported ruleset or no source_record_key.`);
  }
  console.log(`  Mapped ${apiRows.length} Open5e items.`);

  console.log("Step 2: Loading grimoire-bundled datasets (gear, provisions, services, ammunition)…");
  const bundledRows = await loadBundledDatasets();
  console.log(`  Mapped ${bundledRows.length} bundled items.\n`);

  const rows: SeededItem[] = [...apiRows, ...bundledRows];

  if (parsed.dryRun) {
    printDryRunSummary(rows);
    return;
  }

  const env = requireEnv();
  const supabase = createServiceClient(env);

  console.log("Step 3: Upserting to srd_items table…");
  await upsertBatch(supabase, "srd_items", rows, "source_document_key,source_record_key");
  console.log(`  Done — ${rows.length} rows upserted.\n`);

  console.log("Step 4: Backfilling art from srd_art_defaults…");
  await backfillArt(supabase, rows);
  console.log("  Art backfill complete.\n");

  console.log("=== Seeding complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
