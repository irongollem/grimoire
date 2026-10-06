#!/usr/bin/env tsx
/**
 * Seeds the shared library_backgrounds table from Open5e v2 backgrounds.
 *
 * Reuses src/lib/library/open5eBackgroundImport.ts's fetchBackgrounds() — the single
 * source of truth for the Open5e v2 → background mapping — and adds only CLI
 * plumbing, the library row shape, and the Supabase upsert. Mirrors
 * seed-library-species.ts.
 *
 * What a library row says about its book is OUR slug, not Open5e's: `source` and
 * `source_document_key` are the `content_sources` key (a5e, taldorei, o5e, …),
 * which is what a campaign enables and what library_monsters / library_spells
 * carry. `source_record_key` stays Open5e's record key, and the id is
 * stableSrdId(source_record_key), so a run lands on the rows migration
 * library_backgrounds already made from the old per-user imports.
 *
 * Art is never written here: image_url and focal_point are left out of the upsert
 * payload, so a re-run does not take back a picture an admin has set.
 *
 * Run (default: every Open5e document that clears the redistribution guard and is
 * 5e-2014, 5e-2024 or A5E, which is 2014-compatible):
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-library-backgrounds.ts
 *   npm run seed-library-backgrounds
 *
 * Optional flags:
 *   --list             List available Open5e v2 documents and exit
 *   --dry-run          Fetch + map only; print row counts per edition and book; write nothing
 *   <key> [<key>…]     Seed only the listed document keys (OUR keys, e.g. srd-2014 a5e taldorei)
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
  LEGACY_DOCUMENT_KEY_ALIASES,
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

const REVERSE_DOCUMENT_KEY_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LEGACY_DOCUMENT_KEY_ALIASES).map(([ours, upstream]) => [upstream, ours]),
);

/** Maps an Open5e v2 document key to OUR slug for the book; identity when we have no alias. */
export function ourDocumentKey(open5eKey: string): string {
  return REVERSE_DOCUMENT_KEY_ALIASES[open5eKey] ?? open5eKey;
}

/** A5E ("Level Up") is built on the 2014 rules; the library has no third edition. */
function rulesetFor(row: BackgroundInsert): RulesetKey | null {
  if (row.ruleset) return row.ruleset;
  const gamesystem = (row.provenance as { document?: { gamesystem?: { key?: string } | null } } | null)
    ?.document?.gamesystem?.key;
  return gamesystem === "a5e" ? "2014" : null;
}

/**
 * Maps one mapped Open5e background into a `library_backgrounds` row, or `null`
 * when its document is neither 5e-2014, 5e-2024 nor A5E (no ruleset to file it under).
 */
export function buildSeededBackgroundRow(row: BackgroundInsert): SeededBackground | null {
  const ruleset = rulesetFor(row);
  if (!ruleset || !row.source_document_key || !row.source_record_key) return null;
  const { open5e_import: _import, ai_provenance: _ai, image_url: _image, focal_point: _focal, ...fields } = row;
  const book = ourDocumentKey(row.source_document_key);
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

/** Whether a document is one the library can hold backgrounds from: redistributable, and a 5e edition or A5E. */
export function isSeedableDocument(document: Open5eDocumentRef): boolean {
  const supported = rulesetForDocument(document) !== null || document.gamesystem?.key === "a5e";
  return supported && isRedistributable(document);
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
  const ourKeys = parsed.documentKeys.length
    ? parsed.documentKeys
    : documents.filter(isSeedableDocument).map((document) => ourDocumentKey(document.key));
  assertRedistributableDocuments(ourKeys, documents);
  console.log(`=== Seeding library_backgrounds (sources: ${ourKeys.join(", ")}) ===\n`);

  console.log("Step 1: Fetching + mapping backgrounds from Open5e v2…");
  const upstreamKeys = ourKeys.map((key) => LEGACY_DOCUMENT_KEY_ALIASES[key] ?? key);
  const fetched = await fetchBackgrounds(upstreamKeys);
  const mapped = fetched.map(buildSeededBackgroundRow);
  const rows = mapped.filter((row): row is SeededBackground => row !== null);
  if (rows.length < mapped.length) {
    console.log(`  Skipped ${mapped.length - rows.length} background(s) from a document with no supported ruleset.`);
  }
  console.log(`  Mapped ${rows.length} backgrounds.\n`);

  if (parsed.dryRun) {
    printDryRunSummary(rows);
    return;
  }

  const supabase = createServiceClient(requireEnv());
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
