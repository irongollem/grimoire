#!/usr/bin/env tsx
/**
 * Writes the curated roll of every `roll` entry in src/data/curatedSpellMechanics.json
 * into its library spell (#1123 follow-up): the eight mechanics columns, converted by
 * `storedMechanicsFor`, plus `provenance.mechanics_curated`. It never sets
 * `mechanics_reviewed`; run `spells:check-mechanics --write` afterwards, which approves
 * a row only when its text bears the entry out. Rows already reviewed are left alone.
 *
 * Usage:
 *   npm run spells:apply-curated                                  # dry run on the local stack
 *   npm run spells:apply-curated -- --write                       # write the local stack
 *   npm run spells:apply-curated -- --production                  # dry run against production
 *   npm run spells:apply-curated -- --write --production --yes-production
 */
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { type ServiceTarget as Target, resolveServiceTarget as resolveTarget, serviceHeaders as headers } from "../lib/dev-stack.ts";
import { storedMechanicsFor } from "@/lib/library/curatedSpellMechanics";
import type { CuratedSpellMechanicsFile, StoredSpellMechanics } from "@/lib/library/curatedSpellMechanics";
import { loadCuratedFile } from "./curated-file.ts";

export interface CuratedRow {
  id: string;
  level: number;
  description: string;
  mechanics_reviewed: boolean;
  provenance: Record<string, unknown> | null;
}

export interface CuratedWrite {
  id: string;
  patch: StoredSpellMechanics & { provenance: Record<string, unknown> };
}

export interface CuratedPlan {
  writes: CuratedWrite[];
  /** Entries whose id is not a row of this database. */
  missing: string[];
  /** Rows a reviewer already approved: left as they are. */
  alreadyReviewed: string[];
  /** Entries the converter refuses, with its reason. */
  unconvertible: Array<{ id: string; reason: string }>;
  /** Entries that say the spell is not one roll: nothing to write. */
  notOneRoll: number;
}

export function planCuratedWrites(rows: CuratedRow[], file: CuratedSpellMechanicsFile, at: string): CuratedPlan {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const plan: CuratedPlan = { writes: [], missing: [], alreadyReviewed: [], unconvertible: [], notOneRoll: 0 };
  for (const [id, entry] of Object.entries(file)) {
    if (entry.verdict !== "roll") {
      plan.notOneRoll++;
      continue;
    }
    const row = byId.get(id);
    if (!row) {
      plan.missing.push(id);
      continue;
    }
    if (row.mechanics_reviewed) {
      plan.alreadyReviewed.push(id);
      continue;
    }
    try {
      const columns = storedMechanicsFor(entry, row);
      const provenance = { ...row.provenance, mechanics_curated: { by: "agent-extraction", agreed: 2, at } };
      plan.writes.push({ id, patch: { ...columns, provenance } });
    } catch (error) {
      plan.unconvertible.push({ id, reason: error instanceof Error ? error.message : "Unconvertible." });
    }
  }
  return plan;
}

const COLUMNS = "id,level,description,mechanics_reviewed,provenance";

async function readRows(target: Target, ids: string[]): Promise<CuratedRow[]> {
  const rows: CuratedRow[] = [];
  // Ids go in the URL, so ask in chunks.
  for (let i = 0; i < ids.length; i += 50) {
    const list = ids.slice(i, i + 50).map((id) => `"${id.replace(/"/g, "")}"`).join(",");
    const url = `${target.origin}/rest/v1/library_spells?select=${COLUMNS}&id=in.(${encodeURIComponent(list)})`;
    const response = await fetch(url, { headers: headers(target) });
    if (!response.ok) throw new Error(`Could not read library_spells from ${target.label} (${response.status}).`);
    rows.push(...((await response.json()) as CuratedRow[]));
  }
  return rows;
}

async function patch(target: Target, write: CuratedWrite): Promise<boolean> {
  const url = `${target.origin}/rest/v1/library_spells?id=eq.${encodeURIComponent(write.id)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: headers(target, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(write.patch),
  });
  return response.ok;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      write: { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
    },
  });
  if (values.write && values.production && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production (use --write --production --yes-production).");
  }
  const file = loadCuratedFile();
  const target = resolveTarget(values.production);
  const rolls = Object.entries(file).filter(([, entry]) => entry.verdict === "roll").map(([id]) => id);
  const rows = await readRows(target, rolls);
  const plan = planCuratedWrites(rows, file, new Date().toISOString());
  console.log(
    `${target.label}: ${plan.writes.length} to write, ${plan.alreadyReviewed.length} already reviewed, ` +
      `${plan.missing.length} missing, ${plan.unconvertible.length} unconvertible, ${plan.notOneRoll} not-one-roll (nothing to write).`,
  );
  for (const id of plan.missing) console.log(`  missing: ${id}`);
  for (const { id, reason } of plan.unconvertible) console.log(`  unconvertible: ${id}: ${reason}`);
  if (!values.write) {
    console.log("Dry run. Pass --write to apply.");
    return;
  }
  let written = 0;
  let failed = 0;
  for (const write of plan.writes) {
    if (await patch(target, write)) written++;
    else failed++;
  }
  console.log(`Wrote ${written} spell(s) on ${target.label}${failed ? `; ${failed} write(s) failed (re-run to resume)` : ""}. Now run spells:check-mechanics --write.`);
  if (failed > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unexpected failure.");
    process.exit(1);
  });
}
