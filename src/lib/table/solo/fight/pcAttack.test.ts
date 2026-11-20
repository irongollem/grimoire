import { describe, expect, it } from "vitest";
import { attackLines, damageLine, damageMathText } from "./pcAttack";

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

