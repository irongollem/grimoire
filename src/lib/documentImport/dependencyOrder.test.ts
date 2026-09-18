import { describe, expect, it } from "vitest";
import { IMPORT_ENTITY_KINDS, type ImportEntityKind } from "@/types/documentImport.types";

/**
 * `IMPORT_ENTITY_KINDS` used to be a genuine link-dependency order: the
 * wizard resolved each kind's cross-entity links immediately after importing
 * it, against whatever rows already existed at that moment, so a kind had to
 * be imported after everything it pointed at. The original order put
 * `factions` last while `npcs` — second — carries a `faction_name` link, so
 * that link could never resolve. It did not throw, did not warn, and did not
 * fail a single one of the 3,800 tests: the link was silently dropped every
 * time. It surfaced only by importing a real document and noticing the
 * `faction_npcs` join row that should have been written was absent.
 *
 * `runImportSweep` (`importSweep.ts`, #893) removed that constraint: every
 * kind imports first, in this order, and only afterward does one linking
 * phase resolve every reference against a registry built from the whole
 * sweep — so a link to a kind that imports *later* now works fine. Two of
 * #893's own new fields depend on exactly that: an NPC's `location_name`
 * (`locations` imports after `npcs`) and a quest beat's `encounter_names`
 * (`encounters` is last). This file's remaining job is narrower than it used
 * to be: pin the two pairings a past reordering actually got wrong, so a
 * future "reorder for readability" doesn't quietly reintroduce them — not
 * because either is required for a link to resolve today.
 */
describe("IMPORT_ENTITY_KINDS order", () => {
  it("declares exactly the eight kinds this importer supports", () => {
    expect([...IMPORT_ENTITY_KINDS].sort()).toEqual(
      ["encounters", "factions", "items", "locations", "monsters", "npcs", "quests", "spells"].sort(),
    );
  });

  it("puts factions before npcs specifically", () => {
    // Named on its own because this is the pairing that was actually wrong
    // once, when order still mattered for link resolution.
    const kinds: readonly string[] = IMPORT_ENTITY_KINDS;
    expect(kinds.indexOf("factions")).toBeLessThan(kinds.indexOf("npcs"));
  });

  it("puts encounters last", () => {
    // #840's own choice, named for the same reason as the factions/npcs
    // pairing above.
    const kinds: readonly string[] = IMPORT_ENTITY_KINDS;
    expect(kinds.indexOf("encounters")).toBe(kinds.length - 1);
  });

  it("resolves a link to a kind that imports LATER — the case the old per-kind ordering could never handle", () => {
    // Not a claim about IMPORT_ENTITY_KINDS itself (there is no ordering fix
    // that would make this true under the old scheme — locations importing
    // before npcs would just break parent_name's own self-reference in the
    // other direction). It's here as the fact that makes the header comment
    // checkable: npcs imports before locations, on purpose, and the sweep's
    // single post-import linking phase is what makes an NPC's `location_name`
    // resolve anyway.
    const kinds: readonly ImportEntityKind[] = IMPORT_ENTITY_KINDS;
    expect(kinds.indexOf("npcs")).toBeLessThan(kinds.indexOf("locations"));
  });
});
