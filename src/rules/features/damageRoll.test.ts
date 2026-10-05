import { describe, expect, it } from "vitest";
import { assembleDamage, unarmedDamageBase } from "./damageRoll";
import { rollDice } from "@/lib/dice/dice";

describe("assembleDamage", () => {
  it("rolls the weapon alone with its modifier", () => {
    const r = assembleDamage({ base: "1d8", modifier: 3, riders: [], critical: false });
    expect(r.counts).toEqual({ 8: 1 });
    expect(r.modifier).toBe(3);
    expect(r.parts).toEqual(["1d8", "+3"]);
  });

  it("adds a Sneak Attack to a rapier hit", () => {
    const r = assembleDamage({ base: "1d8", modifier: 3, riders: [{ dice: "3d6" }], critical: false });
    expect(r.counts).toEqual({ 8: 1, 6: 3 });
    expect(r.modifier).toBe(3);
  });

  it("doubles the weapon die and the Sneak Attack dice on a critical hit, not the modifier", () => {
    const r = assembleDamage({ base: "1d8", modifier: 3, riders: [{ dice: "3d6" }], critical: true });
    expect(r.counts).toEqual({ 8: 2, 6: 6 });
    expect(r.modifier).toBe(3);
    expect(r.parts).toEqual(["2d8", "6d6", "+3"]);
  });

  it("adds a flat rider such as Rage to the modifier, once, even on a critical hit", () => {
    const r = assembleDamage({ base: "1d12", modifier: 4, riders: [{ dice: "+2" }], critical: true });
    expect(r.counts).toEqual({ 12: 2 });
    expect(r.modifier).toBe(6);
  });

  it("keeps a modifier written inside the base expression", () => {
    const r = assembleDamage({ base: "1d6+1", modifier: 2, riders: [], critical: false });
    expect(r.modifier).toBe(3);
  });

  it("merges the same die from the weapon and a rider", () => {
    const r = assembleDamage({ base: "1d8", modifier: 0, riders: [{ dice: "2d8" }], critical: false });
    expect(r.counts).toEqual({ 8: 3 });
    expect(r.parts).toEqual(["3d8"]);
  });

  it("refuses an expression it cannot read", () => {
    expect(() => assembleDamage({ base: "sword", modifier: 0, riders: [], critical: false })).toThrow();
  });

  it("assembles a flat, dice-less roll as a modifier only, and rolling it throws no dice", () => {
    const r = assembleDamage({ base: "0", modifier: 3, riders: [], critical: false });
    expect(r.counts).toEqual({});
    expect(r.modifier).toBe(3);
    expect(r.parts).toEqual(["+3"]);
    expect(rollDice({}, 3, "normal").total).toBe(3);
  });

  it("adds Rage to a dice-less unarmed strike", () => {
    const r = assembleDamage({ base: "0", modifier: 4, riders: [{ dice: "+2" }], critical: true });
    expect(r.counts).toEqual({});
    expect(r.modifier).toBe(6);
  });
});

describe("unarmedDamageBase", () => {
  it("is 1 plus Strength with no dice, at least 1", () => {
    expect(unarmedDamageBase({ strMod: 3, dexMod: 0, martialArtsDie: null })).toEqual({ base: "0", modifier: 4 });
    expect(unarmedDamageBase({ strMod: -2, dexMod: 0, martialArtsDie: null })).toEqual({ base: "0", modifier: 1 });
  });

  it("uses the Martial Arts die with the better of Strength and Dexterity, however the die is written", () => {
    expect(unarmedDamageBase({ strMod: 0, dexMod: 3, martialArtsDie: "d6" })).toEqual({ base: "1d6", modifier: 3 });
    expect(unarmedDamageBase({ strMod: 2, dexMod: 1, martialArtsDie: "1d8" })).toEqual({ base: "1d8", modifier: 2 });
  });
});
