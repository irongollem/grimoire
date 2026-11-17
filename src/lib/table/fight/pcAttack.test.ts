import { describe, expect, it } from "vitest";
import type { PcAttackRow } from "@/composables/encounters/usePcAttackRows";
import { attackEntryOf, attackLines, d20FromFaces, damageDicePlan, damageFromFaces, damageLine, damageMathText, facesFit } from "./pcAttack";

function row(extra: Partial<PcAttackRow> & Record<string, unknown> = {}): PcAttackRow {
  return {
    key: "melee:1", name: "Longsword", kind: "melee", attackBonus: 5, damageDice: "1d8+3", damageFixed: null, modifier: 3,
    damageType: "slashing", baseDice: "1d8", shape: null, description: "", ammoTag: null, weaponInvId: "inv",
    ...extra,
  } as PcAttackRow;
}

describe("attackEntryOf", () => {
  it("makes a melee row a melee attack and a ranged or thrown row a ranged one", () => {
    // Bug caught: a bow rolled as melee, so a foe next to the archer never imposed disadvantage and 5 ft reach was assumed.
    expect(attackEntryOf(row())?.structured.attack?.delivery).toBe("melee");
    expect(attackEntryOf(row({ kind: "ranged" }))?.structured.attack?.delivery).toBe("ranged");
    expect(attackEntryOf(row({ kind: "thrown" }))?.structured.attack?.delivery).toBe("ranged");
  });

  it("keeps the row's bonus and its damage with the modifier already in the dice", () => {
    // Bug caught: the modifier added a second time on top of "1d8+3" (damage 3 too high).
    const attack = attackEntryOf(row())?.structured.attack;
    expect(attack?.bonus).toBe(5);
    expect(attack?.hit).toEqual([{ dice: "1d8+3", type: "slashing" }]);
  });

  it("has nothing to roll for a custom attack with no bonus, or for a row with no damage", () => {
    // Bug caught: an auto-hit or save-based custom attack offered a to-hit roll with a made-up bonus.
    expect(attackEntryOf(row({ kind: "custom", attackBonus: null, customDamage: "1d6", customDamageType: null }))).toBeNull();
    expect(attackEntryOf(row({ damageDice: null, damageFixed: null }))).toBeNull();
  });

  it("reads a custom attack's typed damage and an unarmed strike's flat damage", () => {
    // Bug caught: unarmed damage "3 bludgeoning" fed to the dice parser whole, or a typed "damage" placeholder treated as a type.
    expect(attackEntryOf(row({ kind: "custom", customDamage: "2d6 + 1", customDamageType: "fire" }))?.structured.attack?.hit).toEqual([
      { dice: "2d6+1", type: "fire" },
    ]);
    expect(attackEntryOf(row({ damageDice: null, damageFixed: "3 bludgeoning", damageType: "bludgeoning" }))?.structured.attack?.hit).toEqual([
      { dice: "3", type: "bludgeoning" },
    ]);
    expect(attackEntryOf(row({ damageType: "damage" }))?.structured.attack?.hit[0].type).toBeNull();
  });
});

describe("damageDicePlan", () => {
  it("doubles the dice of a critical hit but not the flat modifier", () => {
    // SRD 5.1 "Critical Hits": roll all of the attack's damage dice twice. Bug caught: a critical that doubled the +3, or none at all.
    const entry = attackEntryOf(row({ damageDice: "2d6+3" }));
    if (!entry) throw new Error("entry");
    expect(damageDicePlan(entry, false)).toEqual([6, 6]);
    expect(damageDicePlan(entry, true)).toEqual([6, 6, 6, 6]);
  });

  it("asks for no dice for a flat damage", () => {
    // Bug caught: an unarmed strike asking the player to roll a die it does not have.
    const entry = attackEntryOf(row({ damageDice: null, damageFixed: "4 bludgeoning" }));
    if (!entry) throw new Error("entry");
    expect(damageDicePlan(entry, false)).toEqual([]);
  });
});

describe("facesFit", () => {
  it("accepts one whole face per die within its size and nothing else", () => {
    // Bug caught: a typed 9 on a d8, a missing die, or a 3.5 accepted as a roll.
    expect(facesFit([8, 1], [8, 6])).toBe(true);
    expect(facesFit([9], [8])).toBe(false);
    expect(facesFit([4], [8, 8])).toBe(false);
    expect(facesFit([0], [8])).toBe(false);
    expect(facesFit([3.5], [8])).toBe(false);
  });
});

describe("rolls made from supplied faces", () => {
  it("keeps the higher face with advantage and the lower with disadvantage", () => {
    // PHB 2014 "Advantage and Disadvantage": take the higher (or lower) of the two d20s. Bug caught: the first face kept regardless.
    expect(d20FromFaces([3, 15], "advantage", 5, "x").breakdown.find((d) => !d.dropped)?.val).toBe(15);
    expect(d20FromFaces([3, 15], "disadvantage", 5, "x").breakdown.find((d) => !d.dropped)?.val).toBe(3);
  });

  it("scores one typed face as the kept die, whatever the mode", () => {
    // Bug caught: a physical roll typed as the one face kept (advantage) throwing because there is no second die.
    const roll = d20FromFaces([14], "advantage", 5, "x");
    expect(roll.total).toBe(19);
    expect(roll.breakdown).toEqual([{ val: 14, dropped: false }]);
  });

  it("refuses a face that is not on a d20", () => {
    // Bug caught: a typed 21 or 0 counted as a roll.
    expect(() => d20FromFaces([21], "normal", 0, "x")).toThrow();
    expect(() => d20FromFaces([0], "normal", 0, "x")).toThrow();
  });

  it("adds the modifier once to the damage faces", () => {
    // 4 + 5 + 3 = 12. Bug caught: the modifier dropped or added per die.
    expect(damageFromFaces([4, 5], 3, "x").total).toBe(12);
  });
});

describe("attackLines", () => {
  const base = { attackerName: "Mira", targetName: "Orc", weapon: "Longsword", natural: 14, bonus: 5, hit: true, critical: false, damage: null, atTable: false };

  it("names a hit, a critical hit and a miss, with the total as the die", () => {
    // Bug caught: a critical worded as a plain hit, or a miss worded as a hit.
    const [hit] = attackLines(base);
    expect(hit).toMatchObject({ kind: "roll", die: 19, label: "Longsword against Orc: a hit", detail: "d20 (14) + 5", critical: false });
    expect(attackLines({ ...base, critical: true })[0]).toMatchObject({ label: "Longsword against Orc: a critical hit", critical: true });
    expect(attackLines({ ...base, hit: false })[0]).toMatchObject({ label: "Longsword against Orc: a miss", critical: false });
  });

  it("writes a negative bonus with a minus and no bonus part for zero", () => {
    // Bug caught: "d20 (14) + -1" or "d20 (14) + 0".
    expect(attackLines({ ...base, bonus: -1 })[0]).toMatchObject({ die: 13, detail: "d20 (14) - 1" });
    expect(attackLines({ ...base, bonus: 0 })[0]).toMatchObject({ detail: "d20 (14)" });
  });

  it("marks a roll typed from real dice as rolled at the table", () => {
    // Bug caught: the physical-dice roll indistinguishable from a screen roll in the story.
    expect(attackLines({ ...base, atTable: true })[0]).toMatchObject({ detail: "d20 (14) + 5 · rolled at the table" });
    expect(attackLines(base)[0]).toMatchObject({ detail: "d20 (14) + 5" });
  });

  it("adds the damage line only for a hit, joining several types", () => {
    // Bug caught: damage reported for a miss, or only the first of two damage types.
    const damage = [{ amount: 6, type: "piercing" }, { amount: 2, type: "fire" }];
    expect(attackLines({ ...base, damage })[1]).toEqual({ kind: "margin", text: "Mira deals 6 piercing and 2 fire" });
    expect(attackLines({ ...base, hit: false, damage })).toHaveLength(1);
    expect(attackLines({ ...base, damage: [{ amount: 0, type: "fire" }] })[1]).toEqual({ kind: "margin", text: "Mira deals no damage" });
  });
});

describe("damageLine with the dice behind it", () => {
  // Bug caught: a damage roll shown as a bare total, with no way to check it against the dice on the table.
  it("draws the damage as a roll with its dice and modifier", () => {
    const line = damageLine("Rosie", [{ amount: 9, type: "piercing" }], { dice: [{ sides: 8, face: 5 }], modifier: 4, atTable: false });
    expect(line).toEqual({ kind: "roll", die: 9, label: "Rosie deals 9 piercing", detail: "1d8 (5) + 4", critical: false });
  });

  // SRD 5.1 "Critical Hits": the attack's damage dice are rolled twice; the modifier is added once.
  it("groups a critical hit's doubled dice and says when they were rolled at the table", () => {
    expect(damageMathText({ dice: [{ sides: 8, face: 3 }, { sides: 8, face: 8 }], modifier: 4, atTable: true })).toBe("2d8 (3, 8) + 4 · rolled at the table");
  });

  it("writes a negative modifier as a subtraction and leaves a zero one out", () => {
    expect(damageMathText({ dice: [{ sides: 4, face: 2 }], modifier: -1, atTable: false })).toBe("1d4 (2) - 1");
    expect(damageMathText({ dice: [{ sides: 6, face: 6 }], modifier: 0, atTable: false })).toBe("1d6 (6)");
  });

  // An unarmed strike has no dice: SRD 5.1 "Melee Attacks", 1 + Strength modifier bludgeoning.
  it("shows a flat damage as its number", () => {
    expect(damageMathText({ dice: [], modifier: 2, atTable: false })).toBe("2");
  });
});

