import { describe, expect, it } from "vitest";
import { castingFor, castingListName, classCastingAbility, limitAtClassLevel, subclassPreparedLimit } from "@/rules/subclassCasting";
import { thirdCasterPreset } from "@/levelup/subclassSpellcasting";
import { deriveEffectiveSpellSlots } from "@/rules/spellSlots";
import { computeSpellcastingByClass } from "@/rules/spellcastingByClass";
import { multiclassCasterLevel } from "@/types/spell.types";
import type { CharacterClass } from "@/types/multiclass.types";

const wizard = {
  caster_type: "spellbook" as const,
  spell_slots: [[2]],
  prepared_ability: "int" as const,
  slot_recovery: "long" as const,
};
const fighter = { caster_type: "none" as const, spell_slots: null };
const knight = { spellcasting: thirdCasterPreset() };

describe("castingFor", () => {
  it("a class that casts wins over its subclass", () => {
    const result = castingFor(wizard, { spellcasting: { ...thirdCasterPreset(), ability: "cha" } });
    expect(result?.source).toBe("class");
    expect(result?.ability).toBe("int");
    expect(result?.listName).toBeNull();
  });

  it("a non-caster class takes its subclass's casting", () => {
    const result = castingFor(fighter, knight);
    expect(result?.source).toBe("subclass");
    expect(result?.casterType).toBe("known");
    expect(result?.ability).toBe("int");
    expect(result?.listName).toBe("Wizard");
    expect(result?.spellSlots?.[2]).toEqual([2, 0, 0, 0]);
  });

  it("neither casts: null", () => {
    expect(castingFor(fighter, { spellcasting: null })).toBeNull();
    expect(castingFor(fighter, null)).toBeNull();
    expect(castingFor(undefined, undefined)).toBeNull();
  });

  it("an unresolved class definition yields nothing, as the server's subclass_casting does", () => {
    expect(castingFor(undefined, knight)).toBeNull();
    expect(castingFor(null, knight)).toBeNull();
  });

  it("a definition with no caster type is not a licence to cast from the subclass", () => {
    expect(castingFor({ caster_type: null }, knight)).toBeNull();
  });

  it("a non-caster class with a slot table keeps its slots and picks nothing", () => {
    const slots = [[2], [3]];
    const result = castingFor({ caster_type: "none", spell_slots: slots, slot_recovery: "short" }, null);
    expect(result).toMatchObject({ source: "class", casterType: "none", spellSlots: slots, spellsKnown: null, cantripsKnown: null, slotRecovery: "short" });
  });

  it("a subclass's casting wins over a non-caster class's slot table", () => {
    expect(castingFor({ caster_type: "none", spell_slots: [[2]] }, knight)?.source).toBe("subclass");
  });
});

describe("castingListName", () => {
  it("is the subclass list for a subclass caster, else the class name", () => {
    expect(castingListName("Fighter", castingFor(fighter, knight))).toBe("Wizard");
    expect(castingListName("Wizard", castingFor(wizard, null))).toBe("Wizard");
  });
});

describe("classCastingAbility", () => {
  it("reads the explicit ability, then the primary ability text", () => {
    expect(classCastingAbility({ prepared_ability: "wis" })).toBe("wis");
    expect(classCastingAbility({ primary_ability: "Charisma" })).toBe("cha");
    expect(classCastingAbility({ primary_ability: "Strength" })).toBeNull();
  });
});

describe("subclassPreparedLimit", () => {
  const prepared = castingFor(fighter, { spellcasting: { ...thirdCasterPreset(), caster_type: "prepared" } });
  it("is the ability modifier plus a third of the class levels, at least 1", () => {
    expect(subclassPreparedLimit(prepared, { int: 16, wis: 10, cha: 10 }, 9)).toBe(6);
    expect(subclassPreparedLimit(prepared, { int: 8, wis: 10, cha: 10 }, 3)).toBe(1);
  });
  it("is null for a class caster and for a known subclass caster", () => {
    expect(subclassPreparedLimit(castingFor(wizard, null), { int: 16, wis: 10, cha: 10 }, 9)).toBeNull();
    expect(subclassPreparedLimit(castingFor(fighter, knight), { int: 16, wis: 10, cha: 10 }, 9)).toBeNull();
  });
});

describe("subclass casters in the slot rules", () => {
  const entry = (class_name: string, levels: number) => ({ class_name, levels });
  const lookup = (e: { class_name: string }) => (e.class_name === "Wizard" ? wizard : fighter);
  const subLookup = (e: { class_name: string }) => (e.class_name === "Fighter" ? knight : null);

  it("counts a third caster as floor(L/3) in the multiclass caster level", () => {
    expect(multiclassCasterLevel([
      { class_name: "Wizard", levels: 5 },
      { class_name: "Fighter", levels: 6, category: "third" },
    ], "2014")).toBe(7);
  });

  it.each([
    [3, [2]],
    [7, [4, 2]],
    [13, [4, 3, 2]],
    [19, [4, 3, 3, 1]],
  ])("a single-class Fighter %i has the third-caster slots", (level, row) => {
    const slots = deriveEffectiveSpellSlots({}, [entry("Fighter", level)], "2014", lookup, subLookup);
    expect(slots.map(s => s.max)).toEqual(row);
  });

  it("a Fighter without a casting subclass has no slots", () => {
    expect(deriveEffectiveSpellSlots({}, [entry("Fighter", 7)], "2014", lookup, () => null)).toEqual([]);
  });

  it("Wizard 5 / Fighter 6 uses caster level 7", () => {
    const slots = deriveEffectiveSpellSlots({}, [entry("Wizard", 5), entry("Fighter", 6)], "2014", lookup, subLookup);
    expect(slots.map(s => [s.level, s.max])).toEqual([[1, 4], [2, 3], [3, 3], [4, 1]]);
  });
});

describe("per-class stats for a subclass caster", () => {
  const row = {
    id: "r1", party_member_id: "m", class_name: "Fighter", class_definition_id: "fighter",
    class_definition_kind: "system", subclass_name: "Eldritch Knight", subclass_definition_id: "ek",
    subclass_variant: null, levels: 5, is_primary: true, hit_dice_used: 0, sort_order: 0, created_at: "", updated_at: "",
  } satisfies CharacterClass;
  const member = { str: 16, dex: 10, con: 10, int: 16, wis: 10, cha: 10, proficiency_bonus: 3 };

  it("casts off the subclass's ability", () => {
    const stats = computeSpellcastingByClass(
      member, [row],
      { system: [{ id: "fighter", caster_type: "none", primary_ability: "Strength" }], custom: [], subclasses: [{ id: "ek", ...knight }] },
      "2014",
    );
    expect(stats).toEqual([expect.objectContaining({ classId: "r1", casterType: "known", castingAbility: "int", dc: 14, attack: 6 })]);
  });

  it("a Fighter with no casting subclass has no spell stats", () => {
    const stats = computeSpellcastingByClass(
      member, [{ ...row, subclass_definition_id: null }],
      { system: [{ id: "fighter", caster_type: "none", primary_ability: "Strength" }], custom: [], subclasses: [] },
      "2014",
    );
    expect(stats).toEqual([]);
  });
});

describe("limitAtClassLevel", () => {
  const table = Array.from({ length: 20 }, (_, i) => i + 1);
  it("indexes by the class row's levels, clamped to 1..20", () => {
    expect(limitAtClassLevel(table, 3)).toBe(3);
    expect(limitAtClassLevel(table, 25)).toBe(20);
    expect(limitAtClassLevel(table, 0)).toBe(1);
  });
});

describe("a level-1 creation row with a chosen subclass", () => {
  it("takes its slots from the subclass, as the creation form's slot defaults do", () => {
    const eldritchKnight = { spellcasting: { ...thirdCasterPreset(), spell_slots: Array.from({ length: 20 }, (_, i) => (i >= 2 ? [2] : [])) } };
    const row = [{ class_name: "Fighter", levels: 3, class_definition_kind: "system" as const }];
    const withSubclass = deriveEffectiveSpellSlots({ spell_slots: null }, row, "2014", () => fighter, () => eldritchKnight);
    const without = deriveEffectiveSpellSlots({ spell_slots: null }, row, "2014", () => fighter, () => null);
    expect(withSubclass[0]).toMatchObject({ level: 1, max: 2 });
    expect(without).toEqual([]);
  });
});
