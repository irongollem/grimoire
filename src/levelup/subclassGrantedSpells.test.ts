import { describe, expect, it } from "vitest";
import { subclassGrantedSpellIds, subclassGrantedSpellRows } from "./subclassGrantedSpells";

describe("subclassGrantedSpellIds", () => {
  it("reads the ids keyed by class level", () => {
    expect(subclassGrantedSpellIds({ "1": ["bless", "cure-wounds"], "3": ["lesser-restoration"] }, 1))
      .toEqual(["bless", "cure-wounds"]);
  });
  it("is empty for a level with no grant or no definition", () => {
    expect(subclassGrantedSpellIds({ "3": ["x"] }, 1)).toEqual([]);
    expect(subclassGrantedSpellIds(null, 1)).toEqual([]);
  });
});

describe("subclassGrantedSpellRows", () => {
  it("builds always-prepared rows and skips spells already owned", () => {
    expect(subclassGrantedSpellRows(["bless", "cure-wounds"], new Set(["bless"])))
      .toEqual([{ spell_id: "cure-wounds", is_prepared: true, always_prepared: true }]);
  });
});
