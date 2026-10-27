import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIBRARY_SUBCLASS_SPELLS } from "../src/data/librarySubclassSpells";
import { buildEntries, type Identity, renderDataFile, renderSql } from "./library-subclass-spells";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => JSON.parse(readFileSync(resolve(here, "data", name), "utf8"));

const built = buildEntries(
  read("subclass-spells.srd.json"),
  read("subclass-spells.third-party.json"),
  read("library-subclass-identities.json"),
  read("library-spell-ids.json"),
);

describe("library-subclass-spells generator", () => {
  it("the committed data file is what the generator writes now", () => {
    const committed = readFileSync(resolve(here, "../src/data/librarySubclassSpells.ts"), "utf8");
    expect(committed).toBe(renderDataFile(built.entries, built.skipped));
  });

  it("builds the same entries the data file exports", () => {
    expect(LIBRARY_SUBCLASS_SPELLS).toHaveLength(built.entries.length);
  });

  it("skips a spell the library lacks rather than matching it in another ruleset", () => {
    expect(built.skipped.map(s => s.spell)).toEqual(
      expect.arrayContaining(["crown of madness", "destructive wave", "phantasmal force", "dissonant whispers", "bloodbound"]),
    );
  });

  it("rejects an id that is not in the ruleset's library", () => {
    const bad = [
      { class: "Cleric", subclass: "Life Domain", ruleset: "2014", level_kind: "cleric_level", table: { "1": [{ name: "x", library_id: "nope" }] } },
    ];
    expect(() =>
      buildEntries(bad as never, [], read("library-subclass-identities.json"), { "2014": [], "2024": [] }),
    ).toThrow(/not a 2014 library spell/);
  });

  it("writes SQL that only touches empty official rows by identity", () => {
    const sql = renderSql(built.entries);
    expect(sql).toContain("s.user_id is null");
    expect(sql).toContain("s.source_record_key = v.source_record_key");
    expect(sql).toContain("s.granted_spells = '{}'::jsonb");
    expect(sql).not.toMatch(/\bid\s*=\s*'/);
    expect((sql.match(/^ {4}\('/gm) ?? []).length).toBe(built.entries.length);
  });
});


describe("buildEntries on small inputs", () => {
  type Srd = Parameters<typeof buildEntries>[0];
  const identity = (cls: string, sub: string, key: string): Identity => ({
    class_name: cls, subclass_name: sub, ruleset: "2014", source_document_key: "srd-2014", source_record_key: key,
  });
  const ids = { "2014": ["srd_a", "srd_b", "srd_c"], "2024": [] };
  const life = identity("Cleric", "Life Domain", "life");
  const spell = (name: string, library_id: string | null) => ({ name, library_id });
  const srd = (over: Partial<Srd[number]>): Srd => [{ class: "Cleric", subclass: "Life Domain", ruleset: "2014", level_kind: "cleric_level", table: {}, ...over }];

  it("orders levels numerically, keeps each spell once per level, and drops a level that ends up empty", () => {
    const { entries } = buildEntries(
      srd({ table: { "10": [spell("A", "srd_a")], "2": [spell("B", "srd_b"), spell("B", "srd_b")], "5": [spell("Ghost", null)] } }),
      [], [life], ids,
    );
    expect(Object.keys(entries[0].granted_spells)).toEqual(["2", "10"]);
    expect(entries[0].granted_spells["2"]).toEqual(["srd_b"]);
  });

  it("names a spell the library lacks as skipped, with the book and ruleset it was looked for in", () => {
    const { skipped } = buildEntries(srd({ table: { "1": [spell("Ghost", null)] } }), [], [life], ids);
    expect(skipped).toEqual([{ label: "Cleric / Life Domain (2014, srd-2014)", spell: "Ghost", reason: "not in the 2014 library" }]);
  });

  it("needs exactly one library row for a subclass, not none and not two", () => {
    expect(() => buildEntries(srd({}), [], [], ids)).toThrow(/0 library rows, expected 1/);
    expect(() => buildEntries(srd({}), [], [life, { ...life, source_record_key: "life-2" }], ids)).toThrow(/2 library rows, expected 1/);
  });

  it("puts a Warlock's spell-level table in the expanded list, and refuses one on any other class", () => {
    const patron = identity("Warlock", "Fiend", "fiend");
    const warlock = srd({ class: "Warlock", subclass: "Fiend", level_kind: "spell_level", table: { "1": [spell("A", "srd_a")] } });
    const { entries } = buildEntries(warlock, [], [patron], ids);
    expect(entries[0].expanded_spells).toEqual({ "1": ["srd_a"] });
    expect(entries[0].granted_spells).toEqual({});
    expect(() => buildEntries(srd({ level_kind: "spell_level", table: { "1": [] } }), [], [life], ids)).toThrow(/spell-level table on a Cleric/);
  });

  it("refuses variants that have no label to show", () => {
    expect(() => buildEntries(srd({ table: null, terrains: { Arctic: { "3": [spell("A", "srd_a")] } } }), [], [life], ids)).toThrow(/variants without a label/);
  });

  it("refuses a third-party class-level table with more than one column, which would need a choice it cannot store", () => {
    type Third = Parameters<typeof buildEntries>[1];
    const table: Third[number]["tables"][number] = {
      feature: "Domain Spells", level_kind: "class_level", grant_mode: "always_prepared",
      columns: { One: { "1": [spell("A", "srd_a")] }, Two: { "1": [spell("B", "srd_b")] } },
    };
    expect(() => buildEntries([], [{ class: "Cleric", subclass: "Life Domain", ruleset: "2014", tables: [table] }], [life], ids)).toThrow(/2 columns in a class-level table/);
  });

  it("sorts the entries by book and record key so the data file is stable", () => {
    const a = identity("Cleric", "Life Domain", "zeta");
    const b = identity("Cleric", "War Domain", "alpha");
    const { entries } = buildEntries(
      [...srd({}), ...srd({ subclass: "War Domain" })],
      [], [a, b], ids,
    );
    expect(entries.map((e) => e.source_record_key)).toEqual(["alpha", "zeta"]);
  });
});
