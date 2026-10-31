#!/usr/bin/env tsx
/**
 * Approves library spells whose stored automation provably matches their own
 * rules text (#1123): sets `mechanics_reviewed = true` where the checker in
 * src/lib/library/spellMechanicsCheck.ts finds nothing to object to.
 *
 * Usage:
 *   npm run spells:check-mechanics                           # read the local stack, write nothing
 *   npm run spells:check-mechanics -- --production           # read production, write nothing
 *   npm run spells:check-mechanics -- --write                # approve on the local stack
 *   npm run spells:check-mechanics -- --write --production --yes-production
 *   npm run spells:check-mechanics -- --from-open5e          # check what a re-seed would produce; no database
 *   --report <path>                                          # JSON of every verdict
 *
 * Only ever sets `mechanics_reviewed` to true and adds `provenance.mechanics_check`,
 * by primary key. Library spells are public shared content, so names may be printed.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { DEFAULT_SRD_DOCUMENT_KEYS, installOpen5eUserAgent } from "../lib/seed-helpers.ts";
import { type ServiceTarget as Target, resolveServiceTarget as resolveTarget, serviceHeaders as headers } from "../lib/dev-stack.ts";
import { fetchOpen5eSpells } from "@/lib/library/open5eSpellImport";
import { checkSpellMechanics } from "@/lib/library/spellMechanicsCheck";
import type { SpellMechanicsFinding, SpellMechanicsInput, SpellMechanicsVerdict } from "@/lib/library/spellMechanicsCheck";

export interface SpellRow extends SpellMechanicsInput {
  id: string;
  ruleset: string;
  source: string | null;
  mechanics_reviewed: boolean;
  provenance: Record<string, unknown> | null;
}

export interface ReportEntry {
  id: string;
  name: string;
  ruleset: string;
  source: string | null;
  level: number;
  approved: boolean;
  basis?: Extract<SpellMechanicsVerdict, { approved: true }>["basis"];
  findings?: SpellMechanicsFinding[];
}

const PAGE = 1000;
const COLUMNS = [
  "id", "name", "ruleset", "source", "level", "description", "higher_levels", "attack_type", "save_attribute",
  "save_effect", "damage_rolls", "healing_dice", "higher_level_damage", "higher_level_healing", "effects",
  "casting_options", "mechanics_reviewed", "provenance",
].join(",");

async function readSpells(target: Target): Promise<SpellRow[]> {
  const rows: SpellRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${target.origin}/rest/v1/library_spells?select=${COLUMNS}&order=id&limit=${PAGE}&offset=${offset}`;
    const response = await fetch(url, { headers: headers(target) });
    if (!response.ok) throw new Error(`Could not read library_spells from ${target.label} (${response.status}).`);
    const page = (await response.json()) as SpellRow[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function approve(target: Target, row: SpellRow, at: string): Promise<boolean> {
  const url = `${target.origin}/rest/v1/library_spells?id=eq.${encodeURIComponent(row.id)}`;
  const provenance = { ...row.provenance, mechanics_check: { by: "spells:check-mechanics", version: 1, at } };
  const response = await fetch(url, {
    method: "PATCH",
    headers: headers(target, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ mechanics_reviewed: true, provenance }),
  });
  return response.ok;
}

export function buildReport(rows: SpellRow[], verdicts: SpellMechanicsVerdict[]): ReportEntry[] {
  return rows
    .map((row, index): ReportEntry => {
      const verdict = verdicts[index];
      const head = { id: row.id, name: row.name, ruleset: row.ruleset, source: row.source, level: row.level };
      return verdict.approved
        ? { ...head, approved: true, basis: verdict.basis }
        : { ...head, approved: false, findings: verdict.findings };
    })
    .sort((a, b) => a.ruleset.localeCompare(b.ruleset) || a.level - b.level || a.name.localeCompare(b.name));
}

export function summarize(report: ReportEntry[]): string {
  const approved: Record<string, number> = {};
  const codes: Record<string, number> = {};
  let rejected = 0;
  for (const entry of report) {
    if (entry.approved) {
      const key = `${entry.ruleset} / ${entry.basis}`;
      approved[key] = (approved[key] ?? 0) + 1;
    } else {
      rejected++;
      for (const code of new Set((entry.findings ?? []).map((finding) => finding.code))) codes[code] = (codes[code] ?? 0) + 1;
    }
  }
  const lines = [`Checked ${report.length} spells: ${report.length - rejected} approved, ${rejected} rejected.`, "Approved:"];
  for (const [key, count] of Object.entries(approved).sort()) lines.push(`  ${key}: ${count}`);
  lines.push("Findings (spells affected):");
  for (const [code, count] of Object.entries(codes).sort((a, b) => b[1] - a[1])) lines.push(`  ${code}: ${count}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      write: { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      "from-open5e": { type: "boolean", default: false },
      report: { type: "string" },
    },
  });
  if (values.write && values["from-open5e"]) throw new Error("--from-open5e reads no database, so there is nothing to write to.");
  if (values.write && values.production && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production (use --write --production --yes-production).");
  }

  let rows: SpellRow[];
  let target: Target | null = null;
  if (values["from-open5e"]) {
    installOpen5eUserAgent();
    const spells = await fetchOpen5eSpells([...DEFAULT_SRD_DOCUMENT_KEYS]);
    rows = spells.map((spell) => ({ ...spell, source: spell.source ?? null, provenance: spell.provenance }));
    console.log(`Checking ${rows.length} spells as the importer maps them from Open5e.`);
  } else {
    target = resolveTarget(values.production);
    rows = await readSpells(target);
    console.log(`Checking ${rows.length} spells from ${target.label}.`);
  }

  const verdicts = rows.map((row) => checkSpellMechanics(row));
  const report = buildReport(rows, verdicts);
  console.log(summarize(report));
  if (values.report) {
    writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report written to ${values.report}.`);
  }

  if (!values.write || !target) return;
  const at = new Date().toISOString();
  let written = 0;
  let failed = 0;
  for (const [index, row] of rows.entries()) {
    if (!verdicts[index].approved || row.mechanics_reviewed) continue;
    if (await approve(target, row, at)) written++;
    else failed++;
  }
  console.log(`Approved ${written} spell(s) on ${target.label}${failed ? `; ${failed} write(s) failed (re-run to resume)` : ""}.`);
  if (failed > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unexpected failure.");
    process.exit(1);
  });
}
