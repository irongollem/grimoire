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

  // PHB 2014 / 2024 PHB "Critical Hits": roll all of the attack's damage dice twice; the modifier is added once
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

  it("a negative ability modifier is subtracted and shown with its sign", () => {
    const r = assembleDamage({ base: "1d6", modifier: -1, riders: [], critical: false });
    expect(r.modifier).toBe(-1);
    expect(r.parts).toEqual(["1d6", "-1"]);
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
});

describe("unarmedDamageBase", () => {
  // PHB 2014 and 2024 "Unarmed Strike": 1 + Strength modifier, with no floor of 1; "Martial Arts": the die plus Strength or Dexterity
  it("is 1 plus Strength with no dice: Strength 8 deals 0, and a lower one never heals", () => {
    expect(unarmedDamageBase({ strMod: 3, dexMod: 0, martialArtsDie: null })).toEqual({ base: "0", modifier: 4 });
    expect(unarmedDamageBase({ strMod: -1, dexMod: 0, martialArtsDie: null })).toEqual({ base: "0", modifier: 0 });
    expect(unarmedDamageBase({ strMod: -2, dexMod: 0, martialArtsDie: null })).toEqual({ base: "0", modifier: 0 });
  });

  it("uses the Martial Arts die with the better of Strength and Dexterity, however the die is written", () => {
    expect(unarmedDamageBase({ strMod: 0, dexMod: 3, martialArtsDie: "d6" })).toEqual({ base: "1d6", modifier: 3 });
    expect(unarmedDamageBase({ strMod: 2, dexMod: 1, martialArtsDie: "1d8" })).toEqual({ base: "1d8", modifier: 2 });
  });
});
