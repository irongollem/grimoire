/**
 * The spell conditions pass (#1021, the caster's spells, step C): the two commands a reader of spells needs.
 *
 *   npm run spells:conditions -- worklist --out <file.json>
 *       The spells the library's monsters can actually cast, most used first, each with the text to read.
 *       Local stack only: the library is the same shared content everywhere, and nothing is written.
 *
 *   npm run spells:conditions -- check --a <reading.json> --b <reading.json> [--report <file.json>]
 *       Holds two independent readings against each spell's own text and against each other. An entry is fit to
 *       use only when both readings pass and agree; everything else is listed with what is wrong.
 *
 *   npm run spells:conditions -- apply --a <reading.json> --b <reading.json> [--write] [--production --yes-production]
 *       Writes the usable entries (both readings pass and agree) into `library_spells.condition_effect`, without their
 *       evidence, and stamps `provenance.condition_effect`. A dry run unless --write is given; local unless --production
 *       (which also needs --yes-production to write). Rows the readings did not agree on are never touched.
 *
 * `worklist` and `check` never write. Library spells are public shared content, so names may be printed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { resolveServiceTarget, serviceHeaders, type ServiceTarget } from "../lib/dev-stack.ts";
import { agree, findingsFor, type CuratedSpellCondition, type CuratedSpellConditionsFile } from "../../src/lib/spells/curatedSpellConditions.ts";
import { spellcastingOf } from "../../src/rules/statBlock/spellcastingProse.ts";

const PAGE = 1000;

async function readAll<T>(target: ServiceTarget, table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const response = await fetch(`${target.origin}/rest/v1/${table}?select=${select}&order=id&limit=${PAGE}&offset=${offset}`, { headers: serviceHeaders(target) });
    if (!response.ok) throw new Error(`Could not read ${table} from ${target.label} (${response.status}).`);
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export interface SpellText {
  id: string;
  name: string;
  ruleset: string;
  level: number;
  concentration: boolean;
  duration: string | null;
  description: string;
  /** What a higher slot adds, where the record keeps it apart from the description. */
  higher_levels: string | null;
}

export interface WorklistEntry extends SpellText {
  /** How many library monsters list this spell. */
  monsters: number;
}

const keyOf = (name: string): string => name.replace(/\s+/g, " ").trim().toLowerCase();

/** The spells monsters list, with how many list each: every record of a listed name, since a name lives in several books. */
export function worklistOf(statBlocks: readonly unknown[], spells: readonly SpellText[]): WorklistEntry[] {
  const uses = new Map<string, number>();
  for (const statBlock of statBlocks) {
    const names = new Set<string>();
    for (const found of spellcastingOf(statBlock as never)) {
      if (found.prose === null) continue;
      for (const group of found.prose.groups) for (const spell of group.spells) names.add(spell.key);
    }
    for (const name of names) uses.set(name, (uses.get(name) ?? 0) + 1);
  }
  return spells
    .flatMap((spell): WorklistEntry[] => {
      const monsters = uses.get(keyOf(spell.name));
      return monsters === undefined ? [] : [{ ...spell, monsters }];
    })
    .sort((a, b) => b.monsters - a.monsters || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export interface CheckReport {
  usable: string[];
  /** Records a person ruled on (`settled.json`), where the two readings differed. Used like `usable`. */
  settled: string[];
  disagree: string[];
  onlyInOne: string[];
  unknownSpell: string[];
  findings: Record<string, { a: string[]; b: string[] }>;
}

/** Two readings held against the spells' text and against each other. */
export function checkReadings(
  a: CuratedSpellConditionsFile,
  b: CuratedSpellConditionsFile,
  spells: ReadonlyMap<string, SpellText>,
  settled: CuratedSpellConditionsFile = {},
): CheckReport {
  const report: CheckReport = { usable: [], settled: [], disagree: [], onlyInOne: [], unknownSpell: [], findings: {} };
  for (const id of [...new Set([...Object.keys(a), ...Object.keys(b), ...Object.keys(settled)])].sort()) {
    const spell = spells.get(id);
    if (spell === undefined) {
      report.unknownSpell.push(id);
      continue;
    }
    // A ruling settles a record whatever the readings say, and is held to the spell's own text like any reading.
    const ruled = settled[id];
    if (ruled !== undefined) {
      const found = findingsFor(ruled, spell);
      if (found.length > 0) report.findings[id] = { a: found, b: [] };
      else report.settled.push(id);
      continue;
    }
    const [inA, inB] = [a[id], b[id]];
    if (inA === undefined || inB === undefined) {
      report.onlyInOne.push(id);
      continue;
    }
    const found = { a: findingsFor(inA, spell), b: findingsFor(inB, spell) };
    if (found.a.length > 0 || found.b.length > 0) report.findings[id] = found;
    else if (!agree(inA, inB)) report.disagree.push(id);
    else report.usable.push(id);
  }
  return report;
}

export interface ConditionWrite {
  id: string;
  verdict: CuratedSpellCondition["verdict"];
  /** The reading without its evidence: the shape `library_spells.condition_effect` holds. */
  condition_effect: Omit<CuratedSpellCondition, "evidence">;
}

/** What `apply` writes: only the ids both readings agreed on, from reading `a`, without evidence. Everything else is left exactly as it is. */
export function planConditionWrites(report: CheckReport, a: CuratedSpellConditionsFile, settled: CuratedSpellConditionsFile = {}): ConditionWrite[] {
  const from = (id: string, source: CuratedSpellConditionsFile): ConditionWrite => {
    const { evidence: _evidence, ...condition_effect } = source[id];
    return { id, verdict: condition_effect.verdict, condition_effect };
  };
  return [...report.usable.map((id) => from(id, a)), ...report.settled.map((id) => from(id, settled))].sort((x, y) => x.id.localeCompare(y.id));
}

/** The count line a dry run prints and a write repeats. */
export function describePlan(writes: readonly ConditionWrite[], report: CheckReport): string {
  const by = { condition: 0, no_condition: 0, not_simple: 0 };
  for (const w of writes) by[w.verdict]++;
  return (
    `${writes.length} to write (condition ${by.condition}, no_condition ${by.no_condition}, not_simple ${by.not_simple}); ` +
    `of them settled by a ruling ${report.settled.length}; skipped: disagree ${report.disagree.length}, with findings ${Object.keys(report.findings).length}, in one reading only ${report.onlyInOne.length}, no such spell ${report.unknownSpell.length}.`
  );
}

async function readProvenance(target: ServiceTarget, id: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${target.origin}/rest/v1/library_spells?select=provenance&id=eq.${encodeURIComponent(id)}`, { headers: serviceHeaders(target) });
  if (!response.ok) throw new Error(`Could not read library_spells from ${target.label} (${response.status}).`);
  const rows = (await response.json()) as Array<{ provenance: Record<string, unknown> | null }>;
  return rows[0]?.provenance ?? null;
}

async function writeOne(target: ServiceTarget, write: ConditionWrite, at: string): Promise<boolean> {
  const provenance = { ...(await readProvenance(target, write.id)), condition_effect: { by: "spells:conditions", version: 1, at } };
  const response = await fetch(`${target.origin}/rest/v1/library_spells?id=eq.${encodeURIComponent(write.id)}`, {
    method: "PATCH",
    headers: serviceHeaders(target, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ condition_effect: write.condition_effect, provenance }),
  });
  return response.ok;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string" }, a: { type: "string" }, b: { type: "string" }, report: { type: "string" },
      // A person's rulings on records the two readings differ on (`src/data/curatedSpellConditions/settled.json`).
      settled: { type: "string" },
      write: { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
    },
  });
  const [command] = positionals;
  if (values.write && values.production && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production (use --write --production --yes-production).");
  }
  // Only `apply` may leave the local stack, and only on request: reading the shared library is the same everywhere.
  const target = resolveServiceTarget(command === "apply" && values.production);
  const spells = await readAll<SpellText>(target, "library_spells", "id,name,ruleset,level,concentration,duration,description,higher_levels");

  if (command === "worklist") {
    if (!values.out) throw new Error("worklist needs --out <file.json>.");
    const monsters = await readAll<{ stat_block: unknown }>(target, "library_monsters", "stat_block");
    const list = worklistOf(monsters.map((m) => m.stat_block), spells);
    writeFileSync(values.out, `${JSON.stringify(list, null, 2)}\n`);
    console.log(`${list.length} spell records that monsters list (${new Set(list.map((s) => keyOf(s.name))).size} names) written to ${values.out}.`);
    return;
  }

  if (command === "check") {
    if (!values.a || !values.b) throw new Error("check needs --a <reading.json> and --b <reading.json>.");
    const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as CuratedSpellConditionsFile;
    const report = checkReadings(read(values.a), read(values.b), new Map(spells.map((s) => [s.id, s])), values.settled ? read(values.settled) : {});
    console.log(`usable ${report.usable.length} · settled by a ruling ${report.settled.length} · disagree ${report.disagree.length} · with findings ${Object.keys(report.findings).length} · in one reading only ${report.onlyInOne.length} · no such spell ${report.unknownSpell.length}`);
    if (values.report) {
      writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Report written to ${values.report}.`);
    }
    return;
  }

  if (command === "apply") {
    if (!values.a || !values.b) throw new Error("apply needs --a <reading.json> and --b <reading.json>.");
    const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as CuratedSpellConditionsFile;
    const a = read(values.a);
    const settled = values.settled ? read(values.settled) : {};
    const report = checkReadings(a, read(values.b), new Map(spells.map((s) => [s.id, s])), settled);
    const writes = planConditionWrites(report, a, settled);
    console.log(`${target.label}: ${describePlan(writes, report)}`);
    if (!values.write) {
      console.log("Dry run. Pass --write to apply.");
      return;
    }
    const at = new Date().toISOString();
    let written = 0;
    let failed = 0;
    for (const write of writes) {
      if (await writeOne(target, write, at)) written++;
      else failed++;
    }
    console.log(`Wrote ${written} spell(s) on ${target.label}${failed ? `; ${failed} write(s) failed (re-run to resume)` : ""}.`);
    if (failed > 0) process.exitCode = 1;
    return;
  }

  throw new Error('Say "worklist", "check" or "apply".');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unexpected failure.");
    process.exit(1);
  });
}
