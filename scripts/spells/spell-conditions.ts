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
 * It never writes to a database. Library spells are public shared content, so names may be printed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { resolveServiceTarget, serviceHeaders, type ServiceTarget } from "../lib/dev-stack.ts";
import { agree, findingsFor, type CuratedSpellConditionsFile } from "../../src/lib/library/curatedSpellConditions.ts";
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
  disagree: string[];
  onlyInOne: string[];
  unknownSpell: string[];
  findings: Record<string, { a: string[]; b: string[] }>;
}

/** Two readings held against the spells' text and against each other. */
export function checkReadings(a: CuratedSpellConditionsFile, b: CuratedSpellConditionsFile, spells: ReadonlyMap<string, SpellText>): CheckReport {
  const report: CheckReport = { usable: [], disagree: [], onlyInOne: [], unknownSpell: [], findings: {} };
  for (const id of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const spell = spells.get(id);
    if (spell === undefined) {
      report.unknownSpell.push(id);
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

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string" }, a: { type: "string" }, b: { type: "string" }, report: { type: "string" } },
  });
  const [command] = positionals;
  const target = resolveServiceTarget(false);
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
    const report = checkReadings(read(values.a), read(values.b), new Map(spells.map((s) => [s.id, s])));
    console.log(`usable ${report.usable.length} · disagree ${report.disagree.length} · with findings ${Object.keys(report.findings).length} · in one reading only ${report.onlyInOne.length} · no such spell ${report.unknownSpell.length}`);
    if (values.report) {
      writeFileSync(values.report, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`Report written to ${values.report}.`);
    }
    return;
  }

  throw new Error('Say "worklist" or "check".');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Unexpected failure.");
    process.exit(1);
  });
}
