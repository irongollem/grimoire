#!/usr/bin/env tsx
/**
 * Seeds the shared library_backgrounds table from Open5e v2 backgrounds.
 *
 * Reuses src/lib/library/open5eBackgroundImport.ts's fetchBackgrounds() — the single
 * source of truth for the Open5e v2 → background mapping — and adds only CLI
 * plumbing, the library row shape, and the Supabase upsert. Mirrors
 * seed-library-species.ts.
 *
 * `source` and `source_document_key` are Open5e's document key, which is also
 * the `content_sources` key a campaign enables. `source_record_key` is Open5e's
 * record key; a new row's id is stableSrdId(source_record_key) and an existing
 * row keeps the id it has (carryExistingIds).
 *
 * Art is never written here: image_url and focal_point are left out of the upsert
 * payload, so a re-run does not take back a picture an admin has set.
 *
 * Run (default: every Open5e document that clears the redistribution guard and is
 * 5e-2014 or 5e-2024; A5E is not touched):
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-library-backgrounds.ts
 *   npm run seed-library-backgrounds
 *
 * Optional flags:
 *   --list             List available Open5e v2 documents and exit
 *   --dry-run          Fetch + map only; print row counts per edition and book; write nothing
 *   <key> [<key>…]     Seed only the listed document keys (Open5e document keys, e.g. srd-2014 tdcs)
 *
 * Required env vars in .env.local (not required for --list or --dry-run):
 *   VITE_SUPABASE_URL         — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 */

import { fetchBackgrounds } from "@/lib/library/open5eBackgroundImport";
import { fetchOpen5eDocuments } from "@/lib/library/open5eMonsterImport";
import {
  fetchOpen5eDocumentRefs,
  isRedistributable,
  rulesetForDocument,
  stableSrdId,
} from "@/lib/library/open5eApi";
import type { Open5eDocumentRef } from "@/lib/library/open5eApi";
import type { BackgroundInsert } from "@/types/background.types";
import type { RulesetKey } from "@/types/ruleset.types";
import {
  requireEnv,
  installOpen5eUserAgent,
  createServiceClient,
  upsertBatch,
  fetchStoredIdentities,
  carryExistingIds,
  parseSeedCliArgs,
  printAvailableDocuments,
  countByRuleset,
  assertRedistributableDocuments,
} from "./lib/seed-helpers";
import { pathToFileURL } from "node:url";

// ── row shape ─────────────────────────────────────────────────────────────────

/**
 * A `library_backgrounds` row as seeded: the mapped background minus everything
 * that is the per-user table's (owner, import flag, AI provenance) and minus the
 * art, which the seed never touches. `ruleset` is narrowed to non-null: the
 * column is NOT NULL with a ('2014'|'2024') check.
 */
export type SeededBackground = Omit<
  BackgroundInsert,
  "ruleset" | "open5e_import" | "ai_provenance" | "image_url" | "focal_point"
> & {
  id: string;
  ruleset: RulesetKey;
  source: string;
  source_title: string;
  source_document_key: string;
  source_record_key: string;
};

/**
 * Maps one mapped Open5e background into a `library_backgrounds` row, or `null`
 * when its document is neither 5e-2014 nor 5e-2024 (no ruleset to file it under; A5E is frozen).
 */
export function buildSeededBackgroundRow(row: BackgroundInsert): SeededBackground | null {
  const ruleset = row.ruleset;
  if (!ruleset || !row.source_document_key || !row.source_record_key) return null;
  const { open5e_import: _import, ai_provenance: _ai, image_url: _image, focal_point: _focal, ...fields } = row;
  const book = row.source_document_key;
  return {
    ...fields,
    id: stableSrdId(row.source_record_key),
    ruleset,
    source: book,
    source_title: row.source_title ?? book,
    source_document_key: book,
    source_record_key: row.source_record_key,
  };
}

/** Whether a document is one the library can hold backgrounds from: redistributable, and a 5e edition. */
export function isSeedableDocument(document: Open5eDocumentRef): boolean {
  return rulesetForDocument(document) !== null && isRedistributable(document);
}

// ── dry run ───────────────────────────────────────────────────────────────────

function printDryRunSummary(rows: SeededBackground[]): void {
  console.log("=== Dry run, no data written ===\n");
  console.log(`Total mapped: ${rows.length}`);
  for (const [ruleset, count] of Object.entries(countByRuleset(rows))) {
    console.log(`  ruleset ${ruleset}: ${count}`);
  }
  const perBook = new Map<string, number>();
  for (const row of rows) perBook.set(row.source, (perBook.get(row.source) ?? 0) + 1);
  console.log("\nPer book:");
  for (const [book, count] of [...perBook].sort()) console.log(`  ${book.padEnd(24)} ${count}`);
  console.log("\nSample rows:");
  for (const row of rows.slice(0, 2)) {
    console.log(JSON.stringify({
      id: row.id,
      name: row.name,
      ruleset: row.ruleset,
      conceptual_key: row.conceptual_key,
      source: row.source,
      source_document_key: row.source_document_key,
      source_record_key: row.source_record_key,
      asi_ability_trio: row.asi_ability_trio,
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

  console.log("Checking documents are licensed for hosted redistribution…");
  const documents = await fetchOpen5eDocumentRefs();
  const documentKeys = parsed.documentKeys.length
    ? parsed.documentKeys
    : documents.filter(isSeedableDocument).map((document) => document.key);
  assertRedistributableDocuments(documentKeys, documents);
  console.log(`=== Seeding library_backgrounds (sources: ${documentKeys.join(", ")}) ===\n`);

  console.log("Step 1: Fetching + mapping backgrounds from Open5e v2…");
  const fetched = await fetchBackgrounds(documentKeys);
  const mapped = fetched.map(buildSeededBackgroundRow);
  const minted = mapped.filter((row): row is SeededBackground => row !== null);
  if (minted.length < mapped.length) {
    console.log(`  Skipped ${mapped.length - minted.length} background(s) from a document with no supported ruleset.`);
  }
  console.log(`  Mapped ${minted.length} backgrounds.\n`);

  if (parsed.dryRun) {
    printDryRunSummary(minted);
    return;
  }

  const supabase = createServiceClient(requireEnv());
  const rows = carryExistingIds(minted, await fetchStoredIdentities(supabase, "library_backgrounds"));
  console.log("Step 2: Upserting to library_backgrounds table…");
  await upsertBatch(supabase, "library_backgrounds", rows, "source_document_key,source_record_key", { insertOnly: parsed.insertOnly });
  console.log(`  Done, ${rows.length} rows upserted.\n`);
  console.log("=== Seeding complete ===");
}

// Entry-point guard: the test imports the helpers above, and a plain `import` must
// not reach the network.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
