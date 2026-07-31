import { describe, expect, it } from "vitest";
import { computeSpellcastingByClass } from "@/rules/spellcastingByClass";
import type { CharacterClass } from "@/types/multiclass.types";

function classEntry(overrides: Partial<CharacterClass> = {}): CharacterClass {
  return {
    id: "class-1",
    party_member_id: "member-1",
    class_name: "Wizard",
    class_definition_id: null,
    class_definition_kind: null,
    subclass_name: null,
    subclass_definition_id: null,
    levels: 3,
    is_primary: true,
    hit_dice_used: 0,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const member = {
  str: 10, dex: 10, con: 10, int: 16, wis: 12, cha: 14,
  proficiency_bonus: 2,
};

describe("computeSpellcastingByClass", () => {
  it("falls back to the class-name default ability and caster type with no definition", () => {
    const result = computeSpellcastingByClass(member, [classEntry()], { system: [], custom: [] }, "2014");
    expect(result).toEqual([{
      classId: "class-1",
      className: "Wizard",
      definitionKind: null,
      casterType: "spellbook",
      castingAbility: "int",
      attack: 5,
      dc: 13,
    }]);
  });

  it("prefers the definition's explicit prepared_ability over primary_ability text and class default", () => {
    const entry = classEntry({ class_definition_id: "def-1", class_definition_kind: "system" });
    const result = computeSpellcastingByClass(
      member,
      [entry],
      { system: [{ id: "def-1", prepared_ability: "cha", primary_ability: "Intelligence" }], custom: [] },
      "2014",
    );
    expect(result[0]?.castingAbility).toBe("cha");
  });

  it("derives ability from primary_ability text when prepared_ability is absent", () => {
    const entry = classEntry({ class_definition_id: "def-1", class_definition_kind: "system", class_name: "Custom Class" });
    const result = computeSpellcastingByClass(
      member,
      [entry],
      { system: [{ id: "def-1", primary_ability: "Wisdom" }], custom: [] },
      "2014",
    );
    expect(result[0]?.castingAbility).toBe("wis");
  });

  it("applies the 2024 ruleset policy's caster type for a system class, overriding the class-name default", () => {
    const entry = classEntry({ class_name: "Ranger", class_definition_kind: "system" });
    const result = computeSpellcastingByClass(member, [entry], { system: [], custom: [] }, "2024");
    // getCasterType("Ranger") defaults to "known", but the 2024 policy table makes Ranger a prepared caster.
    expect(result[0]?.casterType).toBe("prepared");
  });

  it("does not apply the ruleset policy to a custom class, even under 2024 — falls back to the definition's caster_type", () => {
    const entry = classEntry({ class_name: "Ranger", class_definition_id: "def-1", class_definition_kind: "custom" });
    const result = computeSpellcastingByClass(
      member,
      [entry],
      { system: [], custom: [{ id: "def-1", caster_type: "known", primary_ability: "Wisdom" }] },
      "2024",
    );
    expect(result[0]?.casterType).toBe("known");
  });
});
