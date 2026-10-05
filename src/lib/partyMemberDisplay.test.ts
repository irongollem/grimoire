import { describe, it, expect } from "vitest";
import { characterSummary } from "@/lib/partyMemberDisplay";
import type { CharacterClass } from "@/types/multiclass.types";

function cls(over: Partial<CharacterClass>): CharacterClass {
  return {
    id: "c",
    party_member_id: "m",
    class_name: "Ranger",
    class_definition_id: "d",
    class_definition_kind: "system",
    subclass_name: null,
    subclass_definition_id: null,
    levels: 1,
    is_primary: true,
    sort_order: 0,
    ...over,
  } as CharacterClass;
}

describe("characterSummary", () => {
  it("joins species, subrace, class and subclass", () => {
    const r = characterSummary({
      speciesName: "Elf",
      subrace: "Wood Elf",
      classes: [cls({ levels: 4, subclass_name: "Hunter" })],
      fallbackLevel: 1,
    });
    expect(r).toEqual({ level: 4, line: "Elf · Wood Elf · Ranger · Hunter" });
  });

  it("lists multiclass levels, primary first, and sums the level", () => {
    const r = characterSummary({
      speciesName: "Human",
      subrace: null,
      classes: [
        cls({ id: "b", class_name: "Wizard", levels: 3, is_primary: false, sort_order: 1 }),
        cls({ id: "a", class_name: "Fighter", levels: 5 }),
      ],
      fallbackLevel: 1,
    });
    expect(r).toEqual({ level: 8, line: "Human · Fighter 5 / Wizard 3" });
  });

  it("drops a missing species", () => {
    const r = characterSummary({ speciesName: null, subrace: null, classes: [cls({})], fallbackLevel: 1 });
    expect(r.line).toBe("Ranger");
  });

  it("falls back to the member level for a classless character", () => {
    expect(characterSummary({ speciesName: "Dwarf", subrace: null, classes: [], fallbackLevel: 2 }))
      .toEqual({ level: 2, line: "Dwarf" });
    expect(characterSummary({ speciesName: null, subrace: null, classes: undefined, fallbackLevel: 3 }))
      .toEqual({ level: 3, line: "" });
  });
});
