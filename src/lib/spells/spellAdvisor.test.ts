import { describe, expect, it } from "vitest";
import type { SpellConditionEffect } from "@/types/spell.types";
import { advisorInputsFromSpell, controlIntensityOf, type AdvisorSpellFields } from "./advisorInputsFromSpell";
import { adviseLevelRange, levelOnDamageTable, type AdvisorInputs } from "./spellAdvisor";

const base: AdvisorInputs = {
  effectType: "damage", effectIntensity: "moderate", damageDice: "", targetingMode: "single", saveType: "save_for_half",
  durationTier: "instantaneous", hasSecondaryEffect: false, requiresConcentration: false, isRitual: false,
};
const advise = (over: Partial<AdvisorInputs>) => adviseLevelRange({ ...base, ...over });
const holds = (level: number, over: Partial<AdvisorInputs>) => {
  const r = advise(over);
  return r.suggestedMin <= level && level <= r.suggestedMax;
};

describe("levelOnDamageTable", () => {
  // DMG 2014 "Creating a Spell", Spell Damage: 3rd level is 5d10 to one target and 6d6 to several; 2nd is 3d10.
  // Bug caught: the two columns swapped, or an average on a row read as the level above it.
  it("reads a row's own dice as that row's level, in the right column", () => {
    expect(levelOnDamageTable(27.5, "oneTarget")).toBe(3);
    expect(levelOnDamageTable(21, "manyTargets")).toBe(3);
    // Halfway from 3d10 (16.5) to 5d10 (27.5).
    expect(levelOnDamageTable(22, "oneTarget")).toBe(2.5);
  });

  // Bug caught: everything above the table read as a tidy 9, so a 60d6 spell is "9th level" and nothing warns.
  it("reads damage far above the 9th-level row as beyond any level", () => {
    expect(levelOnDamageTable(210, "manyTargets")).toBeGreaterThan(10);
    expect(advise({ damageDice: "60d6", targetingMode: "aoe_large" }).factors.join(" ")).toContain("stronger than a 9th-level spell");
  });
});

describe("adviseLevelRange with nothing to weigh", () => {
  // Bug caught (seen in the running editor): a damage spell with no dice yet shown as "Suggested: Level 0-1" with
  // an Apply button, which sets the spell to a cantrip on the strength of nothing.
  it("says it has no estimate for a damage or healing spell without dice, and has one for a judged effect", () => {
    expect(advise({ damageDice: "" }).estimated).toBe(false);
    expect(advise({ effectType: "healing", damageDice: "" }).estimated).toBe(false);
    expect(advise({ damageDice: "3d6" }).estimated).toBe(true);
    expect(advise({ effectType: "utility", effectIntensity: "weak" }).estimated).toBe(true);
  });
});

describe("adviseLevelRange, against published spells", () => {
  // SRD 5.1 levels: Fire Bolt 0, Burning Hands 1, Cone of Cold 5, Disintegrate 6.
  // Bug caught: the estimate drifting off the book for plain damage, the case a DM leans on most.
  it("holds the book's level for plain damage spells", () => {
    expect(holds(0, { damageDice: "1d10", saveType: "attack_roll" })).toBe(true);
    expect(holds(1, { damageDice: "3d6", targetingMode: "aoe_small" })).toBe(true);
    expect(holds(5, { damageDice: "8d8", targetingMode: "aoe_large" })).toBe(true);
    expect(holds(6, { damageDice: "10d6+40", saveType: "save_negates" })).toBe(true);
  });

  // DMG 2014 "Creating a Spell": a spell that deals no damage on a successful save may deal 25 percent more.
  // Bug caught: the rule applied the wrong way round, so all-or-nothing damage reads as a higher level.
  it("counts all-or-nothing damage for less than the same dice with half on a save", () => {
    const half = advise({ damageDice: "5d10" });
    const nothing = advise({ damageDice: "5d10", saveType: "save_negates" });
    expect(half.score).toBe(3);
    expect(nothing.score).toBe(2.5);
  });

  // SRD 5.1: Hold Person is 2nd level (a humanoid) and Hold Monster 5th (any creature), otherwise the same spell.
  // Bug caught: the limit to some kinds of creature not counted, so the two get one answer.
  it("holds Hold Person and Hold Monster, and puts the one limited to humanoids lower", () => {
    const hold: Partial<AdvisorInputs> = { effectType: "control", effectIntensity: "major", saveType: "save_negates", durationTier: "conc_1min", requiresConcentration: true, repeatSave: true };
    expect(holds(5, hold)).toBe(true);
    expect(holds(2, { ...hold, limitedKinds: true })).toBe(true);
    expect(advise({ ...hold, limitedKinds: true }).score).toBeLessThan(advise(hold).score);
  });

  // DMG 2014 "Creating a Spell": a cantrip should not offer healing.
  // Bug caught: a 1d4 heal suggested as a cantrip, healing without limit.
  it("never suggests healing as a cantrip", () => {
    expect(advise({ effectType: "healing", damageDice: "1d4", saveType: "automatic" }).score).toBeGreaterThanOrEqual(1);
  });
});

const spell = (over: Partial<AdvisorSpellFields>): AdvisorSpellFields => ({
  damage_rolls: null, healing_dice: null, attack_type: null, save_effect: null, aoe_shape: null, aoe_size: null,
  duration: "Instantaneous", concentration: false, ritual: false, condition_effect: null, ...over,
});
const effect = (over: Partial<SpellConditionEffect>): SpellConditionEffect => ({
  verdict: "condition", conditions: [], stops_casting: null, speed_zero: false, applies: "failed_save", save_ability: "WIS",
  targets: { kind: "one", count: 1, more_per_slot_above: 0 }, only_kinds: [], duration: { unit: "minute", amount: 1, concentration: true }, repeat_save: null, ...over,
});

describe("advisorInputsFromSpell", () => {
  // Bug caught: the advisor asking again what the form already says, or reading Hold Person's entry as a plain
  // one-target effect and missing that it is humanoids only with a save every turn.
  it("reads Hold Person off its fields: major control, a save each turn, humanoids only", () => {
    const inputs = advisorInputsFromSpell(
      spell({ attack_type: "save", save_effect: "special", duration: "Concentration, up to 1 minute", concentration: true, condition_effect: effect({ conditions: ["Paralyzed"], only_kinds: ["humanoid"], repeat_save: { when: "end_of_its_turn", ability: "WIS" } }) }),
    );
    expect(inputs).toMatchObject({ effectType: "control", effectIntensity: "major", saveType: "save_negates", durationTier: "conc_1min", repeatSave: true, limitedKinds: true, targetingMode: "single" });
  });

  // Bug caught: a 20-foot radius (40 feet across) sized like a 20-foot cone, so Fireball reads as a small area.
  it("sizes a radius by how far across it reaches, and a cone by its length", () => {
    const fire = { damage_rolls: [{ dice: "8d6", type: "fire" }], attack_type: "save", save_effect: "half" };
    expect(advisorInputsFromSpell(spell({ ...fire, aoe_shape: "sphere", aoe_size: "20 feet" }))?.targetingMode).toBe("aoe_medium");
    expect(advisorInputsFromSpell(spell({ ...fire, aoe_shape: "sphere", aoe_size: "30 feet" }))?.targetingMode).toBe("aoe_large");
    expect(advisorInputsFromSpell(spell({ ...fire, aoe_shape: "cone", aoe_size: "15 feet" }))?.targetingMode).toBe("aoe_small");
  });

  // Bug caught: a spell with nothing to weigh (a buff, utility) answered with a made-up estimate from defaults.
  it("says nothing for a spell whose fields hold no damage, healing or harmful condition", () => {
    expect(advisorInputsFromSpell(spell({ duration: "1 Hour" }))).toBeNull();
    expect(advisorInputsFromSpell(spell({ condition_effect: effect({ conditions: ["Invisible"], applies: "automatic" }) }))).toBeNull();
  });
});

describe("controlIntensityOf", () => {
  // SRD 5.1 "Conditions": Paralyzed is Incapacitated (no turn); Restrained has disadvantage and speed 0; Prone
  // costs half its movement. Bug caught: every condition weighed alike, so knocking prone prices like paralysis.
  it("grades a condition by how much of a creature's turn it takes", () => {
    expect(controlIntensityOf(effect({ conditions: ["Paralyzed"] }))).toBe("major");
    expect(controlIntensityOf(effect({ conditions: ["Restrained"] }))).toBe("moderate");
    expect(controlIntensityOf(effect({ conditions: ["Prone"] }))).toBe("weak");
    expect(controlIntensityOf(effect({ conditions: ["Prone", "Stunned"] }))).toBe("major");
  });
});
