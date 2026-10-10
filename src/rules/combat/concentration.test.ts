import { describe, expect, it } from "vitest";
import { concentrationBreaksOn, concentrationDc, resolveConcentration } from "./concentration.ts";

describe("concentrationDc", () => {
  it.each([
    [9, "2014", 10],
    [10, "2014", 10],
    [21, "2014", 10],
    [22, "2014", 11],
    [70, "2014", 35],
    [9, "2024", 10],
    [21, "2024", 10],
    [70, "2024", 30],
    [60, "2024", 30],
  ] as const)("%i damage under %s is DC %i", (dmg, rs, dc) => expect(concentrationDc(dmg, rs)).toBe(dc));
});

describe("resolveConcentration", () => {
  it("maintains on meeting the DC", () => {
    expect(resolveConcentration({ damage: 20, d20: 5, conSaveBonus: 5, ruleset: "2014" })).toEqual({ dc: 10, total: 10, maintained: true });
  });
  it("loses below the DC", () => {
    expect(resolveConcentration({ damage: 30, d20: 5, conSaveBonus: 5, ruleset: "2014" }).maintained).toBe(false);
  });
  it("penalty counts", () => {
    expect(resolveConcentration({ damage: 10, d20: 10, conSaveBonus: 2, ruleset: "2024", penalty: -4 }).maintained).toBe(false);
  });
});

describe("concentrationBreaksOn", () => {
  it.each([
    [["Incapacitated"], true],
    [["Unconscious"], true],
    [["Paralyzed"], true],
    [["Petrified"], true],
    [["Stunned"], true],
    [["Prone", "Poisoned"], false],
    [[], false],
  ])("%j", (c, e) => expect(concentrationBreaksOn(c)).toBe(e));
});
