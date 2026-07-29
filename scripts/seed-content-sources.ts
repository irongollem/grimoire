#!/usr/bin/env tsx
/**
 * Seeds the public.content_sources catalogue (issue #567) — one row per
 * Open5e v2 document we may host content from, carrying the attribution
 * facts get_content_licenses() (the Reliquary Licences tab's RPC) needs:
 * title, publisher, license_keys, product_url, gamesystem, is_redistributable.
 *
 * Machine-derived fields ONLY. `copyright_notice` and `sort_order` are
 * hand-curated and legally reviewed — this script NEVER writes them, not
 * even to blank. Rows flagged `is_metadata_curated` (a hand correction of
 * upstream — e.g. Black Flag is ORC-licensed per Kobold Press's own site,
 * but Open5e's taxonomy has no ORC entry and tags it `cc-by-40` instead —
 * plus our own non-Open5e rows: grimoire-bundled, grimoire-system,
 * grimoire-2024-compatibility, dnd-free-rules-2024) are skipped ENTIRELY:
 * no field on them is touched, machine-derivable or not. A Supabase upsert
 * replaces the whole row, so this reads existing rows first and only ever
 * writes the machine-field subset for non-curated rows — the curated
 * columns (and every curated row, wholesale) pass straight through
 * untouched.
 *
 * Only rows whose key already exists in content_sources, or whose document
 * currently passes isRedistributable(), are written at all — a document we
 * may not host never gets a brand-new catalogue row conjured for it.
 *
 * Run:
 *   npx tsx --tsconfig tsconfig.node.json --env-file=.env.local scripts/seed-content-sources.ts
 *   npm run seed-content-sources
 *
 * Optional flags:
 *   --dry-run   Fetch + diff only; print what would change; write nothing
 *
 * Required env vars in .env.local — needed even for --dry-run, since a
 * meaningful diff requires reading the existing catalogue (which rows are
 * curated, which already exist) before deciding what would change:
 *   VITE_SUPABASE_URL         — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 */

import {
  fetchOpen5eDocumentRefs,
  isRedistributable,
  licenseKeysFor,
  LEGACY_DOCUMENT_KEY_ALIASES,
} from "@/lib/open5eApi";
import type { Open5eDocumentRef } from "@/lib/open5eApi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import {
  requireEnv,
  installOpen5eUserAgent,
  createServiceClient,
  fetchAllRows,
  upsertBatch,
  parseSeedCliArgs,
} from "./lib/seed-helpers";

// ── row shape ─────────────────────────────────────────────────────────────

/** Full public.content_sources row, as read back from Supabase. */
export interface ContentSourceRow {
  key: string;
  open5e_key: string | null;
  title: string;
  publisher: string;
  license_keys: string[];
  copyright_notice: string | null;
  product_url: string | null;
  gamesystem: string | null;
  is_redistributable: boolean;
  is_metadata_curated: boolean;
  sort_order: number;
}

/**
 * The subset of columns this script is EVER allowed to write.
 * `copyright_notice` and `sort_order` (hand-curated, legally reviewed) and
 * `is_metadata_curated` itself (a manual admin flag, not machine-derivable)
 * are deliberately absent from this type — there is no code path in this
 * file that can construct an object containing them for the upsert payload.
 */
type MachineFields = Pick<
  ContentSourceRow,
  "key" | "open5e_key" | "title" | "publisher" | "license_keys" | "product_url" | "gamesystem" | "is_redistributable"
>;

const REVERSE_DOCUMENT_KEY_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(LEGACY_DOCUMENT_KEY_ALIASES).map(([ours, upstream]) => [upstream, ours]),
);

/** Maps an Open5e v2 document key back to OUR source_document_key; identity when we have no legacy alias for it. */
export function ourKeyFor(open5eKey: string): string {
  return REVERSE_DOCUMENT_KEY_ALIASES[open5eKey] ?? open5eKey;
}

/**
 * Derives the machine-writable fields for one Open5e document, or `null`
 * when the document is missing data (`publisher`) this NOT NULL column
 * requires — skipped rather than defaulted, since a blank publisher would
 * misattribute the content.
 */
export function deriveMachineFields(document: Open5eDocumentRef): MachineFields | null {
  if (!document.publisher?.name) return null;
  const key = ourKeyFor(document.key);
  return {
    key,
    open5e_key: key === document.key ? null : document.key,
    title: document.display_name || document.name,
    publisher: document.publisher.name,
    license_keys: licenseKeysFor(document),
    product_url: document.permalink ?? null,
    gamesystem: document.gamesystem?.key ?? null,
    is_redistributable: isRedistributable(document),
  };
}

// ── plan ──────────────────────────────────────────────────────────────────

export interface ContentSourcePlanRow {
  fields: MachineFields;
  existing: ContentSourceRow | null;
}

export interface ContentSourcePlanResult {
  /** Rows to upsert — machine fields only. */
  plan: ContentSourcePlanRow[];
  /** Document keys skipped: no `publisher.name`, can't populate the NOT NULL column. */
  skippedNoPublisher: string[];
  /** OUR keys skipped: no existing catalogue row, and the document isn't (yet) cleared for redistribution. */
  skippedNotRedistributable: string[];
  /** OUR keys skipped: the existing catalogue row is hand-curated (`is_metadata_curated`) — left untouched, machine-derivable or not. */
  skippedCurated: string[];
}

/**
 * Builds the set of rows this run would write. Three refusal reasons, each
 * tracked separately so `main()` can log exactly why nothing happened for a
 * given source rather than leaving that silent:
 *
 *  - the document lacks data this table's NOT NULL columns require
 *  - the document isn't cleared for redistribution and has no existing row
 *    (never conjuring a new row for content we may not host)
 *  - the existing row is hand-curated — upstream's account of this document
 *    is known to be wrong (or, for our own non-Open5e sources, doesn't
 *    exist at all) and must never be silently overwritten back to it
 */
export function buildContentSourcePlan(
  documents: readonly Open5eDocumentRef[],
  existingRows: readonly ContentSourceRow[],
): ContentSourcePlanResult {
  const existingByKey = new Map(existingRows.map((row) => [row.key, row]));
  const plan: ContentSourcePlanRow[] = [];
  const skippedNoPublisher: string[] = [];
  const skippedNotRedistributable: string[] = [];
  const skippedCurated: string[] = [];

  for (const document of documents) {
    const fields = deriveMachineFields(document);
    if (!fields) {
      skippedNoPublisher.push(document.key);
      continue;
    }
    const existing = existingByKey.get(fields.key) ?? null;

    if (existing?.is_metadata_curated) {
      skippedCurated.push(fields.key);
      continue;
    }
    if (!existing && !fields.is_redistributable) {
      skippedNotRedistributable.push(fields.key);
      continue;
    }

    plan.push({ fields, existing });
  }

  return { plan, skippedNoPublisher, skippedNotRedistributable, skippedCurated };
}

// ── dry run ───────────────────────────────────────────────────────────────

function fieldDiff(fields: MachineFields, existing: ContentSourceRow | null): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of Object.keys(fields) as Array<keyof MachineFields>) {
    const before = existing ? existing[field] : undefined;
    const after = fields[field];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diff[field] = { from: existing ? before : "(new row)", to: after };
    }
  }
  return diff;
}

function printDryRunSummary(planRows: ContentSourcePlanRow[]): void {
  console.log("=== Dry run — no data written ===\n");
  console.log(`${planRows.length} row(s) would be written:\n`);
  for (const { fields, existing } of planRows) {
    const diff = fieldDiff(fields, existing);
    if (Object.keys(diff).length === 0) {
      console.log(`  ${fields.key}: no changes`);
      continue;
    }
    console.log(`  ${fields.key}${existing ? "" : " (NEW row)"}:`);
    for (const [field, { from, to }] of Object.entries(diff)) {
      console.log(`    ${field}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  installOpen5eUserAgent();
  const parsed = parseSeedCliArgs(process.argv.slice(2));

  console.log("=== Seeding public.content_sources ===\n");

  const env = requireEnv();
  const supabase: SupabaseClient = createServiceClient(env);

  console.log("Step 1: Fetching Open5e v2 document list…");
  const documents = await fetchOpen5eDocumentRefs();
  console.log(`  Fetched ${documents.length} documents.\n`);

  console.log("Step 2: Reading existing public.content_sources rows…");
  const existingRows = await fetchAllRows<ContentSourceRow>((from, to) =>
    supabase
      .from("content_sources")
      .select(
        "key,open5e_key,title,publisher,license_keys,copyright_notice,product_url,gamesystem,is_redistributable,is_metadata_curated,sort_order",
      )
      .range(from, to)
      .returns<ContentSourceRow[]>(),
  );
  console.log(`  Found ${existingRows.length} existing rows.`);
  const curatedRows = existingRows.filter((row) => row.is_metadata_curated);
  if (curatedRows.length) {
    console.log(
      `  ${curatedRows.length} row(s) are hand-curated (is_metadata_curated) — never written by this script, even when Open5e's own data disagrees:`,
    );
    for (const row of curatedRows) console.log(`    - ${row.key} (${row.title})`);
  }
  console.log();

  const { plan, skippedNoPublisher, skippedNotRedistributable, skippedCurated } = buildContentSourcePlan(
    documents,
    existingRows,
  );
  if (skippedNoPublisher.length) {
    console.log(
      `  Skipped ${skippedNoPublisher.length} document(s) with no publisher name (cannot populate the NOT NULL publisher column): ${skippedNoPublisher.join(", ")}`,
    );
  }
  if (skippedCurated.length) {
    console.log(
      `  Skipped ${skippedCurated.length} document(s) whose catalogue row is hand-curated — left exactly as curated: ${skippedCurated.join(", ")}`,
    );
  }
  if (skippedNotRedistributable.length) {
    console.log(
      `  Skipped ${skippedNotRedistributable.length} non-redistributable document(s) with no existing catalogue row (never introducing a row for content we may not host): ${skippedNotRedistributable.join(", ")}`,
    );
  }
  console.log(`  ${plan.length} row(s) to write.\n`);

  if (parsed.dryRun) {
    printDryRunSummary(plan);
    return;
  }

  console.log("Step 3: Upserting public.content_sources (machine fields only — copyright_notice/sort_order/is_metadata_curated untouched)…");
  const rows = plan.map(({ fields }) => fields);
  await upsertBatch(supabase, "content_sources", rows, "key");
  console.log(`  Done — ${rows.length} rows upserted.\n`);

  console.log("=== Seeding complete ===");
}

// Entry-point guard: this module also exports pure helpers
// (ourKeyFor/deriveMachineFields/buildContentSourcePlan) for
// scripts/seed-content-sources.test.ts to import directly. Unlike the
// sibling seed scripts' unconditional `main().catch()` (which only ever
// gets exercised by a test file after a slow real-network fetch, so in
// practice it never reaches this codepath before the test process moves
// on), this script calls requireEnv() as literally its first act — so
// without this guard, importing it for its exported helpers would
// immediately call process.exit(1) (no env vars in a test run) and fail
// the whole vitest run with an unhandled rejection. Only auto-run when
// this file is the actual entrypoint (`tsx scripts/seed-content-sources.ts`),
// never on a plain `import`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
