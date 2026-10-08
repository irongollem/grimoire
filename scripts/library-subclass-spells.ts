#!/usr/bin/env tsx
/**
 * Generates `src/data/librarySubclassSpells.ts` and the migration body that
 * writes the same data into the library subclasses already in the database.
 *
 *   npx tsx --tsconfig tsconfig.node.json scripts/library-subclass-spells.ts [--sql <path>]
 *
 * One run writes both outputs, so the importer's data and the migration cannot
 * drift. Inputs live in `scripts/data/` (see the header the generator writes
 * into the data file for where each came from and how it was checked).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Input shapes ──────────────────────────────────────────────────────────────

interface SpellRef {
  name: string;
  library_id: string | null;
}

interface SrdEntry {
  class: string;
  subclass: string;
  ruleset: "2014" | "2024";
  level_kind: string;
  /** Spell level or class level -> spells (null for the two Circle of the Land entries). */
  table: Record<string, SpellRef[]> | null;
  /** Option -> class level -> spells (Circle of the Land only). */
  terrains?: Record<string, Record<string, SpellRef[]>>;
}

interface ThirdPartyTable {
  feature: string;
  level_kind: "class_level" | "spell_level";
  grant_mode: "always_prepared" | "extra_spell_known_not_counted" | "expanded_list_choose_when_learning";
  /** Column title -> level -> spells. */
  columns: Record<string, Record<string, SpellRef[]>>;
}

interface ThirdPartyEntry {
  class: string;
  subclass: string;
  ruleset: "2014" | "2024";
  tables: ThirdPartyTable[];
}

export interface Identity {
  class_name: string;
  subclass_name: string;
  ruleset: "2014" | "2024";
  source_document_key: string;
  source_record_key: string;
}

export type LevelMap = Record<string, string[]>;

export interface SubclassSpellData {
  source_document_key: string;
  source_record_key: string;
  ruleset: "2014" | "2024";
  /** For humans reading the file; the identity above is what matches a row. */
  label: string;
  granted_spells: LevelMap;
  spell_variants: Record<string, LevelMap>;
  spell_variant_label: string | null;
  expanded_spells: LevelMap;
  expanded_spell_variants: Record<string, LevelMap>;
}

export interface Skipped {
  label: string;
  spell: string;
  reason: string;
}

export interface BuildResult {
  entries: SubclassSpellData[];
  skipped: Skipped[];
}

const VARIANT_LABEL: Record<string, string> = {
  "Druid|Circle of the Land|2014": "Terrain",
  "Druid|Circle of the Land|2024": "Land type",
  "Warlock|Animal Lords|2014": "Affinity",
};

// ── Build ─────────────────────────────────────────────────────────────────────

const levelKey = (n: string): number => Number.parseInt(n, 10);

/** Ids at each level, in level order, each id once per level, nothing for an empty level. */
function toLevelMap(
  label: string,
  rows: Record<string, SpellRef[]>,
  ruleset: string,
  validIds: ReadonlySet<string>,
  skipped: Skipped[],
): LevelMap {
  const out: LevelMap = {};
  for (const level of Object.keys(rows).sort((a, b) => levelKey(a) - levelKey(b))) {
    const ids: string[] = [];
    for (const spell of rows[level]) {
      if (!spell.library_id) {
        skipped.push({ label, spell: spell.name, reason: `not in the ${ruleset} library` });
        continue;
      }
      if (!validIds.has(spell.library_id)) {
        throw new Error(`${label}: ${spell.name} -> ${spell.library_id} is not a ${ruleset} library spell`);
      }
      if (!ids.includes(spell.library_id)) ids.push(spell.library_id);
    }
    if (ids.length) out[level] = ids;
  }
  return out;
}

export function buildEntries(
  srd: SrdEntry[],
  thirdParty: ThirdPartyEntry[],
  identities: Identity[],
  spellIds: Record<"2014" | "2024", readonly string[]>,
): BuildResult {
  const valid = { "2014": new Set(spellIds["2014"]), "2024": new Set(spellIds["2024"]) };
  const skipped: Skipped[] = [];
  const entries: SubclassSpellData[] = [];

  const identityOf = (cls: string, sub: string, ruleset: string): Identity => {
    const hits = identities.filter(i => i.class_name === cls && i.subclass_name === sub && i.ruleset === ruleset);
    if (hits.length !== 1) throw new Error(`${cls} / ${sub} / ${ruleset}: ${hits.length} library rows, expected 1`);
    return hits[0];
  };
  const base = (cls: string, sub: string, ruleset: "2014" | "2024") => {
    const id = identityOf(cls, sub, ruleset);
    return {
      source_document_key: id.source_document_key,
      source_record_key: id.source_record_key,
      ruleset,
      label: `${cls} / ${sub} (${ruleset}, ${id.source_document_key})`,
    };
  };

  for (const e of srd) {
    const head = base(e.class, e.subclass, e.ruleset);
    const ids = valid[e.ruleset];
    const entry: SubclassSpellData = {
      ...head,
      granted_spells: {},
      spell_variants: {},
      spell_variant_label: null,
      expanded_spells: {},
      expanded_spell_variants: {},
    };
    if (e.terrains) {
      for (const [option, rows] of Object.entries(e.terrains)) {
        entry.spell_variants[option] = toLevelMap(`${head.label} ${option}`, rows, e.ruleset, ids, skipped);
      }
      const label = VARIANT_LABEL[`${e.class}|${e.subclass}|${e.ruleset}`];
      if (!label) throw new Error(`${head.label}: variants without a label`);
      entry.spell_variant_label = label;
    } else if (e.table) {
      const map = toLevelMap(head.label, e.table, e.ruleset, ids, skipped);
      if (e.level_kind === "spell_level") {
        if (e.class !== "Warlock") throw new Error(`${head.label}: spell-level table on a ${e.class}`);
        entry.expanded_spells = map;
      } else {
        entry.granted_spells = map;
      }
    }
    entries.push(entry);
  }

  for (const e of thirdParty) {
    if (!e.tables.length) continue;
    const head = base(e.class, e.subclass, e.ruleset);
    const ids = valid[e.ruleset];
    const entry: SubclassSpellData = {
      ...head,
      granted_spells: {},
      spell_variants: {},
      spell_variant_label: null,
      expanded_spells: {},
      expanded_spell_variants: {},
    };
    for (const table of e.tables) {
      const columns = Object.entries(table.columns);
      if (table.level_kind === "spell_level") {
        if (e.class !== "Warlock") throw new Error(`${head.label}: spell-level table on a ${e.class}`);
        // The first column is the patron's own list. Further columns (Animal
        // Lords' Air, Earth and Water affinities) depend on a choice: each is
        // an option of expanded_spell_variants, keyed by spell level.
        const [, first] = columns[0];
        entry.expanded_spells = toLevelMap(head.label, first, e.ruleset, ids, skipped);
        for (const [title, rows] of columns.slice(1)) {
          const option = title.replace(/ Spells$/, "");
          entry.expanded_spell_variants[option] = toLevelMap(`${head.label} ${option}`, rows, e.ruleset, ids, skipped);
        }
        if (columns.length > 1) {
          const label = VARIANT_LABEL[`${e.class}|${e.subclass}|${e.ruleset}`];
          if (!label) throw new Error(`${head.label}: expanded variants without a label`);
          entry.spell_variant_label = label;
        }
      } else {
        if (columns.length !== 1) throw new Error(`${head.label}: ${columns.length} columns in a class-level table`);
        entry.granted_spells = toLevelMap(head.label, columns[0][1], e.ruleset, ids, skipped);
      }
    }
    entries.push(entry);
  }

  entries.sort((a, b) =>
    `${a.source_document_key}::${a.source_record_key}::${a.ruleset}`.localeCompare(
      `${b.source_document_key}::${b.source_record_key}::${b.ruleset}`,
    ),
  );
  return { entries, skipped };
}

// ── Output ────────────────────────────────────────────────────────────────────

export function renderDataFile(entries: readonly SubclassSpellData[], skipped: readonly Skipped[]): string {
  const skippedLines = skipped.map(s => ` *   - ${s.label}: ${s.spell} (${s.reason})`).join("\n");
  const body = entries
    .map(e => {
      const { label, ...rest } = e;
      return `  // ${label}\n  ${JSON.stringify(rest)},`;
    })
    .join("\n");
  return `// GENERATED by scripts/library-subclass-spells.ts. Do not edit by hand; edit the
// script's inputs in scripts/data/ and run it again.
/**
 * The spells the library subclasses give a character (the subclass-spells epic).
 *
 * Each entry is matched to its library row by the identity every official row
 * already carries, (source_document_key, source_record_key, ruleset), never by
 * uuid, which differs between databases. The importer reads this for a newly
 * created library subclass; the migration writes the same data into the rows
 * that exist. Both come from one generator run.
 *
 * - \`granted_spells\`: always prepared, keyed by CLASS level.
 * - \`spell_variants\` / \`spell_variant_label\`: grants that depend on a choice
 *   (Circle of the Land's terrain or land type), option then class level.
 * - \`expanded_spells\`: a 2014 Warlock patron's expanded list, keyed by SPELL
 *   level. The character still picks these, so they are not granted.
 * - \`expanded_spell_variants\`: the same, when it depends on a choice (Animal
 *   Lords' affinity); option then spell level, labelled by \`spell_variant_label\`.
 *
 * ## Where it came from
 *
 * - The eight SRD subclasses (SRD 5.1 and SRD 5.2.1, CC-BY-4.0): read from the
 *   official PDFs and cross-checked equal to Open5e's text for the same
 *   subclass, spell by spell.
 * - The third-party subclasses (Tome of Heroes, Open5e's own and Tal'Dorei
 *   Campaign Setting content, OGL 1.0a via Open5e): parsed from the spell
 *   tables in Open5e's v2 class features, then matched to library spell ids
 *   by name within the same ruleset. A spell is never matched across rulesets.
 * - Every id below is checked against the library's spell ids for its ruleset
 *   when the file is generated and again by librarySubclassSpells.test.ts.
 *
 * ## Left out, on purpose
 *
 * Spells the books name that the library lacks:
${skippedLines}
 *
 * Condition notes in a table ("snakes only") are dropped; the spell is granted.
 * A spell a source lists twice at one level is kept once.
 */

export type LevelMap = Record<string, string[]>;

export interface LibrarySubclassSpells {
  source_document_key: string;
  source_record_key: string;
  ruleset: "2014" | "2024";
  granted_spells: LevelMap;
  spell_variants: Record<string, LevelMap>;
  spell_variant_label: string | null;
  expanded_spells: LevelMap;
  expanded_spell_variants: Record<string, LevelMap>;
}

export const LIBRARY_SUBCLASS_SPELLS: readonly LibrarySubclassSpells[] = [
${body}
];
`;
}

const sqlText = (s: string): string => `'${s.replaceAll("'", "''")}'`;
const sqlJson = (v: unknown): string => `${sqlText(JSON.stringify(v))}::jsonb`;

export function renderSql(entries: readonly SubclassSpellData[]): string {
  const rows = entries
    .map(
      e =>
        `    -- ${e.label}\n    (${sqlText(e.source_document_key)}, ${sqlText(e.source_record_key)}, ${sqlText(e.ruleset)}, ` +
        `${sqlJson(e.granted_spells)}, ${sqlJson(e.spell_variants)}, ` +
        `${e.spell_variant_label === null ? "null::text" : sqlText(e.spell_variant_label)}, ${sqlJson(e.expanded_spells)}, ${sqlJson(e.expanded_spell_variants)})`,
    )
    .join(",\n");
  return `-- Library subclass spells: the spells each official subclass gives a character.
--
-- GENERATED by scripts/library-subclass-spells.ts from the same data as
-- src/data/librarySubclassSpells.ts, so a newly imported subclass and a row that
-- exists today hold the same thing. Read that file's header for the sources
-- (SRD 5.1 / 5.2.1 under CC-BY-4.0; Tome of Heroes, Open5e and Tal'Dorei content
-- under OGL 1.0a via Open5e) and for what was left out.
--
-- Rows are matched on the official identity (source_document_key,
-- source_record_key, ruleset), never on uuid. Only library rows (user_id is
-- null) are touched, and only while all four columns are still empty, so a
-- hand edit made in the Codex is never overwritten and a second run changes
-- nothing. An empty library (CI, a fresh database) matches no row.

update public.custom_subclasses s
   set granted_spells = v.granted_spells,
       spell_variants = v.spell_variants,
       spell_variant_label = v.spell_variant_label,
       expanded_spells = v.expanded_spells,
       expanded_spell_variants = v.expanded_spell_variants
  from (values
${rows}
  ) as v(source_document_key, source_record_key, ruleset, granted_spells, spell_variants, spell_variant_label, expanded_spells, expanded_spell_variants)
 where s.user_id is null
   and s.source_document_key = v.source_document_key
   and s.source_record_key = v.source_record_key
   and s.ruleset = v.ruleset
   and s.granted_spells = '{}'::jsonb
   and s.spell_variants = '{}'::jsonb
   and s.expanded_spells = '{}'::jsonb
   and s.expanded_spell_variants = '{}'::jsonb;
`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(here, "data", name), "utf8")) as T;
  const { entries, skipped } = buildEntries(
    read<SrdEntry[]>("subclass-spells.srd.json"),
    read<ThirdPartyEntry[]>("subclass-spells.third-party.json"),
    read<Identity[]>("library-subclass-identities.json"),
    read<Record<"2014" | "2024", string[]>>("library-spell-ids.json"),
  );
  writeFileSync(resolve(here, "../src/data/librarySubclassSpells.ts"), renderDataFile(entries, skipped));
  const sqlFlag = process.argv.indexOf("--sql");
  if (sqlFlag !== -1 && process.argv[sqlFlag + 1]) writeFileSync(process.argv[sqlFlag + 1], renderSql(entries));
  console.log(`${entries.length} subclasses, ${skipped.length} skipped`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
