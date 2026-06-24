import { describe, it, expect } from "vitest";
import {
  parseDamageGroups,
  normalizeQualifier,
  damageTypesFromRolls,
} from "./damageIcons";

describe("normalizeQualifier", () => {
  it("collapses the spellings of nonmagical to one token", () => {
    expect(normalizeQualifier("from nonmagical attacks")).toBe("nonmagical");
    expect(normalizeQualifier("from non magical attacks")).toBe("nonmagical");
    expect(normalizeQualifier("that is nonmagical")).toBe("nonmagical");
  });

  it("captures the silvered / adamantine exceptions compactly", () => {
    expect(
      normalizeQualifier("from nonmagical attacks not made with silvered weapons"),
    ).toBe("nonmagical (non-silvered)");
    expect(normalizeQualifier("nonmagical that aren't adamantine")).toBe(
      "nonmagical (non-adamantine)",
    );
  });

  it("lightly cleans but keeps an unknown qualifier", () => {
    expect(normalizeQualifier("while in sunlight")).toBe("while in sunlight");
  });
});

describe("parseDamageGroups", () => {
  it("returns [] for nullish / empty / junk", () => {
    expect(parseDamageGroups(null)).toEqual([]);
    expect(parseDamageGroups("")).toEqual([]);
    expect(parseDamageGroups("[]")).toEqual([]);
  });

  it("groups a simple unconditional list", () => {
    expect(parseDamageGroups("cold, poison")).toEqual([
      { types: ["cold", "poison"], qualifier: "" },
    ]);
  });

  it("splits an unconditional list from a qualified one on the semicolon", () => {
    expect(
      parseDamageGroups("cold; bludgeoning, piercing, and slashing from nonmagical attacks"),
    ).toEqual([
      { types: ["cold"], qualifier: "" },
      { types: ["bludgeoning", "piercing", "slashing"], qualifier: "nonmagical" },
    ]);
  });

  it("splits a mixed group even without a semicolon (nonmagical → physical only)", () => {
    expect(
      parseDamageGroups("fire, bludgeoning, piercing and slashing from non magical attacks"),
    ).toEqual([
      { types: ["fire"], qualifier: "" },
      { types: ["bludgeoning", "piercing", "slashing"], qualifier: "nonmagical" },
    ]);
  });

  it("keeps a pure-physical qualified group as one group", () => {
    expect(
      parseDamageGroups(
        "bludgeoning, piercing, and slashing from nonmagical attacks not made with silvered weapons",
      ),
    ).toEqual([
      {
        types: ["bludgeoning", "piercing", "slashing"],
        qualifier: "nonmagical (non-silvered)",
      },
    ]);
  });

  it("does not split physical types when there is no qualifier", () => {
    expect(parseDamageGroups("bludgeoning, piercing, slashing")).toEqual([
      { types: ["bludgeoning", "piercing", "slashing"], qualifier: "" },
    ]);
  });
});

describe("damageTypesFromRolls", () => {
  it("returns [] for null/empty", () => {
    expect(damageTypesFromRolls(null)).toEqual([]);
    expect(damageTypesFromRolls([])).toEqual([]);
  });

  it("collects distinct valid types in canonical order", () => {
    expect(
      damageTypesFromRolls([
        { dice: "8d6", type: "Fire" },
        { dice: "2d6", type: "cold" },
        { dice: "1d6", type: "fire" },
      ]),
    ).toEqual(["cold", "fire"]);
  });

  it("ignores untyped or unrecognized rolls", () => {
    expect(
      damageTypesFromRolls([
        { dice: "5", type: "" },
        { dice: "1d4", type: "sonic" },
        { dice: "2d8", type: "radiant" },
      ]),
    ).toEqual(["radiant"]);
  });
});
