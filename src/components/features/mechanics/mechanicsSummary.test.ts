import { describe, expect, it } from "vitest";
import { describeAbilityIncrease, describeAmount, describePrerequisites, summarizeMechanics } from "./mechanicsSummary";

describe("describeAmount", () => {
  it("reads each kind as a short phrase", () => {
    expect(describeAmount({ kind: "fixed", value: 3 })).toBe("3");
    expect(describeAmount({ kind: "by_level", values: { "9": 4, "1": 2 } })).toBe("2 from level 1, 4 from level 9");
    expect(describeAmount({ kind: "ability_mod", ability: "cha", min: 1 })).toBe("CHA modifier, at least 1");
    expect(describeAmount({ kind: "class_level", multiplier: 5 })).toBe("5 x class level");
    expect(describeAmount({ kind: "unlimited_from", level: 20, below: { kind: "proficiency" } }))
      .toBe("Unlimited from level 20, otherwise Proficiency bonus");
  });
});

describe("summarizeMechanics", () => {
  it("is empty for a passive feature with no mechanics", () => {
    expect(summarizeMechanics({})).toEqual([]);
  });

  it("lists uses, recharge and a level table", () => {
    const groups = summarizeMechanics({
      activation: "bonus_action",
      uses: { key: "rage", label: "Rage", amount: { kind: "fixed", value: 2 }, recharge: "long", short_rest_regain: 1, pool: false },
      scaling: { label: "Rage Damage", values: { "9": "+3", "1": "+2" } },
    });
    expect(groups.map((g) => g.heading)).toEqual(["Takes", "Uses", "Rage Damage"]);
    expect(groups[1]?.lines).toEqual(["Rage: 2", "Comes back on a long rest; a short rest gives back 1"]);
    expect(groups[2]?.lines).toEqual(["Level 1: +2", "Level 9: +3"]);
  });
});

describe("feat summaries", () => {
  it("describes prerequisites and an ability increase", () => {
    expect(describePrerequisites(null)).toEqual([]);
    expect(describePrerequisites({ level: 4, abilities: { any_of: { str: 13, dex: 13 } }, spellcasting: true })).toEqual([
      "Character level 4 or higher",
      "STR 13 or DEX 13 or higher",
      "Can cast at least one spell",
    ]);
    expect(describeAbilityIncrease({ abilities: ["str", "dex"], amount: 1, split: false, max: 20 })).toBe("+1 to one of STR, DEX (maximum 20)");
    expect(describeAbilityIncrease(null)).toBeNull();
  });
});
