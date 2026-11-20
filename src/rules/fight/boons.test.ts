import { describe, expect, it } from "vitest";
import type { AppliedCondition } from "../../types/condition.types.ts";
import { boonArmorClass, boonDice, boonDie, boonMean, deathSaveBoonBonus, rolledBoonTotal } from "./boons.ts";

const bless: AppliedCondition = { name: "Bless", grants: { attack: "1d4", save: "1d4" } };
const shield: AppliedCondition = { name: "Shield of Faith", grants: { ac: 2 } };
const bane: AppliedCondition = { name: "Bane", grants: { attack: "-1d4", save: "-1d4" } };

describe("boonDie", () => {
  // The dice parser drops a term's sign, so "-1d4" would read as a d4 added. Bug caught: Bane's d4 added to the roll instead of taken off.
  it("fails if a boon that takes away is read as one that adds", () => {
    expect(boonDie("Bane", "-1d4")).toMatchObject({ sign: -1, counts: { 4: 1 }, mean: -2.5 });
    expect(boonDie("Bless", "1d4")).toMatchObject({ sign: 1, counts: { 4: 1 }, mean: 2.5 });
  });

  // Bug caught: an expression that is not dice adds a NaN or a 0-sided die.
  it("fails if an expression that is not dice is read as a boon", () => {
    expect(boonDie("Odd", "lots")).toBeNull();
  });
});

describe("a creature's boons", () => {
  // PHB "Bless": a d4 on attack rolls and saving throws; "Shield of Faith": +2 AC. A Frightened creature (no grants) adds nothing.
  // Bug caught: the save's boon read for an attack, an AC boon read from a condition with none, or a plain condition counted.
  it("fails if a roll's boons are not exactly the ones that grant that roll", () => {
    const on: AppliedCondition[] = [{ name: "Frightened" }, bless, shield];
    expect(boonDice(on, "attack").map((d) => d.name)).toEqual(["Bless"]);
    expect(boonDice([shield], "save")).toEqual([]);
    // A boon on attack rolls only must add nothing to a save.
    expect(boonDice([{ name: "Keen", grants: { attack: "1d4" } }], "save")).toEqual([]);
    expect(boonArmorClass(on)).toBe(2);
    expect(boonArmorClass([bless])).toBe(0);
  });

  // Two different spells add (Bless and Bane cancel to 0 on average); the estimate is their means together.
  it("fails if two different boons are not added together in the estimate", () => {
    expect(boonMean([bless, bane], "attack")).toBe(0);
    expect(boonMean([bless], "save")).toBe(2.5);
  });
});

describe("rolledBoonTotal", () => {
  // Bless's d4 at a face of 3 adds 3; Bane's takes 3 off; a creature with no boon asks for no die. Bug caught: the sign lost, or a
  // die rolled for a boon of the other kind of roll.
  it("fails if the app's roll of a boon loses its sign or rolls for a creature with none", () => {
    const asked: number[] = [];
    const die = (sides: number) => { asked.push(sides); return 3; };
    expect(rolledBoonTotal([bless], "save", die)).toBe(3);
    expect(rolledBoonTotal([bane], "save", die)).toBe(-3);
    expect(rolledBoonTotal([shield], "save", die)).toBe(0);
    expect(asked).toEqual([4, 4]);
  });
});

describe("deathSaveBoonBonus", () => {
  // SRD "Death Saving Throws": a natural 1 or 20 decides alone, so no die is rolled then. Bug caught: a d4 rolled on a natural 20.
  it("fails if a boon is rolled on a natural 1 or 20, or not rolled otherwise", () => {
    const asked: number[] = [];
    const die = (sides: number) => { asked.push(sides); return 2; };
    expect(deathSaveBoonBonus(20, [bless], die)).toBe(0);
    expect(deathSaveBoonBonus(1, [bless], die)).toBe(0);
    expect(deathSaveBoonBonus(8, [bless], die)).toBe(2);
    expect(asked).toEqual([4]);
  });
});
