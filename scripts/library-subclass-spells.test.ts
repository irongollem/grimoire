import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIBRARY_SUBCLASS_SPELLS } from "../src/data/librarySubclassSpells";
import { buildEntries, renderDataFile, renderSql } from "./library-subclass-spells";

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
