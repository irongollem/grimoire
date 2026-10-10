import { describe, expect, it } from "vitest";
import type { ActionStructure } from "../../types/statBlock.types.ts";
import { checkActionAgainstProse } from "./checkAction.ts";

const bite = {
  name: "Bite",
  description: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.",
};
const attack = (patch: Partial<NonNullable<ActionStructure["attack"]>> = {}): ActionStructure => ({
  kind: "attack",
  attack: { delivery: "melee", bonus: 4, reach: 5, hit: [{ dice: "1d6+2", type: "piercing" }], ...patch },
  source: "parsed",
});

describe("checkActionAgainstProse", () => {
  it("accepts a structure the prose backs", () => {
    expect(checkActionAgainstProse(bite, attack(), [])).toEqual({ ok: true });
  });

  it("rejects a bonus, dice or type the prose does not contain", () => {
    expect(checkActionAgainstProse(bite, attack({ bonus: 5 }), []).ok).toBe(false);
    expect(checkActionAgainstProse(bite, attack({ hit: [{ dice: "1d6+3", type: "piercing" }] }), []).ok).toBe(false);
    expect(checkActionAgainstProse(bite, attack({ hit: [{ dice: "1d6", type: "piercing" }] }), []).ok).toBe(false);
    expect(checkActionAgainstProse(bite, attack({ hit: [{ dice: "1d6+2", type: "thunder" }] }), []).ok).toBe(false);
  });

  it("rejects the wrong delivery", () => {
    expect(checkActionAgainstProse(bite, attack({ delivery: "ranged" }), []).ok).toBe(false);
  });

  it("checks a signed negative bonus", () => {
    const e = { name: "Nip", description: "Melee Weapon Attack: −1 to hit, reach 5 ft. Hit: 1 piercing damage." };
    expect(checkActionAgainstProse(e, attack({ bonus: -1, hit: [{ dice: "1", type: "piercing" }] }), []).ok).toBe(true);
  });

  it("checks flat damage as a number followed by damage", () => {
    const e = { name: "Nip", description: "Melee Weapon Attack: +0 to hit. Hit: 1 piercing damage." };
    expect(checkActionAgainstProse(e, attack({ bonus: 0, hit: [{ dice: "1", type: "piercing" }] }), []).ok).toBe(true);
    expect(checkActionAgainstProse(e, attack({ bonus: 0, hit: [{ dice: "2", type: "piercing" }] }), []).ok).toBe(false);
  });

  const breath = {
    name: "Fire Breath (Recharge 5-6)",
    description: "Each creature must make a DC 17 Dexterity saving throw, taking 56 (16d6) fire damage, or be knocked prone.",
  };
  const save = (patch: Partial<NonNullable<ActionStructure["save"]>> = {}): ActionStructure => ({
    kind: "save",
    save: { ability: "dex", dc: 17, fail: [{ dice: "16d6", type: "fire" }], success: "none", conditions: [], ...patch },
    recharge: { min: 5, max: 6 },
    source: "parsed",
  });

  it("accepts a save the prose backs, and rejects a wrong DC, ability or condition", () => {
    expect(checkActionAgainstProse(breath, save(), []).ok).toBe(true);
    expect(checkActionAgainstProse(breath, save({ dc: 18 }), []).ok).toBe(false);
    expect(checkActionAgainstProse(breath, save({ ability: "con" }), []).ok).toBe(false);
    expect(checkActionAgainstProse(breath, save({ conditions: ["Poisoned"] }), []).ok).toBe(false);
    expect(checkActionAgainstProse(breath, save({ conditions: ["Prone"] }), []).ok).toBe(true);
  });

  it("checks recharge, uses and legendary cost against the name", () => {
    const plain: ActionStructure = { kind: "other", source: "parsed" };
    const e = { name: "Teleport (3/Day)", description: "It teleports." };
    expect(checkActionAgainstProse(e, { ...plain, uses: { count: 3, per: "day" } }, []).ok).toBe(true);
    expect(checkActionAgainstProse(e, { ...plain, uses: { count: 2, per: "day" } }, []).ok).toBe(false);
    expect(checkActionAgainstProse(e, { ...plain, recharge: { min: 5, max: 6 } }, []).ok).toBe(false);
    expect(checkActionAgainstProse(e, { ...plain, legendary_cost: 3 }, []).ok).toBe(false);
    expect(checkActionAgainstProse(e, { ...plain, legendary_cost: 1 }, []).ok).toBe(true);
    for (const name of ["Cast a Spell (2)", "Move (2 actions)", "Swallow (2 actions, Roc Form Only)", "Sweep (Costs 2 Actions)"]) {
      expect(checkActionAgainstProse({ name, description: "x" }, { ...plain, legendary_cost: 2 }, []).ok).toBe(true);
    }
    expect(checkActionAgainstProse({ name: "Cast a Spell (2)", description: "x" }, { ...plain, legendary_cost: 3 }, []).ok).toBe(false);
  });

  it("requires multiattack steps to name siblings", () => {
    const e = { name: "Multiattack", description: "Two Claw attacks." };
    const m = (action: string): ActionStructure => ({ kind: "multiattack", multiattack: [{ action, count: 2 }], source: "parsed" });
    expect(checkActionAgainstProse(e, m("Claw"), ["Multiattack", "Claw"]).ok).toBe(true);
    expect(checkActionAgainstProse(e, m("Claw"), ["Multiattack", "Bite"]).ok).toBe(false);
  });

  it("accepts an attack with an empty hit, and still checks its save", () => {
    const e = {
      name: "Spit",
      description: "Ranged Weapon Attack: +8 to hit, range 15/30 ft. Hit: The target must make a DC 15 Constitution saving throw, taking 45 (10d8) poison damage on a failed save.",
    };
    const s: ActionStructure = {
      kind: "attack",
      attack: { delivery: "ranged", bonus: 8, hit: [] },
      save: { ability: "con", dc: 15, fail: [{ dice: "10d8", type: "poison" }], success: "none", conditions: [] },
      source: "parsed",
    };
    expect(checkActionAgainstProse(e, s, []).ok).toBe(true);
    expect(checkActionAgainstProse(e, { ...s, save: { ...s.save!, dc: 16 } }, []).ok).toBe(false);
    expect(checkActionAgainstProse(e, { ...s, save: { ...s.save!, fail: [{ dice: "9d8", type: "poison" }] } }, []).ok).toBe(false);
  });

  it("checks kind consistency", () => {
    expect(checkActionAgainstProse(bite, { kind: "attack", source: "parsed" }, []).ok).toBe(false);
    expect(checkActionAgainstProse(bite, { kind: "save", source: "parsed" }, []).ok).toBe(false);
    expect(checkActionAgainstProse(bite, { kind: "multiattack", source: "parsed" }, []).ok).toBe(false);
    expect(checkActionAgainstProse(bite, { ...attack(), review: "x" }, []).ok).toBe(false);
  });

  it("always passes a bare other", () => {
    expect(checkActionAgainstProse({ name: "Trait", description: "Anything." }, { kind: "other", source: "parsed" }, []).ok).toBe(true);
    expect(
      checkActionAgainstProse({ name: "Trait", description: "Anything." }, { kind: "other", source: "parsed", review: "unparsed: x" }, []).ok,
    ).toBe(true);
  });

  describe("options", () => {
    const entry = {
      name: "Breath Weapons",
      description:
        "The dragon uses one of the following breath weapons.\n**Fire Breath.** Each creature must make a DC 21 Dexterity saving throw, taking 66 (12d10) fire damage on a failed save.\n**Sleep Breath.** Each creature must succeed on a DC 18 Constitution saving throw or fall unconscious.",
    };
    const options = (): ActionStructure => ({
      kind: "options",
      options: [
        { name: "Fire Breath", kind: "save", save: { ability: "dex", dc: 21, fail: [{ dice: "12d10", type: "fire" }], success: "none", conditions: [] } },
        { name: "Sleep Breath", kind: "save", save: { ability: "con", dc: 18, fail: [], success: "none", conditions: ["Unconscious"] } },
      ],
      source: "parsed",
    });

    it("accepts options the prose backs", () => {
      expect(checkActionAgainstProse(entry, options(), []).ok).toBe(true);
    });

    it("checks each option against its own stretch of prose", () => {
      const swapped = options();
      swapped.options![0].save!.dc = 18; // 18 is in the prose, but in the other option
      expect(checkActionAgainstProse(entry, swapped, []).ok).toBe(false);
    });

    it("rejects an option name that is not in the prose, fewer than two options, and a stray options list", () => {
      const renamed = options();
      renamed.options![1].name = "Frost Breath";
      expect(checkActionAgainstProse(entry, renamed, []).ok).toBe(false);
      expect(checkActionAgainstProse(entry, { ...options(), options: options().options!.slice(0, 1) }, []).ok).toBe(false);
      expect(checkActionAgainstProse(entry, { kind: "other", options: options().options, source: "parsed" }, []).ok).toBe(false);
      expect(checkActionAgainstProse(entry, { kind: "options", source: "parsed" }, []).ok).toBe(false);
    });
  });
});
