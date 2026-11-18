import { describe, expect, it } from "vitest";
import { spellEntryFor } from "./spellEntry.ts";
import { fireBolt, fireball } from "./spellTestKit.ts";

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
