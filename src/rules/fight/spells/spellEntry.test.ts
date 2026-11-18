import { describe, expect, it } from "vitest";
import { spellEntryFor } from "./spellEntry.ts";
import { fireBolt, fireball, holdPerson, holdPersonEffect } from "./spellTestKit.ts";

const MAGE = { saveDc: 14, attackBonus: 6, casterLevel: 9 };

describe("spellEntryFor: save spells", () => {
  // SRD 5.1 "Fireball": 8d6 fire, Dexterity save for half, at the caster's DC.
  it("fails if Fireball at 3rd level is not 8d6 fire with a DEX save at DC 14 for half", () => {
    const made = spellEntryFor(fireball(), 3, MAGE);
    expect(made).toMatchObject({ automatable: true, kind: "save" });
    if (!made.automatable) return;
    expect(made.entry.structured.save).toEqual({ ability: "dex", dc: 14, fail: [{ dice: "8d6", type: "fire" }], success: "half", conditions: [] });
  });

  // SRD 5.1 "Fireball": "+1d6 for each slot level above 3rd": a 5th-level slot is 10d6.
  it("fails if Fireball in a 5th-level slot does not roll 10d6", () => {
    const made = spellEntryFor(fireball(), 5, MAGE);
    expect(made.automatable && made.entry.structured.save?.fail).toEqual([{ dice: "10d6", type: "fire" }]);
  });

  // A "negates" save takes nothing on a success (SRD 5.1 save-or-nothing spells).
  it("fails if a save that negates is rolled for half", () => {
    const made = spellEntryFor(fireball({ save_effect: "negates", effects: [fireball().effects![0]] }), 3, MAGE);
    expect(made.automatable && made.entry.structured.save?.success).toBe("none");
  });

  it("fails if the record's flat columns, with no structured effect, are not used and grown by the slot", () => {
    const made = spellEntryFor(fireball({ effects: [] }), 4, MAGE);
    expect(made.automatable && made.entry.structured.save?.fail).toEqual([{ dice: "9d6", type: "fire" }]);
  });
});

describe("spellEntryFor: attack spells", () => {
  // SRD 5.1 "Fire Bolt": ranged spell attack, 1d10 fire; 2d10 at 5th level. The mage is 9th level, so 2d10, at +6.
  it("fails if a ranged spell attack does not use the caster's attack bonus and its level's cantrip dice", () => {
    const made = spellEntryFor(fireBolt(), 0, MAGE);
    expect(made).toMatchObject({ automatable: true, kind: "attack" });
    if (!made.automatable) return;
    expect(made.entry.structured.attack).toEqual({ delivery: "ranged", bonus: 6, hit: [{ dice: "2d10", type: "fire" }] });
  });

  // Without a known caster level the cantrip rolls its base dice rather than a guessed step.
  it("fails if an unknown caster level steps a cantrip up", () => {
    const made = spellEntryFor(fireBolt(), 0, { saveDc: null, attackBonus: 6 });
    expect(made.automatable && made.entry.structured.attack?.hit).toEqual([{ dice: "1d10", type: "fire" }]);
  });
});

describe("spellEntryFor: what is not automatable", () => {
  const why = (r: ReturnType<typeof spellEntryFor>) => (r.automatable ? "automatable" : r.why);

  it("fails if a cast level below the spell's own is rolled", () => {
    expect(why(spellEntryFor(fireball(), 2, MAGE))).toMatch(/level 3 spell and cannot be cast with a level 2 slot/);
  });

  it("fails if a spell with no damage in its data is rolled", () => {
    expect(why(spellEntryFor(fireball({ damage_rolls: null, effects: [] }), 3, MAGE))).toMatch(/no damage in its data/);
  });

  // SRD 5.1 "Hold Person": WIS save, paralysis, no damage. Stored with a special save effect and no damage.
  it("fails if a special save effect is rolled", () => {
    expect(why(spellEntryFor(fireball({ save_effect: "special" }), 3, MAGE))).toMatch(/something special/);
  });

  it("fails if an attack spell is rolled for a caster with no attack bonus", () => {
    expect(why(spellEntryFor(fireBolt(), 0, { saveDc: 14, attackBonus: null }))).toMatch(/no spell attack bonus/);
  });

  it("fails if a save spell is rolled for a caster with no save DC", () => {
    expect(why(spellEntryFor(fireball(), 3, { saveDc: null, attackBonus: 6 }))).toMatch(/no spell save DC/);
  });

  // SRD 5.1 "Magic Missile": no roll to hit and no save, three darts that always hit.
  it("fails if an automatic spell is rolled", () => {
    expect(why(spellEntryFor(fireball({ attack_type: "automatic" }), 3, MAGE))).toMatch(/neither an attack roll nor a save/);
  });

  it("fails if a spell with no attack or save in its data is rolled", () => {
    expect(why(spellEntryFor(fireball({ attack_type: "none" }), 3, MAGE))).toMatch(/no attack roll or saving throw/);
  });

  // SRD 5.1 "Cure Wounds": healing, never rolled as damage.
  it("fails if a healing spell is called damage-less instead of healing", () => {
    expect(why(spellEntryFor(fireball({ healing_dice: "1d8", damage_rolls: null, effects: [] }), 3, MAGE))).toMatch(/heals/);
  });

  // SRD 5.1 "Scorching Ray": three rays, each its own attack.
  it("fails if a spell of several rays is rolled as one", () => {
    const rays = fireBolt({ effects: [{ ...fireball().effects![0], outcome: "hit", instances: { noun: "ray", count: 3 } }] });
    expect(why(spellEntryFor(rays, 2, MAGE))).toMatch(/several rays/);
  });

  it("fails if damage that adds the caster's modifier is rolled without it", () => {
    const mod = fireball({ effects: [{ ...fireball().effects![0], modifier: "spellcasting_ability" }] });
    expect(why(spellEntryFor(mod, 3, MAGE))).toMatch(/spellcasting modifier/);
  });
});

describe("spellEntryFor: conditions from condition_effect", () => {
  const saveOf = (r: ReturnType<typeof spellEntryFor>) => (r.automatable ? r.entry.structured.save : undefined);
  const why = (r: ReturnType<typeof spellEntryFor>) => (r.automatable ? "automatable" : r.why);

  // SRD 5.1 "Hold Person": Wisdom save or paralyzed for up to 1 minute; repeat at the end of each of its turns.
  // The save is the spell's own, so the repeat takes the caster's DC when applied (left out here on purpose), and the minute caps it at 10 rounds.
  it("fails if Hold Person is not a no-damage WIS save imposing Paralyzed, repeated at the end of the bearer's turn, capped at 10 rounds", () => {
    const made = spellEntryFor(holdPerson(), 2, MAGE);
    expect(saveOf(made)).toEqual({
      ability: "wis", dc: 14, fail: [], success: "none",
      conditions: [{ name: "Paralyzed", ends: { kind: "save", at: "end", ability: "wis", remaining: 10 } }],
    });
  });

  // Bug caught: a record nobody has read for conditions resolved as if it said something.
  it("fails if the same record with no condition_effect is no longer refused for having no damage", () => {
    expect(why(spellEntryFor(holdPerson({ condition_effect: null }), 2, MAGE))).toMatch(/something special|no damage/);
    expect(why(spellEntryFor(holdPerson({ condition_effect: undefined, save_effect: "negates" }), 2, MAGE))).toMatch(/no damage in its data/);
  });

  // Bug caught: a spell the readings call not_simple or no_condition gaining a condition anyway.
  it("fails if a not_simple or no_condition verdict adds a condition", () => {
    for (const verdict of ["not_simple", "no_condition"] as const) {
      expect(why(spellEntryFor(holdPerson({ condition_effect: holdPersonEffect({ verdict }) }), 2, MAGE))).not.toBe("automatable");
    }
    const fire = spellEntryFor(fireball({ condition_effect: holdPersonEffect({ verdict: "not_simple", save_ability: "DEX" }) }), 3, MAGE);
    expect(saveOf(fire)?.conditions).toEqual([]);
  });

  // Bug caught: guessing which of two disagreeing sources for the save's ability is right.
  it("fails if a save ability that contradicts the record's column still adds the condition", () => {
    const made = spellEntryFor(fireball({ condition_effect: holdPersonEffect({ save_ability: "WIS" }) }), 3, MAGE);
    expect(saveOf(made)?.conditions).toEqual([]);
    expect(saveOf(made)?.fail).toEqual([{ dice: "8d6", type: "fire" }]);
  });

  // Bug caught: the condition replacing the damage, or the damage replacing the condition. Fireball's DEX column and a DEX reading agree.
  it("fails if a damage spell with a condition loses its damage or its condition", () => {
    const made = spellEntryFor(fireball({ condition_effect: holdPersonEffect({ save_ability: "DEX", conditions: ["Prone"], repeat_save: null, duration: { unit: "instant", amount: null, concentration: false } }) }), 3, MAGE);
    expect(saveOf(made)).toEqual({ ability: "dex", dc: 14, fail: [{ dice: "8d6", type: "fire" }], success: "half", conditions: [{ name: "Prone" }] });
  });

  // Bug caught: a "special" save effect on a spell that does damage no longer refusing once it has a condition.
  it("fails if a damage spell with a special save effect is rolled because it has a condition", () => {
    expect(why(spellEntryFor(fireball({ save_effect: "special", condition_effect: holdPersonEffect({ save_ability: "DEX" }) }), 3, MAGE))).toMatch(/something special/);
  });

  // The duration alone, with nothing repeated: ten rounds a minute (SRD 5.1 "Duration": a round is 6 seconds), rounds as written, nothing for an hour.
  it("fails if a duration is not turned into rounds, or an hour is given an end", () => {
    const ends = (effect: Partial<ReturnType<typeof holdPersonEffect>>) =>
      saveOf(spellEntryFor(holdPerson({ condition_effect: holdPersonEffect({ repeat_save: null, ...effect }) }), 2, MAGE))?.conditions[0];
    expect(ends({ duration: { unit: "round", amount: 10, concentration: true } })).toEqual({ name: "Paralyzed", ends: { kind: "rounds", remaining: 10 } });
    expect(ends({ duration: { unit: "minute", amount: 1, concentration: true } })).toEqual({ name: "Paralyzed", ends: { kind: "rounds", remaining: 10 } });
    expect(ends({ duration: { unit: "minute", amount: 3, concentration: true } })).toEqual({ name: "Paralyzed", ends: { kind: "rounds", remaining: 30 } });
    expect(ends({ duration: { unit: "hour", amount: 1, concentration: false } })).toEqual({ name: "Paralyzed" });
    expect(ends({ duration: { unit: "until_dispelled", amount: null, concentration: false } })).toEqual({ name: "Paralyzed" });
  });

  it("fails if a repeat save at the start of the bearer's turn is made at the end", () => {
    const made = saveOf(spellEntryFor(holdPerson({ condition_effect: holdPersonEffect({ repeat_save: { when: "start_of_its_turn", ability: "WIS" }, duration: { unit: "round", amount: 3, concentration: true } }) }), 2, MAGE));
    expect(made?.conditions).toEqual([{ name: "Paralyzed", ends: { kind: "save", at: "start", ability: "wis", remaining: 3 } }]);
  });

  // Bug caught: a repeat save "when it takes damage" or "as an action" (SaveEnds has neither) imposed with a different rule instead of left to the table.
  it("fails if a repeat save the type cannot state is turned into some other ending", () => {
    for (const when of ["when_damaged", "as_an_action"] as const) {
      expect(why(spellEntryFor(holdPerson({ condition_effect: holdPersonEffect({ repeat_save: { when, ability: "WIS" } }) }), 2, MAGE))).not.toBe("automatable");
    }
  });

  // Bug caught: a humanoid-only condition imposed on a creature of another kind. The fight cannot read a creature's kind, so it imposes nothing.
  it("fails if a spell limited to a creature kind is imposed on everyone", () => {
    expect(why(spellEntryFor(holdPerson({ condition_effect: holdPersonEffect({ only_kinds: ["humanoid"] }) }), 2, MAGE))).not.toBe("automatable");
  });

  // Bug caught: a self-targeted or non-save condition spell being cast at others.
  it("fails if a condition on the caster, or one that is not from a failed save, is imposed on a target", () => {
    const saveless = holdPersonEffect({ applies: "hit", save_ability: null });
    expect(why(spellEntryFor(holdPerson({ condition_effect: saveless }), 2, MAGE))).not.toBe("automatable");
    const self = holdPersonEffect({ targets: { kind: "self", count: 1, more_per_slot_above: 0 } });
    expect(why(spellEntryFor(holdPerson({ condition_effect: self }), 2, MAGE))).not.toBe("automatable");
  });

  it("fails if a condition-only spell is rolled for a caster with no save DC", () => {
    expect(why(spellEntryFor(holdPerson(), 2, { saveDc: null, attackBonus: 6 }))).toMatch(/no spell save DC/);
  });
});
