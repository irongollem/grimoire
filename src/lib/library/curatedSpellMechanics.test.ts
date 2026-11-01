import { describe, expect, it } from "vitest";
import { storedMechanicsFor } from "@/lib/library/curatedSpellMechanics";
import type { CuratedRoll, CuratedSpellMechanics } from "@/lib/library/curatedSpellMechanics";

const roll = (over: Partial<CuratedRoll>): CuratedSpellMechanics => ({
  verdict: "roll",
  category: null,
  evidence: "x",
  roll: {
    kind: "damage", resolution: "automatic", save_ability: null, save_half: null,
    parts: [{ dice: "2d8", type: "necrotic" }], type_choices: null, adds_spellcasting_modifier: false,
    instances: null, upcast: null, cantrip_scaling: false, ...over,
  },
});
const leveled = { level: 2 };

describe("storedMechanicsFor", () => {
  it.each([
    ["attack_melee", "melee_spell", "hit"],
    ["attack_ranged", "ranged_spell", "hit"],
    ["automatic", "automatic", "automatic"],
  ] as const)("%s stores attack_type %s and outcome %s, no save", (resolution, attackType, outcome) => {
    const stored = storedMechanicsFor(roll({ resolution }), leveled);
    expect(stored.attack_type).toBe(attackType);
    expect(stored.save_attribute).toBeNull();
    expect(stored.save_effect).toBeNull();
    expect(stored.damage_rolls).toEqual([{ dice: "2d8", type: "necrotic" }]);
    expect(stored.effects).toHaveLength(1);
    expect(stored.effects[0]).toMatchObject({ id: "base", outcome, kind: "damage", dice: "2d8", damageType: "necrotic", multiplier: 1, phase: "impact", target: { type: null, count: null } });
  });

  it("a save that halves stores save_effect half and a 0.5 twin carrying the same dice", () => {
    const stored = storedMechanicsFor(roll({ resolution: "save", save_ability: "DEX", save_half: true, parts: [{ dice: "8d6", type: "Fire" }] }), leveled);
    expect(stored).toMatchObject({ attack_type: "save", save_attribute: "DEX", save_effect: "half" });
    expect(stored.effects.map((e) => [e.id, e.outcome, e.multiplier, e.dice, e.damageType])).toEqual([
      ["base", "failed_save", 1, "8d6", "fire"],
      ["base-save-half", "successful_save", 0.5, "8d6", "fire"],
    ]);
  });

  it("a save that negates stores no twin", () => {
    const stored = storedMechanicsFor(roll({ resolution: "save", save_ability: "WIS", save_half: false }), leveled);
    expect(stored.save_effect).toBe("negates");
    expect(stored.effects.map((e) => e.id)).toEqual(["base"]);
  });

  it("healing is automatic with healing_dice, no damage roll and a null damage type", () => {
    const stored = storedMechanicsFor(roll({ kind: "healing", parts: [{ dice: "2d8 + 3", type: null }], adds_spellcasting_modifier: true, upcast: { dice_per_level: "1d8", part_type: null } }), leveled);
    expect(stored).toMatchObject({ attack_type: "automatic", damage_rolls: null, healing_dice: "2d8+3", higher_level_damage: null, higher_level_healing: "1d8" });
    expect(stored.effects[0]).toMatchObject({ kind: "healing", damageType: null, modifier: "spellcasting_ability", scaling: { mode: "slot", dice: "1d8" } });
  });

  it("the spellcasting modifier lands on the first part only", () => {
    const stored = storedMechanicsFor(roll({ resolution: "attack_ranged", adds_spellcasting_modifier: true, parts: [{ dice: "1d6", type: "fire" }, { dice: "1d4", type: "cold" }] }), leveled);
    expect(stored.effects.map((e) => [e.id, e.modifier])).toEqual([["base", "spellcasting_ability"], ["base-2", null]]);
  });

  it("an upcast on two parts scales only the named part, on its twin too, and stores its type", () => {
    const stored = storedMechanicsFor(
      roll({ resolution: "save", save_ability: "DEX", save_half: true, parts: [{ dice: "2d8", type: "bludgeoning" }, { dice: "4d6", type: "cold" }], upcast: { dice_per_level: "1d6", part_type: "cold" } }),
      leveled,
    );
    expect(stored.higher_level_damage).toEqual({ dice_per_level: "1d6", type: "cold" });
    expect(stored.damage_rolls).toEqual([{ dice: "2d8", type: "bludgeoning" }, { dice: "4d6", type: "cold" }]);
    expect(stored.effects.map((e) => [e.id, e.scaling?.dice ?? null])).toEqual([
      ["base", null], ["base-save-half", null], ["base-2", "1d6"], ["base-2-save-half", "1d6"],
    ]);
  });

  it("an upcast on one part scales the base and its half twin", () => {
    const stored = storedMechanicsFor(roll({ resolution: "save", save_ability: "CON", save_half: true, upcast: { dice_per_level: "1d8", part_type: null } }), leveled);
    expect(stored.higher_level_damage).toEqual({ dice_per_level: "1d8", type: null });
    expect(stored.effects.every((e) => e.scaling?.mode === "slot" && e.scaling.dice === "1d8")).toBe(true);
  });

  it("an upcast on two parts that names no part cannot be converted", () => {
    expect(() => storedMechanicsFor(roll({ parts: [{ dice: "1d6", type: "fire" }, { dice: "1d6", type: "cold" }], upcast: { dice_per_level: "1d6", part_type: null } }), leveled)).toThrow();
  });

  it("instances ride the base effect with perSlotAbove, and carry no dice scaling", () => {
    const stored = storedMechanicsFor(roll({ resolution: "attack_ranged", instances: { noun: "ray", count: 3, per_slot_above: 1 } }), leveled);
    expect(stored.effects[0].instances).toEqual({ noun: "ray", count: 3, perSlotAbove: 1 });
    expect(stored.effects[0].scaling).toBeNull();
  });

  it("type choices store an empty roll type, a null effect type and the list on the base and its twin", () => {
    const stored = storedMechanicsFor(roll({ resolution: "save", save_ability: "DEX", save_half: true, parts: [{ dice: "3d6", type: null }], type_choices: ["Acid", "cold"] }), leveled);
    expect(stored.damage_rolls).toEqual([{ dice: "3d6", type: "" }]);
    for (const effect of stored.effects) expect(effect).toMatchObject({ damageType: null, damageTypeChoices: ["acid", "cold"] });
    expect(stored.effects).toHaveLength(2);
  });

  it("cantrip scaling adds character-level variants at 5, 11 and 17 with the dice times 2, 3 and 4", () => {
    // PHB 2014 "Cantrip Damage": the dice count doubles, triples, quadruples at levels 5, 11, 17.
    const stored = storedMechanicsFor(roll({ resolution: "attack_ranged", parts: [{ dice: "1d10", type: "fire" }], cantrip_scaling: true }), { level: 0 });
    expect(stored.effects.map((e) => [e.id, e.dice, e.scaling?.mode ?? null, e.scaling?.interval ?? null, e.scaling?.dice ?? null])).toEqual([
      ["base", "1d10", null, null, null],
      ["option-0", "2d10", "character_level", 5, "2d10"],
      ["option-1", "3d10", "character_level", 11, "3d10"],
      ["option-2", "4d10", "character_level", 17, "4d10"],
    ]);
  });

  it("cantrip scaling on a leveled spell cannot be converted", () => {
    expect(() => storedMechanicsFor(roll({ resolution: "attack_ranged", cantrip_scaling: true }), leveled)).toThrow();
  });

  it("a weapon rider is the rider shape: no effects, no attack type, one typed roll", () => {
    const stored = storedMechanicsFor(roll({ resolution: "weapon_rider", parts: [{ dice: "1d6", type: "radiant" }] }), leveled);
    expect(stored).toEqual({
      attack_type: null, save_attribute: null, save_effect: null, damage_rolls: [{ dice: "1d6", type: "radiant" }],
      healing_dice: null, higher_level_damage: null, higher_level_healing: null, effects: [],
    });
  });

  it("a not_one_roll entry has no stored mechanics", () => {
    expect(() => storedMechanicsFor({ verdict: "not_one_roll", category: "summon", roll: null, evidence: "x" }, leveled)).toThrow();
  });
});
