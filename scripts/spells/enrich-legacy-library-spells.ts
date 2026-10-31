#!/usr/bin/env tsx
/**
 * Gives the legacy (Open5e v1) library spells the structured mechanics their
 * v2 twins carry (#1123), in place: same ids, same text, only the mechanics
 * columns change. See scripts/spells/legacyEnrichment.ts for the matching.
 *
 * Usage:
 *   npm run spells:enrich-legacy                       # dry run on the local stack
 *   npm run spells:enrich-legacy -- --production       # dry run reading production
 *   npm run spells:enrich-legacy -- --write            # apply on the local stack
 *   npm run spells:enrich-legacy -- --write --production --yes-production
 *   --report <path>                                    # JSON of every row's outcome
 *
 * Library spells are public shared content, so names may be printed.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { installOpen5eUserAgent } from "../lib/seed-helpers.ts";
import { type ServiceTarget as Target, resolveServiceTarget as resolveTarget, serviceHeaders as headers } from "../lib/dev-stack.ts";
import { fetchAllFromDocuments } from "@/lib/library/open5eApi";
import { fetchOpen5eSpells, mapOpen5eV2Spell } from "@/lib/library/open5eSpellImport";
import { LEGACY_TO_V2_DOCUMENT, type LegacyRow, type RowOutcome, type V2Spell, planRow } from "./legacyEnrichment.ts";

const PAGE = 1000;
const COLUMNS = "id,name,description,source_document_key,mechanics_reviewed,provenance,damage_rolls,healing_dice";

async function readLegacyRows(target: Target): Promise<LegacyRow[]> {
  const keys = Object.keys(LEGACY_TO_V2_DOCUMENT).join(",");
  const rows: LegacyRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${target.origin}/rest/v1/library_spells?select=${COLUMNS}&source_document_key=in.(${keys})&order=id&limit=${PAGE}&offset=${offset}`;
    const response = await fetch(url, { headers: headers(target) });
    if (!response.ok) throw new Error(`Could not read library_spells from ${target.label} (${response.status}).`);
    const page = (await response.json()) as LegacyRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

type RawV2Spell = Parameters<typeof mapOpen5eV2Spell>[0];

/**
 * The importer skips documents whose gamesystem is not 5e (Advanced 5th
 * Edition is "a5e"), so a5e-ag never comes back from fetchOpen5eSpells. Our 60
 * legacy a5e rows are in that book, so read it raw and map it as a 2014 spell
 * for the mechanics only; none of its other fields are written.
 */
async function fetchA5eSpells(): Promise<V2Spell[]> {
  const raw = await fetchAllFromDocuments<RawV2Spell>("https://api.open5e.com/v2/spells/", ["a5e-ag"]);
  return raw
    .map((spell) => mapOpen5eV2Spell({ ...spell, document: { ...spell.document, gamesystem: { key: "5e-2014", name: "5e" } } }))
    .filter((spell) => spell !== null) as unknown as V2Spell[];
}

async function patchRow(target: Target, id: string, body: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${target.origin}/rest/v1/library_spells?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(target, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(body),
  });
  return response.ok;
}

export function summarize(outcomes: RowOutcome[]): string {
  const byDocument = new Map<string, RowOutcome[]>();
  for (const outcome of outcomes) byDocument.set(outcome.document, [...(byDocument.get(outcome.document) ?? []), outcome]);
  const lines: string[] = [];
  for (const [document, rows] of [...byDocument].sort()) {
    const count = (predicate: (row: RowOutcome) => boolean) => rows.filter(predicate).length;
    lines.push(
      `${document} -> ${LEGACY_TO_V2_DOCUMENT[document] ?? "?"}: ${rows.length} legacy, ` +
        `${count((r) => r.outcome === "enriched")} matched (${count((r) => r.via === "parenthetical")} via parenthetical), ` +
        `${count((r) => r.outcome === "unmatched")} unmatched, ${count((r) => r.outcome === "ambiguous")} ambiguous, ` +
        `${count((r) => r.outcome === "skipped_reviewed")} reviewed (skipped), ` +
        `${count((r) => r.gainsRoll === true)} gain a roll, ${count((r) => r.descriptionDiffers === true)} descriptions differ`,
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      write: { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      report: { type: "string" },
    },
  });
  if (values.write && values.production && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production (use --write --production --yes-production).");
  }

  const target = resolveTarget(values.production);
  const legacy = await readLegacyRows(target);
  console.log(`Read ${legacy.length} legacy spells from ${target.label}.`);

  installOpen5eUserAgent();
  const importerKeys = [...new Set(Object.values(LEGACY_TO_V2_DOCUMENT))].filter((key) => key !== "a5e-ag");
  const v2 = [...((await fetchOpen5eSpells(importerKeys)) as unknown as V2Spell[]), ...(await fetchA5eSpells())];
  console.log(`Fetched ${v2.length} v2 spells.`);

  const at = new Date().toISOString();
  const outcomes = legacy.map((row) => planRow(row, v2, at));
  console.log(summarize(outcomes));
  const problems = outcomes.filter((o) => o.outcome === "unmatched" || o.outcome === "ambiguous");
  for (const problem of problems) console.log(`  ${problem.outcome}: [${problem.document}] ${problem.name}`);

  if (values.report) {
    // The patch bodies are bulky and fully derivable; the report keeps the verdicts.
    const slim = outcomes.map(({ patch: _patch, ...rest }) => rest);
    writeFileSync(values.report, `${JSON.stringify(slim, null, 2)}\n`);
    console.log(`Report written to ${values.report}.`);
  }

  if (!values.write) return;
  let written = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (outcome.outcome !== "enriched" || !outcome.patch) continue;
    if (await patchRow(target, outcome.id, outcome.patch)) written++;
    else failed++;
  }
  console.log(`Enriched ${written} spell(s) on ${target.label}${failed ? `; ${failed} write(s) failed (re-run to resume)` : ""}.`);
  if (failed > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unexpected failure.");
    process.exit(1);
  });
}
