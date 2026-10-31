import { describe, expect, it } from "vitest";
import { checkSpellMechanics } from "@/lib/library/spellMechanicsCheck";
import type { SpellMechanicsInput } from "@/lib/library/spellMechanicsCheck";
import type { StructuredSpellEffect } from "@/types/spell.types";

function effect(overrides: Partial<StructuredSpellEffect>): StructuredSpellEffect {
  return {
    id: "base",
    phase: "impact",
    outcome: "hit",
    target: { type: "creature", count: 1 },
    kind: "damage",
    dice: "1d10",
    multiplier: 1,
    damageType: "fire",
    condition: null,
    description: null,
    scaling: null,
    modifier: null,
    ...overrides,
  };
}

const variant = (index: number, interval: number, dice: string, overrides: Partial<StructuredSpellEffect> = {}) =>
  effect({ id: `option-${index}`, dice, scaling: { mode: "character_level", interval, dice }, ...overrides });

const noRoll = {
  attack_type: null, save_attribute: null, save_effect: null, damage_rolls: null, healing_dice: null,
  higher_level_damage: null, higher_level_healing: null, effects: null, casting_options: null,
};

/** SRD 5.2 Fire Bolt. */
const fireBolt: SpellMechanicsInput = {
  ...noRoll,
  name: "Fire Bolt",
  level: 0,
  description: "Make a ranged spell attack against the target. On a hit, the target takes 1d10 Fire damage. A flammable object hit by this spell starts burning if it isn't being worn or carried.",
  higher_levels: "The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).",
  attack_type: "ranged_spell",
  damage_rolls: [{ dice: "1d10", type: "fire" }],
  effects: [effect({}), variant(0, 5, "2d10"), variant(1, 11, "3d10"), variant(2, 17, "4d10")],
};

const fireballTable = (dice: string[]) =>
  dice.map((damage_roll, index) => ({ type: `slot_level_${index + 4}`, damage_roll }));

/** SRD 5.1 Fireball, with the casting_options table Open5e ships. */
const fireball: SpellMechanicsInput = {
  ...noRoll,
  name: "Fireball",
  level: 3,
  description: "Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.",
  higher_levels: "When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.",
  attack_type: "save",
  save_attribute: "DEX",
  save_effect: "half",
  damage_rolls: [{ dice: "8d6", type: "fire" }],
  higher_level_damage: { dice_per_level: "1d6", type: null },
  effects: [
    effect({ outcome: "failed_save", dice: "8d6", scaling: { mode: "slot", dice: "1d6" } }),
    effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "8d6", scaling: { mode: "slot", dice: "1d6" } }),
  ],
  casting_options: fireballTable(["9d6", "10d6", "11d6", "12d6", "13d6", "14d6"]),
};

/** SRD 5.2 Cure Wounds. */
const cureWounds: SpellMechanicsInput = {
  ...noRoll,
  name: "Cure Wounds",
  level: 1,
  description: "A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier.",
  higher_levels: "The healing increases by 2d8 for each spell slot level above 1.",
  healing_dice: "2d8",
  higher_level_healing: "2d8",
  effects: [effect({ outcome: "automatic", kind: "healing", dice: "2d8", damageType: null, modifier: "spellcasting_ability", scaling: { mode: "slot", dice: "2d8" } })],
};

const shield: SpellMechanicsInput = {
  ...noRoll,
  name: "Shield",
  level: 1,
  description: "An invisible barrier of magical force appears and protects you. Until the start of your next turn, you have a +5 bonus to AC.",
  higher_levels: null,
};

function findingCodes(spell: SpellMechanicsInput): string[] {
  const verdict = checkSpellMechanics(spell);
  return verdict.approved ? [] : verdict.findings.map((finding) => finding.code);
}

describe("checkSpellMechanics: approvals", () => {
  it.each([
    ["Fire Bolt 2024 (cantrip with three character level variants)", fireBolt, "automation"],
    ["Fireball 2014 (save for half, slot scaling, agreeing table)", fireball, "automation"],
    ["Cure Wounds 2024 (healing with the spellcasting modifier)", cureWounds, "automation"],
    ["Shield (no dice anywhere)", shield, "no_dice"],
  ])("approves %s", (_name, spell, basis) => {
    expect(checkSpellMechanics(spell)).toEqual({ approved: true, basis });
  });

  // Spacing differs between books and between Open5e's dice and the prose.
  it("matches dice written with spaces around the sign", () => {
    const spaced: SpellMechanicsInput = {
      ...cureWounds,
      description: "A creature you touch regains a number of Hit Points equal to 2d8 + 4.",
      healing_dice: "2d8+4",
      higher_level_healing: "2d8",
      effects: [effect({ outcome: "automatic", kind: "healing", dice: "2d8+4", damageType: null, scaling: { mode: "slot", dice: "2d8" } })],
    };
    expect(checkSpellMechanics(spaced)).toEqual({ approved: true, basis: "automation" });
  });

  it("approves a save that does nothing on a success, with no half effect", () => {
    const plain: SpellMechanicsInput = {
      ...noRoll,
      name: "Sting",
      level: 1,
      description: "A creature must make a Wisdom saving throw or take 3d6 psychic damage.",
      higher_levels: null,
      attack_type: "save",
      save_attribute: "WIS",
      save_effect: "negates",
      damage_rolls: [{ dice: "3d6", type: "psychic" }],
      effects: [effect({ outcome: "failed_save", dice: "3d6", damageType: "psychic" })],
    };
    expect(checkSpellMechanics(plain)).toEqual({ approved: true, basis: "automation" });
  });
});

/** SRD 5.1 Fire Bolt: Open5e lists a variant for every character level from 5 to 20. */
const fireBolt2014: SpellMechanicsInput = {
  ...fireBolt,
  description: "You hurl a mote of fire at a creature or object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage.",
  higher_levels: "This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10).",
  effects: [
    effect({}),
    ...Array.from({ length: 16 }, (_, i) => {
      const level = i + 5;
      const dice = `${level >= 17 ? 4 : level >= 11 ? 3 : 2}d10`;
      return variant(i + 1, level, dice);
    }),
  ],
};

describe("checkSpellMechanics: per-level cantrip tables and cover", () => {
  // The resolver picks the highest variant reached, so a table with every level is
  // as correct as one with three steps; refusing it left every 2014 cantrip manual.
  it("approves a 2014 cantrip whose table lists every level from 5 to 20", () => {
    expect(checkSpellMechanics(fireBolt2014)).toEqual({ approved: true, basis: "automation" });
  });

  it("rejects a per-level table with one wrong level between the steps", () => {
    const wrong = fireBolt2014.effects?.map((e) => (e.scaling?.interval === 8 ? variant(4, 8, "3d10") : e));
    expect(findingCodes({ ...fireBolt2014, effects: wrong })).toEqual(["cantrip_variant_dice"]);
  });

  it("rejects a variant below character level 2", () => {
    expect(findingCodes({ ...fireBolt, effects: [...(fireBolt.effects ?? []), variant(9, 1, "1d10")] })).toContain("cantrip_variant_unexpected");
  });

  // SRD 5.2 Sacred Flame: "Half Cover" is cover, not half damage.
  it("approves a no-half save whose text mentions Half Cover", () => {
    const sacredFlame: SpellMechanicsInput = {
      ...fireBolt,
      name: "Sacred Flame",
      description: "Flame-like radiance descends on a creature that you can see within range. The target must succeed on a Dexterity saving throw or take 1d8 Radiant damage. The target gains no benefit from Half Cover or Three-Quarters Cover for this save.",
      higher_levels: "The damage increases by 1d8 when you reach levels 5 (2d8), 11 (3d8), and 17 (4d8).",
      attack_type: "save",
      save_attribute: "DEX",
      save_effect: "special",
      damage_rolls: [{ dice: "1d8", type: "radiant" }],
      effects: [
        effect({ outcome: "failed_save", dice: "1d8", damageType: "radiant" }),
        variant(0, 5, "2d8", { outcome: "failed_save", damageType: "radiant" }),
        variant(1, 11, "3d8", { outcome: "failed_save", damageType: "radiant" }),
        variant(2, 17, "4d8", { outcome: "failed_save", damageType: "radiant" }),
      ],
    };
    expect(checkSpellMechanics(sacredFlame)).toEqual({ approved: true, basis: "automation" });
  });
});

describe("checkSpellMechanics: rejections", () => {
  // Dimension Door: Open5e fills damage_roll for the arrival mishap, which is not the spell's damage.
  it("rejects automatic damage that is neither an attack nor a save", () => {
    const door: SpellMechanicsInput = {
      ...noRoll,
      name: "Dimension Door",
      level: 4,
      description: "You teleport yourself. If you would arrive in a place occupied by a creature, you and it each take 4d6 force damage and the teleportation fails.",
      higher_levels: null,
      attack_type: "automatic",
      damage_rolls: [{ dice: "4d6", type: "force" }],
      effects: [effect({ outcome: "automatic", dice: "4d6", damageType: "force" })],
    };
    expect(findingCodes(door)).toContain("no_attack_or_save");
  });

  it("rejects dice in the text when nothing is automated", () => {
    expect(findingCodes({ ...shield, description: "You regain 1d4 hit points." })).toEqual(["dice_without_automation"]);
  });

  // Ice Storm: a second damage part (4d6 cold) the one-roll model cannot hold.
  it("rejects a second damage part in the text", () => {
    const iceStorm: SpellMechanicsInput = {
      ...fireball,
      level: 4,
      description: "Each creature in the cylinder must make a Dexterity saving throw. A creature takes 2d8 bludgeoning damage and 4d6 cold damage on a failed save, or half as much damage on a successful one.",
      damage_rolls: [{ dice: "2d8", type: "bludgeoning" }],
      higher_levels: null,
      higher_level_damage: null,
      casting_options: null,
      effects: [
        effect({ outcome: "failed_save", dice: "2d8", damageType: "bludgeoning" }),
        effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "2d8", damageType: "bludgeoning" }),
      ],
    };
    expect(findingCodes(iceStorm)).toContain("extra_dice_in_text");
  });

  it.each([
    ["Heat Metal: the damage comes again each turn", "again", "A creature takes 2d8 fire damage on a failed save, or half as much damage on a successful one. Until the spell ends, you can use a bonus action to cause this damage again."],
    ["Scorching Ray: several rays", "plural rays, beams, darts or missiles", "You hurl three rays of fire. Each creature takes 2d6 fire damage on a failed save, or half as much damage on a successful one."],
  ])("flags a phrase the model cannot hold: %s", (_name, phrase, tail) => {
    const verdict = checkSpellMechanics({ ...fireball, description: `Make a Dexterity saving throw. ${tail}`, higher_levels: null, higher_level_damage: null, casting_options: null, damage_rolls: [{ dice: tail.match(/\d+d\d+/)?.[0] ?? "", type: "fire" }], effects: undefined });
    expect(verdict.approved).toBe(false);
    if (!verdict.approved) expect(verdict.findings.some((finding) => finding.code === "red_flag" && finding.detail === phrase)).toBe(true);
  });

  // Feeblemind: damage and a save that comes later; no sentence ties the dice to the save.
  it("rejects damage that is followed by a separate save", () => {
    const feeblemind: SpellMechanicsInput = {
      ...fireball,
      level: 8,
      description: "The target takes 4d6 psychic damage and must make an Intelligence saving throw. On a failed save, its Intelligence drops.",
      save_attribute: "INT",
      save_effect: "special",
      damage_rolls: [{ dice: "4d6", type: "psychic" }],
      higher_levels: null,
      higher_level_damage: null,
      casting_options: null,
      effects: [effect({ outcome: "failed_save", dice: "4d6", damageType: "psychic" })],
    };
    expect(findingCodes(feeblemind)).toContain("main_sentence_not_found");
  });

  it("rejects a cantrip without its level 17 variant", () => {
    expect(findingCodes({ ...fireBolt, effects: fireBolt.effects?.slice(0, 3) })).toEqual(["cantrip_variant_missing"]);
  });

  it("rejects a cantrip variant that does not multiply the base dice", () => {
    const wrong = fireBolt.effects?.map((e) => (e.id === "option-1" ? variant(1, 11, "2d10") : e));
    expect(findingCodes({ ...fireBolt, effects: wrong })).toEqual(["cantrip_variant_dice"]);
  });

  it("rejects a cantrip whose text does not give the stepped dice", () => {
    expect(findingCodes({ ...fireBolt, higher_levels: "The damage increases at higher levels." })).toContain("cantrip_text_missing");
  });

  it("rejects character level variants on a leveled spell", () => {
    expect(findingCodes({ ...fireball, effects: [...(fireball.effects ?? []), variant(0, 5, "9d6")] })).toContain("leveled_character_variant");
  });

  // Production data: Open5e's table said 9d6 at 4th; a base that scaled by 2d6 would roll 10d6.
  it("rejects when Open5e's own per-slot table disagrees with the scaling", () => {
    const verdict = checkSpellMechanics({ ...fireball, casting_options: fireballTable(["9d6", "10d6", "12d6", "12d6", "13d6", "14d6"]) });
    expect(verdict.approved).toBe(false);
    if (!verdict.approved) {
      expect(verdict.findings).toHaveLength(1);
      expect(verdict.findings[0]).toMatchObject({ code: "upcast_table_disagrees" });
      expect(verdict.findings[0].detail).toContain("Slot level 6");
      expect(verdict.findings[0].detail).toContain("11d6");
      expect(verdict.findings[0].detail).toContain("12d6");
    }
  });

  it("rejects an upcast the model does not hold (extra targets) instead of ignoring it", () => {
    const hold = { ...fireball, higher_levels: "When you cast this spell using a spell slot of 4th level or higher, you can target one additional creature.", higher_level_damage: null, effects: fireball.effects?.map((e) => ({ ...e, scaling: null })), casting_options: null };
    expect(findingCodes(hold)).toEqual(["upcast_not_modelled"]);
  });

  it("rejects a spell that scales by slot with no dice to say so", () => {
    expect(findingCodes({ ...fireball, higher_levels: "The spell is stronger.", casting_options: null, higher_level_damage: null })).toEqual(
      expect.arrayContaining(["upcast_scaling_without_text", "upcast_not_modelled"]),
    );
  });

  it("rejects when the stored per-level dice differ from the text", () => {
    expect(findingCodes({ ...fireball, higher_level_damage: { dice_per_level: "2d6", type: null } })).toContain("upcast_stored_mismatch");
  });

  it("rejects a save-for-half spell whose half effect is missing", () => {
    expect(findingCodes({ ...fireball, effects: fireball.effects?.slice(0, 1) })).toContain("save_half_missing");
  });

  it("rejects healing that carries the spellcasting modifier without marking it", () => {
    const unmarked = { ...cureWounds, effects: [effect({ outcome: "automatic", kind: "healing", dice: "2d8", damageType: null, scaling: { mode: "slot", dice: "2d8" } })] };
    expect(findingCodes(unmarked)).toEqual(["modifier_missing"]);
  });

  it("rejects an effect modifier the text never adds", () => {
    const stray = { ...fireball, effects: fireball.effects?.map((e) => ({ ...e, modifier: "spellcasting_ability" as const })) };
    expect(findingCodes(stray)).toContain("modifier_not_in_text");
  });

  it("rejects an effect whose dice differ from the stored roll", () => {
    expect(findingCodes({ ...fireBolt, effects: [effect({ dice: "2d10" }), ...(fireBolt.effects?.slice(1) ?? [])] })).toContain("base_dice_mismatch");
  });

  it("rejects an attack row whose text names the other attack type", () => {
    expect(findingCodes({ ...fireBolt, attack_type: "melee_spell" })).toContain("attack_type_not_in_text");
  });

  it("rejects a spell attack mentioned on a row that is not an attack", () => {
    expect(findingCodes({ ...fireball, description: `${fireball.description} Then make a melee spell attack.` })).toContain("spell_attack_not_modelled");
  });

  it("reports every failing finding, not only the first", () => {
    const codes = findingCodes({ ...fireball, description: `${fireball.description} It burns twice and again.`, casting_options: fireballTable(["1d6"]) });
    expect(codes).toEqual(expect.arrayContaining(["red_flag", "upcast_table_disagrees"]));
  });

  it("rejects two damage rolls", () => {
    expect(findingCodes({ ...fireball, damage_rolls: [{ dice: "8d6", type: "fire" }, { dice: "1d6", type: "cold" }] })).toEqual(["roll_count"]);
  });
  it("rejects higher-level text with dice beyond the per-level step", () => {
    const more = { ...fireball, higher_levels: `${fireball.higher_levels} It also deals 2d4 acid damage.` };
    expect(findingCodes(more)).toEqual(["upcast_extra_dice"]);
  });

  it("rejects a no-half save whose text still mentions half", () => {
    const sting: SpellMechanicsInput = {
      ...noRoll, name: "Sting", level: 1, higher_levels: null, attack_type: "save", save_attribute: "WIS", save_effect: "negates",
      description: "A creature must make a Wisdom saving throw or take 3d6 psychic damage. A charmed creature takes half as much damage.",
      damage_rolls: [{ dice: "3d6", type: "psychic" }],
      effects: [effect({ outcome: "failed_save", dice: "3d6", damageType: "psychic" })],
    };
    expect(findingCodes(sting)).toEqual(["half_not_modelled"]);
  });

  it("rejects healing text that also deals damage", () => {
    expect(findingCodes({ ...cureWounds, description: `${cureWounds.description} Undead take damage instead.` })).toContain("healing_mentions_damage");
  });

  it("rejects a save row whose ability the text does not name", () => {
    expect(findingCodes({ ...fireball, save_attribute: "WIS" })).toEqual(["save_ability_not_in_text"]);
  });

  it("rejects a base effect with a multiplier other than 1", () => {
    const halved = { ...fireball, effects: fireball.effects?.map((e) => (e.id === "base" ? { ...e, multiplier: 0.5 } : e)) };
    expect(findingCodes(halved)).toEqual(["base_multiplier"]);
  });

  it("rejects a half effect that does not scale like the base", () => {
    const unscaled = { ...fireball, effects: fireball.effects?.map((e) => (e.id === "base-save-half" ? { ...e, scaling: null } : e)) };
    expect(findingCodes(unscaled)).toEqual(expect.arrayContaining(["save_half_scaling_mismatch"]));
  });
});

const slot = (dice: string) => ({ mode: "slot" as const, dice });

/** SRD 5.1 Thunderwave: the half rule is its own sentence. */
const thunderwave: SpellMechanicsInput = {
  ...noRoll,
  name: "Thunderwave",
  level: 1,
  description: "A wave of thunderous force sweeps out from you. Each creature in a 15-foot cube originating from you must make a constitution saving throw. On a failed save, a creature takes 2d8 thunder damage and is pushed 10 feet away from you. On a successful save, the creature takes half as much damage and isn't pushed.",
  higher_levels: "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d8 for each slot level above 1st.",
  attack_type: "save",
  save_attribute: "CON",
  save_effect: "half",
  damage_rolls: [{ dice: "2d8", type: "thunder" }],
  higher_level_damage: { dice_per_level: "1d8", type: null },
  effects: [
    effect({ outcome: "failed_save", dice: "2d8", damageType: "thunder", scaling: slot("1d8") }),
    effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "2d8", damageType: "thunder", scaling: slot("1d8") }),
  ],
};

/** SRD 5.1 Ice Storm: bludgeoning and cold in one sentence, only the bludgeoning part grows. */
const iceStorm: SpellMechanicsInput = {
  ...noRoll,
  name: "Ice Storm",
  level: 4,
  description: "A hail of rock-hard ice pounds to the ground in a 20-foot-radius, 40-foot-high cylinder centered on a point within range. Each creature in the cylinder must make a dexterity saving throw. A creature takes 2d8 bludgeoning damage and 4d6 cold damage on a failed save, or half as much damage on a successful one. Hailstones turn the storm's area of effect into difficult terrain until the end of your next turn.",
  higher_levels: "When you cast this spell using a spell slot of 5th level or higher, the bludgeoning damage increases by 1d8 for each slot level above 4th.",
  attack_type: "save",
  save_attribute: "DEX",
  save_effect: "half",
  damage_rolls: [{ dice: "2d8", type: "bludgeoning" }, { dice: "4d6", type: "cold" }],
  higher_level_damage: { dice_per_level: "1d8", type: "bludgeoning" },
  effects: [
    effect({ outcome: "failed_save", dice: "2d8", damageType: "bludgeoning", scaling: slot("1d8") }),
    effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "2d8", damageType: "bludgeoning", scaling: slot("1d8") }),
    effect({ id: "base-2", outcome: "failed_save", dice: "4d6", damageType: "cold" }),
    effect({ id: "base-2-save-half", outcome: "successful_save", multiplier: 0.5, dice: "4d6", damageType: "cold" }),
  ],
  casting_options: [{ type: "slot_level_5", damage_roll: "3d8" }, { type: "slot_level_6", damage_roll: "4d8" }],
};

describe("checkSpellMechanics: half damage in its own sentence", () => {
  it("approves Thunderwave 2014", () => {
    expect(checkSpellMechanics(thunderwave)).toEqual({ approved: true, basis: "automation" });
  });

  // Bug (guard: the half sentence is read at all): a row marked half whose text does not halve.
  it("rejects a half row when the success sentence does not halve", () => {
    const noHalf = { ...thunderwave, description: thunderwave.description.replace("takes half as much damage and isn't pushed", "isn't pushed") };
    expect(findingCodes(noHalf)).toContain("save_effect_mismatch");
  });

  it("rejects the half text when the half effect is missing", () => {
    expect(findingCodes({ ...thunderwave, effects: thunderwave.effects?.slice(0, 1) })).toContain("save_half_missing");
  });

  // Spirit Guardians 2014: radiant for good or neutral casters, necrotic for evil ones.
  it("rejects a damage type the text offers a choice of", () => {
    const guardians: SpellMechanicsInput = {
      ...thunderwave,
      name: "Spirit Guardians",
      level: 3,
      description: "It must make a wisdom saving throw. On a failed save, the creature takes 3d8 radiant damage (if you are good or neutral) or 3d8 necrotic damage (if you are evil). On a successful save, the creature takes half as much damage.",
      higher_levels: null,
      higher_level_damage: null,
      save_attribute: "WIS",
      damage_rolls: [{ dice: "3d8", type: "radiant" }],
      effects: [
        effect({ outcome: "failed_save", dice: "3d8", damageType: "radiant" }),
        effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "3d8", damageType: "radiant" }),
      ],
    };
    expect(findingCodes(guardians)).toContain("main_sentence_not_found");
  });

  // Earthquake and Storm of Vengeance roll several dice, so the one-roll model cannot hold them.
  it("rejects a half sentence beside other dice", () => {
    expect(findingCodes({ ...thunderwave, description: `${thunderwave.description} A creature in a fissure takes 6d6 bludgeoning damage.` })).toContain("extra_dice_in_text");
  });
});

/** SRD 5.1 Meteor Swarm. */
const meteorSwarm: SpellMechanicsInput = {
  ...noRoll,
  name: "Meteor Swarm",
  level: 9,
  description: "Each creature in a 40-foot-radius sphere centered on each point you choose must make a dexterity saving throw. The sphere spreads around corners. A creature takes 20d6 fire damage and 20d6 bludgeoning damage on a failed save, or half as much damage on a successful one. A creature in the area of more than one fiery burst is affected only once.",
  higher_levels: null,
  attack_type: "save",
  save_attribute: "DEX",
  save_effect: "half",
  damage_rolls: [{ dice: "20d6", type: "fire" }, { dice: "20d6", type: "bludgeoning" }],
  effects: [
    effect({ outcome: "failed_save", dice: "20d6", damageType: "fire" }),
    effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "20d6", damageType: "fire" }),
    effect({ id: "base-2", outcome: "failed_save", dice: "20d6", damageType: "bludgeoning" }),
    effect({ id: "base-2-save-half", outcome: "successful_save", multiplier: 0.5, dice: "20d6", damageType: "bludgeoning" }),
  ],
};

describe("checkSpellMechanics: two damage parts in one sentence", () => {
  it("approves Ice Storm 2014 with only the bludgeoning part scaling", () => {
    expect(checkSpellMechanics(iceStorm)).toEqual({ approved: true, basis: "automation" });
  });

  // Bug: both parts scaled, so a 6th level Ice Storm rolled 6d6 cold.
  it("rejects a cold part that scales when the text names bludgeoning", () => {
    const wrong = { ...iceStorm, effects: iceStorm.effects?.map((e) => (e.id === "base-2" ? { ...e, scaling: slot("1d8") } : e)) };
    expect(findingCodes(wrong)).toContain("upcast_scaling_mismatch");
  });

  it("rejects a bludgeoning part that does not scale", () => {
    const wrong = { ...iceStorm, effects: iceStorm.effects?.map((e) => (e.id === "base" ? { ...e, scaling: null } : e)) };
    expect(findingCodes(wrong)).toContain("upcast_scaling_mismatch");
  });

  it("rejects a stored upcast type that is not the one the text names", () => {
    expect(findingCodes({ ...iceStorm, higher_level_damage: { dice_per_level: "1d8", type: "cold" } })).toContain("upcast_stored_type_mismatch");
  });

  // Flame Strike 2014: "the fire damage or the radiant damage (your choice)".
  it("rejects an upcast that names both parts", () => {
    const choice = { ...iceStorm, higher_levels: "When you cast this spell using a spell slot of 5th level or higher, the bludgeoning damage or the cold damage (your choice) increases by 1d8 for each slot level above 4th." };
    expect(findingCodes(choice)).toContain("upcast_part_unnamed");
  });

  // Meteor Swarm: two parts of equal dice are two rolls, because the resolver keys a roll on its damage type too.
  it("approves two parts with equal dice and different types", () => {
    expect(checkSpellMechanics(meteorSwarm)).toEqual({ approved: true, basis: "automation" });
  });

  // Bug: the second part of equal dice taken from the first, so the bludgeoning half was never checked.
  it("rejects equal-dice parts when the second part's type differs from the text", () => {
    const wrong = { ...meteorSwarm, damage_rolls: [{ dice: "20d6", type: "fire" }, { dice: "20d6", type: "cold" }] };
    expect(findingCodes(wrong)).toContain("main_sentence_not_found");
  });

  it("rejects the second part's effect when it is missing", () => {
    expect(findingCodes({ ...iceStorm, effects: iceStorm.effects?.filter((e) => e.id !== "base-2") })).toContain("base_effect_count");
  });

  it("rejects a cantrip with two parts", () => {
    expect(findingCodes({ ...iceStorm, level: 0 })).toContain("cantrip_two_parts");
  });
});

describe("checkSpellMechanics: dice that are not cast-time damage or healing", () => {
  const bless2024: SpellMechanicsInput = {
    ...noRoll,
    name: "Bless",
    level: 1,
    description: "You bless up to three creatures within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target adds 1d4 to the attack roll or save.",
    higher_levels: "You can target one additional creature for each spell slot level above 1.",
  };

  it.each([
    ["Bless 2024", bless2024],
    ["Bless 2014 (a bare d4)", { ...bless2024, description: "Whenever a target makes an attack roll or a saving throw before the spell ends, the target can roll a d4 and add the number rolled to the attack roll or saving throw." }],
    ["Resistance 2024", { ...bless2024, name: "Resistance", level: 0, higher_levels: null, description: "When the creature takes damage of the chosen type before the spell ends, the creature reduces the total damage taken by 1d4." }],
  ])("approves %s as no_cast_roll", (_name, spell) => {
    expect(checkSpellMechanics(spell)).toEqual({ approved: true, basis: "no_cast_roll" });
  });

  // Bug (guard: dice decide the outcome): Teleport and Confusion roll a table, Time Stop rolls its own length.
  it.each([
    ["Teleport: the die picks the outcome", "The GM rolls 1d100 and consults the Teleportation Outcome table."],
    ["Confusion: the die picks the behaviour", "The target must roll a d10 at the start of each of its turns to determine its behavior."],
    ["Time Stop: the die is a duration", "No time passes for other creatures, while you take 1d4 + 1 turns in a row."],
  ])("rejects %s", (_name, description) => {
    expect(findingCodes({ ...bless2024, description })).toEqual(["dice_without_automation"]);
  });

  // Bug (guard: damage after the die): Hunter's Mark, Divine Favor and the like deal their die as damage.
  it("rejects a die the text deals as damage", () => {
    expect(findingCodes({ ...bless2024, description: "Your weapon attacks deal an extra 1d6 damage to the target." })).toEqual(["dice_without_automation"]);
  });

  it("rejects a die in the upcast text", () => {
    expect(findingCodes({ ...bless2024, higher_levels: "The bonus increases by 1d4 for each spell slot level above 1." })).toEqual(["dice_without_automation"]);
  });

  // The two directions agree: a bare d20 in the text is a die, so the spell is not "no dice".
  it("does not call a text with a bare d20 roll a no-dice spell", () => {
    expect(findingCodes({ ...shield, description: "At the end of each of your turns, roll a d20. On an 11 or higher, you vanish." })).toEqual(["dice_without_automation"]);
  });

  it("does not count 'D20 Tests' as a roll", () => {
    expect(checkSpellMechanics({ ...shield, description: "The target takes a -4 penalty to D20 Tests." })).toEqual({ approved: true, basis: "no_dice" });
  });

  it("still approves a spell with no dice as no_dice", () => {
    expect(checkSpellMechanics(shield)).toEqual({ approved: true, basis: "no_dice" });
  });
});

describe("checkSpellMechanics: side effects the roll does not touch", () => {
  // Harm: "hit point maximum" is not a maximum of the damage; Sunbeam: "an additional 30 feet" is light.
  it.each([
    ["hit point maximum", "Its hit point maximum is reduced by an amount equal to the necrotic damage it took."],
    ["an additional distance", "It sheds dim light for an additional 30 feet."],
    ["a casting limit", "A creature can't be affected by this spell again until it finishes a long rest."],
  ])("does not flag %s", (_name, tail) => {
    expect(checkSpellMechanics({ ...thunderwave, description: `${thunderwave.description} ${tail}` })).toEqual({ approved: true, basis: "automation" });
  });

  it("still flags damage that comes again and extra targets", () => {
    expect(findingCodes({ ...thunderwave, description: `${thunderwave.description} You can cause this damage again.` })).toContain("red_flag");
    expect(findingCodes({ ...thunderwave, description: `${thunderwave.description} It affects an additional creature.` })).toContain("red_flag");
  });
});

describe("checkSpellMechanics: 2014 healing the importer now reads from the text", () => {
  it("approves Cure Wounds 2014 written with a plus sign and 'hit points'", () => {
    const cure2014: SpellMechanicsInput = {
      ...cureWounds,
      description: "A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.",
      higher_levels: "When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st.",
      healing_dice: "1d8",
      higher_level_healing: "1d8",
      effects: [effect({ outcome: "automatic", kind: "healing", dice: "1d8", damageType: null, modifier: "spellcasting_ability", scaling: slot("1d8") })],
    };
    expect(checkSpellMechanics(cure2014)).toEqual({ approved: true, basis: "automation" });
  });

  it("approves Prayer of Healing 2024, whose limit says 'again'", () => {
    const prayer: SpellMechanicsInput = {
      ...cureWounds,
      name: "Prayer of Healing",
      level: 2,
      description: "Up to five creatures of your choice who remain within range for the spell's entire casting gain the benefits of a Short Rest and also regain 2d8 Hit Points. A creature can't be affected by this spell again until that creature finishes a Long Rest.",
      higher_levels: "The healing increases by 1d8 for each spell slot level above 2.",
      higher_level_healing: "1d8",
      effects: [effect({ outcome: "automatic", kind: "healing", dice: "2d8", damageType: null, scaling: slot("1d8") })],
    };
    expect(checkSpellMechanics(prayer)).toEqual({ approved: true, basis: "automation" });
  });
});

// SRD text as Open5e serves it (api.open5e.com/v2/spells, 31 Oct 2026).
const instances = (extra: Partial<NonNullable<StructuredSpellEffect["instances"]>> & { noun: string; count: number }) => extra;

/** SRD 5.2 Scorching Ray. */
const scorchingRay: SpellMechanicsInput = {
  ...noRoll,
  name: "Scorching Ray",
  level: 2,
  description: "You hurl three fiery rays. You can hurl them at one target within range or at several. Make a ranged spell attack for each ray. On a hit, the target takes 2d6 Fire damage.",
  higher_levels: "You create one additional ray for each spell slot level above 2.",
  attack_type: "ranged_spell",
  damage_rolls: [{ dice: "2d6", type: "fire" }],
  effects: [effect({ dice: "2d6", instances: instances({ noun: "ray", count: 3, perSlotAbove: 1 }) })],
};

/** SRD 5.2 Magic Missile. */
const magicMissile: SpellMechanicsInput = {
  ...noRoll,
  name: "Magic Missile",
  level: 1,
  description: "You create three glowing darts of magical force. Each dart strikes a creature of your choice that you can see within range. A dart deals 1d4 + 1 Force damage to its target. The darts all strike simultaneously, and you can direct them to hit one creature or several.",
  higher_levels: "The spell creates one more dart for each spell slot level above 1.",
  attack_type: "automatic",
  damage_rolls: [{ dice: "1d4 + 1", type: "force" }],
  effects: [effect({ outcome: "automatic", dice: "1d4 + 1", damageType: "force", instances: instances({ noun: "dart", count: 3, perSlotAbove: 1 }) })],
};

/** SRD 5.2 Eldritch Blast: the dice never grow, the beams do. */
const eldritchBlast: SpellMechanicsInput = {
  ...noRoll,
  name: "Eldritch Blast",
  level: 0,
  description: "You hurl a beam of crackling energy. Make a ranged spell attack against one creature or object in range. On a hit, the target takes 1d10 Force damage.",
  higher_levels: "The spell creates two beams at level 5, three beams at level 11, and four beams at level 17. You can direct the beams at the same target or at different ones. Make a separate attack roll for each beam.",
  attack_type: "ranged_spell",
  damage_rolls: [{ dice: "1d10", type: "force" }],
  effects: [effect({ damageType: "force", instances: instances({ noun: "beam", count: 1, byCharacterLevel: [{ level: 5, count: 2 }, { level: 11, count: 3 }, { level: 17, count: 4 }] }) })],
};

describe("checkSpellMechanics: several rays, darts or beams", () => {
  it.each([
    ["Scorching Ray 2024", scorchingRay],
    ["Magic Missile 2024", magicMissile],
    ["Eldritch Blast 2024", eldritchBlast],
  ])("approves %s", (_name, spell) => {
    expect(checkSpellMechanics(spell)).toEqual({ approved: true, basis: "automation" });
  });

  // Bug (guard: the stored count is compared with the text's): a ray spell stored with four rays.
  it("rejects a count the text does not give", () => {
    const wrong = { ...scorchingRay, effects: [effect({ dice: "2d6", instances: instances({ noun: "ray", count: 4, perSlotAbove: 1 }) })] };
    expect(findingCodes(wrong)).toContain("instances_mismatch");
  });

  // Bug (guard: instances only count when stored): the ray text slipped past the red flags.
  it("still rejects a ray spell whose effect carries no instances", () => {
    expect(findingCodes({ ...scorchingRay, effects: [effect({ dice: "2d6" })] })).toContain("red_flag");
  });

  // Bug (guard: instances must be found in the text): a stored count on a spell with one ray.
  it("rejects instances stored on a spell whose text has no such sentences", () => {
    expect(findingCodes({ ...fireBolt, effects: [effect({ instances: instances({ noun: "ray", count: 3 }) })] })).toContain("instances_not_in_text");
  });

  // Bug (guard: no dice scaling beside a growing count): a 4th-level Scorching Ray rolling 4d6 per ray.
  it("rejects slot dice scaling on a spell that grows its count", () => {
    const wrong = { ...scorchingRay, effects: [effect({ dice: "2d6", scaling: slot("1d6"), instances: instances({ noun: "ray", count: 3, perSlotAbove: 1 }) })] };
    expect(findingCodes(wrong)).toContain("upcast_scaling_without_text");
  });

  it("rejects stored per-level dice for a spell that grows its count", () => {
    expect(findingCodes({ ...scorchingRay, higher_level_damage: { dice_per_level: "1d6", type: null } })).toContain("upcast_stored_mismatch");
  });

  // Bug (guard: no cantrip variants beside beams): an Eldritch Blast that both adds beams and grows its dice.
  it("rejects dice variants on a cantrip that grows its beams", () => {
    const wrong = { ...eldritchBlast, effects: [...(eldritchBlast.effects ?? []), variant(0, 5, "2d10", { damageType: "force" })] };
    expect(findingCodes(wrong)).toContain("instances_character_variant");
  });

  // Bug (guard: upcast text beyond the count is refused): a second rule in the higher levels dropped.
  it("rejects higher-level text beyond the count sentence", () => {
    expect(findingCodes({ ...scorchingRay, higher_levels: `${scorchingRay.higher_levels} The rays also set the target on fire.` })).toContain("upcast_not_modelled");
  });

  // Bug (guard: darts that strike on their own are automatic): a Magic Missile that asks for an attack roll.
  it("rejects darts marked as a spell attack", () => {
    expect(findingCodes({ ...magicMissile, attack_type: "ranged_spell" })).toContain("instances_attack_type");
  });

  it("rejects darts whose outcome waits on a hit", () => {
    const wrong = { ...magicMissile, effects: [effect({ outcome: "hit", dice: "1d4 + 1", damageType: "force", instances: instances({ noun: "dart", count: 3, perSlotAbove: 1 }) })] };
    expect(findingCodes(wrong)).toContain("outcome_mismatch");
  });

  it("rejects instances on a save-for-half branch", () => {
    const wrong = { ...scorchingRay, effects: [...(scorchingRay.effects ?? []), effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "2d6", instances: instances({ noun: "ray", count: 3 }) })] };
    expect(findingCodes(wrong)).toContain("instances_on_other_effect");
  });

  // Bug (guard: instances sit only on a single attack or automatic roll).
  it("rejects instances on a save spell", () => {
    expect(findingCodes({ ...thunderwave, effects: thunderwave.effects?.map((e) => ({ ...e, instances: e.id === "base" ? instances({ noun: "ray", count: 3 }) : null })) })).toContain("instances_shape");
  });
});

/** SRD 5.2 Spirit Guardians. */
const spiritGuardians: SpellMechanicsInput = {
  ...noRoll,
  name: "Spirit Guardians",
  level: 3,
  description: "Protective spirits flit around you in a 15-foot Emanation for the duration. Any other creature's Speed is halved in the Emanation, and whenever the Emanation enters a creature's space and whenever a creature enters the Emanation or ends its turn there, the creature must make a Wisdom saving throw. On a failed save, the creature takes 3d8 Radiant damage (if you are good or neutral) or 3d8 Necrotic damage (if you are evil). On a successful save, the creature takes half as much damage. A creature makes this save only once per turn.",
  higher_levels: "The damage increases by 1d8 for each spell slot level above 3.",
  attack_type: "save",
  save_attribute: "WIS",
  save_effect: "half",
  damage_rolls: [{ dice: "3d8", type: "" }],
  higher_level_damage: { dice_per_level: "1d8", type: null },
  effects: [
    effect({ outcome: "failed_save", dice: "3d8", damageType: null, damageTypeChoices: ["radiant", "necrotic"], scaling: slot("1d8") }),
    effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "3d8", damageType: null, damageTypeChoices: ["radiant", "necrotic"], scaling: slot("1d8") }),
  ],
  casting_options: [{ type: "slot_level_4", damage_roll: "4d8" }, { type: "slot_level_5", damage_roll: "5d8" }],
};

/** SRD 5.2 Dragon's Breath. */
const dragonsBreath: SpellMechanicsInput = {
  ...noRoll,
  name: "Dragon's Breath",
  level: 2,
  description: "You touch one willing creature, and choose Acid, Cold, Fire, Lightning, or Poison. Until the spell ends, the target can take a Magic action to exhale a 15-foot Cone. Each creature in that area makes a Dexterity saving throw, taking 3d6 damage of the chosen type on a failed save or half as much damage on a successful one.",
  higher_levels: "The damage increases by 1d6 for each spell slot level above 2.",
  attack_type: "save",
  save_attribute: "DEX",
  save_effect: "half",
  damage_rolls: [{ dice: "3d6", type: "" }],
  higher_level_damage: { dice_per_level: "1d6", type: null },
  effects: ["base", "base-save-half"].map((id) => effect({
    id, outcome: id === "base" ? "failed_save" : "successful_save", multiplier: id === "base" ? 1 : 0.5,
    dice: "3d6", damageType: null, damageTypeChoices: ["acid", "cold", "fire", "lightning", "poison"], scaling: slot("1d6"),
  })),
};

/** SRD 5.2 Chromatic Orb: its leap is a second roll the model cannot hold. */
const chromaticOrb: SpellMechanicsInput = {
  ...noRoll,
  name: "Chromatic Orb",
  level: 1,
  description: "You hurl an orb of energy at a target within range. Choose Acid, Cold, Fire, Lightning, Poison, or Thunder for the type of orb you create, and then make a ranged spell attack against the target. On a hit, the target takes 3d8 damage of the chosen type. If you roll the same number on two or more of the d8s, the orb leaps to a different target of your choice within 30 feet of the target. The orb can't leap again unless you cast the spell with a level 2+ spell slot.",
  higher_levels: "The damage increases by 1d8 for each spell slot level above 1. The orb can leap a maximum number of times equal to the level of the slot expended.",
  attack_type: "ranged_spell",
  damage_rolls: [{ dice: "3d8", type: "" }],
  higher_level_damage: { dice_per_level: "1d8", type: null },
  effects: [effect({ dice: "3d8", damageType: null, damageTypeChoices: ["acid", "cold", "fire", "lightning", "poison", "thunder"], scaling: slot("1d8") })],
};

describe("checkSpellMechanics: a damage type chosen at cast", () => {
  it.each([
    ["Spirit Guardians 2024", spiritGuardians],
    ["Dragon's Breath 2024", dragonsBreath],
  ])("approves %s", (_name, spell) => {
    expect(checkSpellMechanics(spell)).toEqual({ approved: true, basis: "automation" });
  });

  // Bug (guard: a choice effect carries no fixed type): Spirit Guardians stored as radiant only.
  it("rejects a fixed type on an effect that also lists choices", () => {
    const wrong = { ...dragonsBreath, effects: dragonsBreath.effects?.map((e) => ({ ...e, damageType: "fire" })) };
    expect(findingCodes(wrong)).toContain("base_damage_type_mismatch");
  });

  // Bug (guard: the stored list is the text's list, in order).
  it("rejects choices that differ from the text's list", () => {
    const wrong = { ...dragonsBreath, effects: dragonsBreath.effects?.map((e) => ({ ...e, damageTypeChoices: ["acid", "cold", "fire", "lightning"] })) };
    expect(findingCodes(wrong)).toContain("choices_mismatch");
  });

  // Bug: the save-for-half branch left without the choice, so a successful save rolled no type.
  it("rejects a half branch that lost the choices", () => {
    const wrong = { ...spiritGuardians, effects: spiritGuardians.effects?.map((e) => (e.id === "base-save-half" ? { ...e, damageTypeChoices: null } : e)) };
    expect(findingCodes(wrong)).toContain("choices_mismatch");
  });

  // Bug: the base effect's list edited alone, so the half branch kept the old types.
  it("rejects a base effect whose choices differ while its half branch is right", () => {
    const wrong = { ...dragonsBreath, effects: dragonsBreath.effects?.map((e) => (e.id === "base" ? { ...e, damageTypeChoices: ["acid", "cold"] } : e)) };
    expect(findingCodes(wrong)).toContain("choices_mismatch");
  });

  // Bug: a half branch given choices the base does not have.
  it("rejects choices on a half branch of a spell whose base has none", () => {
    const wrong = { ...fireball, effects: fireball.effects?.map((e) => (e.id === "base-save-half" ? { ...e, damageTypeChoices: ["fire", "cold"] } : e)) };
    expect(findingCodes(wrong)).toContain("choices_mismatch");
  });

  // Bug (guard: choices only where the text offers them): a plain Fireball given a pick of types.
  it("rejects choices on a spell whose text names one type", () => {
    const wrong = { ...fireball, effects: fireball.effects?.map((e) => ({ ...e, damageTypeChoices: ["fire", "cold"] })) };
    expect(findingCodes(wrong)).toContain("choices_mismatch");
  });

  // Bug (guard: a choice roll stores no type).
  it("rejects a typed roll beside choices", () => {
    expect(findingCodes({ ...dragonsBreath, damage_rolls: [{ dice: "3d6", type: "fire" }] })).toContain("choice_type_stored");
  });

  it("still rejects an untyped roll with no choices", () => {
    expect(findingCodes({ ...dragonsBreath, effects: dragonsBreath.effects?.map((e) => ({ ...e, damageTypeChoices: null })) })).toContain("damage_type_missing");
  });

  // Bug: the zone-trigger exemption widened to every "whenever" (guard: exact Spirit Guardians phrase only).
  it("still flags a whenever that is not the Spirit Guardians trigger", () => {
    expect(findingCodes({ ...spiritGuardians, description: `${spiritGuardians.description} Whenever you like, you can end it.` })).toContain("red_flag");
  });

  // Chromatic Orb 2024: the leap rolls again against a second target.
  it("rejects Chromatic Orb 2024 for its leap", () => {
    const verdict = checkSpellMechanics(chromaticOrb);
    expect(verdict.approved).toBe(false);
    expect(verdict.approved ? [] : verdict.findings).toContainEqual({ code: "red_flag", detail: "leaps to another target" });
  });

  // The choice itself reads fine on an orb without a leap; the leap is the only reason to refuse it.
  it("approves the Chromatic Orb shape once the leap is not in the text", () => {
    const noLeap = {
      ...chromaticOrb,
      description: chromaticOrb.description.split(" If you roll")[0],
      higher_levels: "The damage increases by 1d8 for each spell slot level above 1.",
    };
    expect(checkSpellMechanics(noLeap)).toEqual({ approved: true, basis: "automation" });
  });
});

/** SRD 5.2 Hex. */
const hex: SpellMechanicsInput = {
  ...noRoll,
  name: "Hex",
  level: 1,
  description: "You place a curse on a creature that you can see within range. Until the spell ends, you deal an extra 1d6 Necrotic damage to the target whenever you hit it with an attack roll. Also, choose one ability when you cast the spell. The target has Disadvantage on ability checks made with the chosen ability. If the target drops to 0 Hit Points before this spell ends, you can take a Bonus Action on a later turn to curse a new creature.",
  higher_levels: "Your Concentration can last longer with a spell slot of level 2 (up to 4 hours), 3–4 (up to 8 hours), or 5+ (24 hours).",
  damage_rolls: [{ dice: "1d6", type: "necrotic" }],
  effects: [],
};

/** SRD 5.2 Shining Smite, with Open5e's per-slot table. */
const shiningSmite: SpellMechanicsInput = {
  ...noRoll,
  name: "Shining Smite",
  level: 2,
  description: "The target hit by the strike takes an extra 2d6 Radiant damage from the attack. Until the spell ends, the target sheds Bright Light in a 5-foot radius, attack rolls against it have Advantage, and it can't benefit from the Invisible condition.",
  higher_levels: "The damage increases by 1d6 for each spell slot level above 2.",
  damage_rolls: [{ dice: "2d6", type: "radiant" }],
  higher_level_damage: { dice_per_level: "1d6", type: null },
  effects: [],
  casting_options: [{ type: "slot_level_3", damage_roll: "3d6" }, { type: "slot_level_4", damage_roll: "4d6" }],
};

/** SRD 5.1 Divine Favor. */
const divineFavor: SpellMechanicsInput = {
  ...noRoll,
  name: "Divine Favor",
  level: 1,
  description: "Your prayer empowers you with divine radiance. Until the spell ends, your weapon attacks deal an extra 1d4 radiant damage on a hit.",
  higher_levels: null,
  damage_rolls: [{ dice: "1d4", type: "radiant" }],
  effects: [],
};

describe("checkSpellMechanics: extra damage on a hit (riders)", () => {
  it.each([
    ["Hex 2024 (the longer concentration is not a roll)", hex],
    ["Shining Smite 2024 (slot scaling, agreeing table)", shiningSmite],
    ["Divine Favor 2014", divineFavor],
  ])("approves %s as a rider", (_name, spell) => {
    expect(checkSpellMechanics(spell)).toEqual({ approved: true, basis: "rider" });
  });

  // Bug (guard: no effects): a rider that opens the resolver at cast and rolls its damage before any hit.
  it("rejects a rider that also carries effects", () => {
    expect(findingCodes({ ...hex, effects: [effect({ outcome: "automatic", dice: "1d6", damageType: "necrotic" })] })).toContain("rider_has_effects");
  });

  // Bug (guard: no cast-time attack): Hunter's Mark marked as a ranged spell attack, so it auto-rolled at cast.
  it("rejects a rider with an attack type", () => {
    expect(findingCodes({ ...hex, attack_type: "ranged_spell" })).toContain("rider_attack_type");
  });

  // Bug (guard: the stored roll is the text's roll).
  it("rejects a rider whose stored type differs from the text", () => {
    expect(findingCodes({ ...hex, damage_rolls: [{ dice: "1d6", type: "fire" }] })).toContain("rider_roll_mismatch");
  });

  // Bug (guard: red flags apply to the rest of a rider's text): the damage comes again, and only "extra" was excused.
  it("still flags a rider whose damage comes again", () => {
    expect(findingCodes({ ...hex, description: `${hex.description} You can cause this damage again.` })).toContain("red_flag");
  });

  // Bug (guard: an upcast beyond duration is refused).
  it("rejects an upcast that is not only a longer duration", () => {
    expect(findingCodes({ ...hex, higher_levels: "A second creature of your choice also takes the extra damage." })).toContain("upcast_not_modelled");
  });

  // Bug (guard: the stored per-level step is the text's).
  it("rejects a rider upcast whose stored step differs", () => {
    expect(findingCodes({ ...shiningSmite, higher_level_damage: { dice_per_level: "1d8", type: null } })).toContain("upcast_stored_mismatch");
  });

  // Bug (guard: the rider's upcast table is checked too).
  it("rejects a rider whose per-slot table disagrees", () => {
    expect(findingCodes({ ...shiningSmite, casting_options: [{ type: "slot_level_3", damage_roll: "4d6" }] })).toContain("upcast_table_disagrees");
  });

  // Bug (guard: a per-level step needs the dice in the text): a step stored for a rider that does not grow.
  it("rejects a stored step the text does not give", () => {
    expect(findingCodes({ ...divineFavor, higher_level_damage: { dice_per_level: "1d4", type: null } })).toContain("upcast_stored_mismatch");
  });

  // Searing Smite 2024: the burning comes at the start of each turn, so it is not a one-off rider.
  it("does not accept Searing Smite as a rider", () => {
    const searing: SpellMechanicsInput = {
      ...shiningSmite,
      name: "Searing Smite",
      level: 1,
      description: "As you hit the target, it takes an extra 1d6 Fire damage from the attack. At the start of each of its turns until the spell ends, the target takes 1d6 Fire damage and then makes a Constitution saving throw. On a failed save, the spell continues. On a successful save, the spell ends.",
      damage_rolls: [{ dice: "1d6", type: "fire" }],
      casting_options: null,
    };
    expect(checkSpellMechanics(searing).approved).toBe(false);
  });
});

describe("checkSpellMechanics: third-party plain wording", () => {
  const glacialCascade: SpellMechanicsInput = {
    ...noRoll,
    name: "Glacial Cascade",
    level: 8,
    description: "By harnessing the power of ice and frost, you emanate pure cold, filling a 30-foot-radius sphere. Creatures other than you in the sphere take 10d8 cold damage, or half as much damage with a successful Constitution saving throw. A creature killed by this spell is transformed into ice, leaving behind no trace of its original body.",
    higher_levels: null,
    attack_type: "save",
    save_attribute: "CON",
    save_effect: "half",
    damage_rolls: [{ dice: "10d8", type: "cold" }],
    effects: [
      effect({ outcome: "failed_save", dice: "10d8", damageType: "cold" }),
      effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "10d8", damageType: "cold" }),
    ],
  };
  const cloyingDarkness: SpellMechanicsInput = {
    ...noRoll,
    name: "Cloying Darkness",
    level: 1,
    description: "You reach out with a hand of decaying shadows. Make a ranged spell attack. If it hits, the target takes 2d8 necrotic damage and must make a Constitution saving throw. If it fails, its visual organs are enveloped in shadow until the start of your next turn.",
    higher_levels: "When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d8 for each slot level above 1st.",
    attack_type: "ranged_spell",
    damage_rolls: [{ dice: "2d8", type: "necrotic" }],
    higher_level_damage: { dice_per_level: "1d8", type: null },
    effects: [effect({ dice: "2d8", damageType: "necrotic", scaling: { mode: "slot", dice: "1d8" } })],
  };

  it("approves a save for half and an 'If it hits' attack read from their own sentences", () => {
    expect(checkSpellMechanics(glacialCascade)).toEqual({ approved: true, basis: "automation" });
    expect(checkSpellMechanics(cloyingDarkness)).toEqual({ approved: true, basis: "automation" });
  });

  // Bug: a row saved under one ability while its damage sentence names another rolled the wrong save.
  it("rejects a save ability that differs from the one the damage sentence names", () => {
    expect(findingCodes({ ...glacialCascade, save_attribute: "DEX" })).toContain("save_ability_mismatch");
  });

  // Bug: a different roll stored for the same sentence.
  it("rejects a stored roll that is not the sentence's roll", () => {
    expect(findingCodes({ ...glacialCascade, damage_rolls: [{ dice: "8d8", type: "cold" }] })).toContain("main_sentence_not_found");
  });

  // Ectoplasm (Deep Magic): damage at the end of a creature's turn, not once at cast.
  it("rejects a turn-end damage spell even with a matching stored roll", () => {
    const ectoplasm: SpellMechanicsInput = {
      ...glacialCascade,
      name: "Ectoplasm",
      level: 2,
      description: "Any creature that ends its turn within 5 feet of the manifestation takes 2d6 psychic damage, or half the damage with a successful Wisdom saving throw. If it enters a creature's space, that creature takes 2d6 psychic damage, or half the damage with a successful Wisdom saving throw.",
      save_attribute: "WIS",
      damage_rolls: [{ dice: "2d6", type: "psychic" }],
      effects: [
        effect({ outcome: "failed_save", dice: "2d6", damageType: "psychic" }),
        effect({ id: "base-save-half", outcome: "successful_save", multiplier: 0.5, dice: "2d6", damageType: "psychic" }),
      ],
    };
    expect(findingCodes(ectoplasm)).toContain("main_sentence_not_found");
  });

  // Bloodshot (Deep Magic): the caster's own 1d6 and two further damage types.
  it("rejects Bloodshot", () => {
    const bloodshot: SpellMechanicsInput = {
      ...cloyingDarkness,
      name: "Bloodshot",
      description: "You launch a jet of boiling blood from your eyes at a creature within range. You take 1d6 necrotic damage and make a ranged spell attack against the target. If the attack hits, the target takes 2d10 fire damage plus 2d8 psychic damage.",
      higher_levels: null,
      higher_level_damage: null,
      damage_rolls: [{ dice: "2d10", type: "fire" }],
      effects: [effect({ dice: "2d10", damageType: "fire" })],
    };
    expect(findingCodes(bloodshot)).toContain("main_sentence_not_found");
  });

  // Boiling Blood (Deep Magic): 2d6 on a success, 4d6 on a failure.
  it("rejects Boiling Blood", () => {
    const boiling: SpellMechanicsInput = {
      ...glacialCascade,
      name: "Boiling Blood",
      level: 3,
      description: "The target must make a Constitution saving throw. On a successful save, it takes 2d6 fire damage and the spell ends. On a failed save, the creature takes 4d6 fire damage and is blinded.",
      save_effect: "special",
      damage_rolls: [{ dice: "4d6", type: "fire" }],
      effects: [effect({ outcome: "failed_save", dice: "4d6", damageType: "fire" })],
    };
    expect(findingCodes(boiling)).toContain("main_sentence_not_found");
  });
});
