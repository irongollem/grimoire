import { describe, expect, it } from "vitest";
import { formatConditionImmunities, formatDefenseList, parseDefenses } from "./parseDefenses.ts";

describe("parseDefenses", () => {
  it("returns empty defenses for nothing", () => {
    expect(parseDefenses({})).toEqual({ resistances: [], immunities: [], vulnerabilities: [], condition_immunities: [] });
    expect(parseDefenses({ damage_resistances: "false", damage_immunities: null })).toEqual({
      resistances: [],
      immunities: [],
      vulnerabilities: [],
      condition_immunities: [],
    });
  });

  it("splits unconditional types from a nonmagical group", () => {
    const d = parseDefenses({
      damage_resistances: "cold, fire; bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered",
    });
    expect(d.resistances).toEqual([
      { types: ["cold", "fire"] },
      { types: ["bludgeoning", "piercing", "slashing"], unless: ["magical", "silvered"] },
    ]);
  });

  it("splits a mixed group even without the semicolon", () => {
    const d = parseDefenses({ damage_resistances: "cold, bludgeoning, piercing, and slashing from nonmagical attacks" });
    expect(d.resistances).toEqual([
      { types: ["cold"] },
      { types: ["bludgeoning", "piercing", "slashing"], unless: ["magical"] },
    ]);
  });

  it("maps adamantine and the shorthand spellings", () => {
    expect(parseDefenses({ damage_immunities: "bludgeoning, piercing, and slashing from nonmagical attacks not made with adamantine weapons" }).immunities).toEqual([
      { types: ["bludgeoning", "piercing", "slashing"], unless: ["magical", "adamantine"] },
    ]);
    expect(parseDefenses({ damage_resistances: "poison; nonmagic B/P/S attacks not made w/silvered weapons" }).resistances).toEqual([
      { types: ["poison"] },
      { types: ["bludgeoning", "piercing", "slashing"], unless: ["magical", "silvered"] },
    ]);
    expect(parseDefenses({ damage_immunities: "damage from nonmagical weapons" }).immunities).toEqual([
      { types: ["bludgeoning", "piercing", "slashing"], unless: ["magical"] },
    ]);
  });

  it("keeps an unknown qualifier as a note on the group", () => {
    const d = parseDefenses({ damage_vulnerabilities: "radiant while in direct sunlight" });
    expect(d.vulnerabilities).toEqual([{ types: ["radiant"], note: "while in direct sunlight" }]);
  });

  it("puts a segment with no damage type into notes", () => {
    const d = parseDefenses({ damage_resistances: "damage from spells; Fey Resilience" });
    expect(d.resistances).toEqual([]);
    expect(d.notes).toBe("damage from spells; Fey Resilience");
  });

  it("maps condition immunities case-insensitively, with exhaustion variants", () => {
    const d = parseDefenses({ condition_immunities: "Charmed, exhausted, poisoned, Prone" });
    expect(d.condition_immunities).toEqual(["Charmed", "Exhaustion", "Poisoned", "Prone"]);
    expect(parseDefenses({ condition_immunities: "fatigue" }).condition_immunities).toEqual(["Exhaustion"]);
  });

  it("keeps leftover condition words as notes", () => {
    const d = parseDefenses({ condition_immunities: "charmed, confusion" });
    expect(d.condition_immunities).toEqual(["Charmed"]);
    expect(d.notes).toBe("confusion");
  });

  it("rescues a condition filed under damage immunities", () => {
    const d = parseDefenses({ damage_immunities: "poison,poisoned" });
    expect(d.immunities).toEqual([{ types: ["poison"] }]);
    expect(d.condition_immunities).toEqual(["Poisoned"]);
  });

  it("decodes &amp;", () => {
    expect(parseDefenses({ damage_resistances: "fire &amp; cold" }).resistances).toEqual([{ types: ["cold", "fire"] }]);
  });
});

describe("formatting", () => {
  it("writes 2014-style text, unconditional groups first", () => {
    expect(
      formatDefenseList([
        { types: ["bludgeoning", "piercing", "slashing"], unless: ["magical", "silvered"] },
        { types: ["fire", "poison"] },
      ]),
    ).toBe("fire, poison; bludgeoning, piercing, and slashing from nonmagical attacks that aren't silvered");
  });

  it("writes a note in parentheses, and condition immunities lowercase", () => {
    expect(formatDefenseList([{ types: ["radiant"], note: "in sunlight" }])).toBe("radiant (in sunlight)");
    expect(formatConditionImmunities(["Charmed", "Exhaustion"])).toBe("charmed, exhaustion");
    expect(formatDefenseList([])).toBe("");
  });
});

describe("qualified condition immunities", () => {
  it("keeps a condition that only sometimes applies as a note, not an immunity the runner would always enforce", () => {
    const d = parseDefenses({ condition_immunities: "charmed, poisoned (while Assassinate is active)" });
    expect(d.condition_immunities).toEqual(["Charmed"]);
    expect(d.notes).toContain("poisoned (while Assassinate is active)");
    const raging = parseDefenses({ condition_immunities: "frightened while raging" });
    expect(raging.condition_immunities).toEqual([]);
    expect(raging.notes).toContain("frightened while raging");
  });

  it("still reads plain condition words and the 'the X condition' form", () => {
    expect(parseDefenses({ condition_immunities: "the poisoned condition, paralysis" }).condition_immunities).toEqual(["Poisoned", "Paralyzed"]);
    expect(parseDefenses({ condition_immunities: "frightened, prone poisoned" }).condition_immunities).toEqual(["Frightened", "Prone", "Poisoned"]);
  });
});
