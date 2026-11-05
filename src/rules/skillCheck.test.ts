import { describe, it, expect } from "vitest";
import {
  jackOfAllTrades,
  jackOfAllTradesBonus,
  passiveScore,
  skillCheckBonus,
  type SkillCheckSource,
} from "@/rules/skillCheck";

function source(over: Partial<SkillCheckSource> = {}): SkillCheckSource {
  return {
    str: 10,
    dex: 16, // +3
    con: 12,
    int: 8,
    wis: 14,
    cha: 10,
    proficiency_bonus: 3,
    skill_proficiencies: {},
    ...over,
  };
}

describe("skillCheckBonus", () => {
  // PHB 2014 "Skill proficiency" / "Expertise": proficiency bonus, doubled by expertise.
  it("returns the raw ability modifier when not proficient", () => {
    // Stealth keys off DEX (16 → +3), no proficiency.
    expect(skillCheckBonus(source(), "stealth", "none")).toBe(3);
  });

  it("adds the proficiency bonus when proficient", () => {
    expect(skillCheckBonus(source({ skill_proficiencies: { stealth: "proficient" } }), "stealth", "none")).toBe(6);
  });

  it("doubles the proficiency bonus for expertise", () => {
    expect(skillCheckBonus(source({ skill_proficiencies: { stealth: "expertise" } }), "stealth", "none")).toBe(9);
  });

  it("keys off the skill's own ability (Athletics → STR)", () => {
    // STR 10 → +0, proficient (+3).
    expect(skillCheckBonus(source({ skill_proficiencies: { athletics: "proficient" } }), "athletics", "none")).toBe(3);
  });

  it("uses override scores while keeping the member's proficiency", () => {
    // Beast DEX 20 → +5, plus proficiency +3.
    const s = source({ skill_proficiencies: { stealth: "proficient" } });
    const beast = { str: 12, dex: 20, con: 14, int: 3, wis: 12, cha: 6 };
    expect(skillCheckBonus(s, "stealth", "none", beast)).toBe(8);
  });

  it("treats a missing proficiency map as no proficiency", () => {
    expect(skillCheckBonus(source({ skill_proficiencies: null }), "stealth", "none")).toBe(3);
  });
});

describe("passiveScore", () => {
  // PHB 2014 "Passive Checks": 10 + all modifiers that normally apply to the check.
  it("is 10 plus the check bonus", () => {
    // WIS 14 → +2, proficient (+3).
    expect(passiveScore(source({ skill_proficiencies: { perception: "proficient" } }), "perception", "none")).toBe(15);
  });

  it("takes Jack of All Trades, so a 2014 Bard 2 unproficient in Perception sees 10 + 2 + 1", () => {
    // PHB 2014 "Passive Checks": every modifier that applies to the check applies; WIS +2, half of PB 3 is 1.
    expect(passiveScore(source(), "perception", "any_check")).toBe(13);
  });

  it("honours override scores", () => {
    const beast = { str: 12, dex: 12, con: 12, int: 3, wis: 6, cha: 6 }; // WIS 6 → -2
    expect(passiveScore(source(), "perception", "none", beast)).toBe(8);
  });
});

describe("jackOfAllTrades", () => {
  const bard = (levels: number) => ({ capabilities: ["jack_of_all_trades"], levels });

  // PHB 2014 / SRD 5.2 "Bard": Jack of All Trades is a 2nd-level feature.
  it("is not granted at level 1 in the class", () => {
    expect(jackOfAllTrades([bard(1)], "2014")).toBe("none");
  });

  it("is granted from level 2 in the class", () => {
    expect(jackOfAllTrades([bard(2)], "2014")).toBe("any_check");
  });

  it("reads the level in the granting class, not the character's total level", () => {
    // Fighter 5 / Bard 1 is level 6 but has only one Bard level.
    expect(jackOfAllTrades([{ capabilities: [], levels: 5 }, bard(1)], "2014")).toBe("none");
    expect(jackOfAllTrades([{ capabilities: [], levels: 5 }, bard(2)], "2014")).toBe("any_check");
  });

  it("is the capability of the class definition, not any class's levels", () => {
    // #934: a class grants a feature through its definition's capabilities.
    expect(jackOfAllTrades([{ capabilities: ["wild_shape"], levels: 6 }], "2014")).toBe("none");
  });

  it("reaches only skill checks under 2024", () => {
    // SRD 5.2 "Bard": "any ability check you make that uses a skill proficiency you lack".
    expect(jackOfAllTrades([bard(2)], "2024")).toBe("skill_check");
  });

  it("grants nothing for a cached row that predates capabilities", () => {
    // app convention: a pre-#934 persisted row has no `capabilities` array and must not throw.
    const old = { levels: 6 } as unknown as { capabilities: string[]; levels: number };
    expect(jackOfAllTrades([old], "2014")).toBe("none");
  });
});

describe("Jack of All Trades on a check", () => {
  // PHB 2014 "Bard": half the proficiency bonus, rounded down, on a check that does not already include it.
  it("adds half the proficiency bonus to an unproficient skill", () => {
    // DEX +3, half of PB 4 is 2.
    expect(skillCheckBonus(source({ proficiency_bonus: 4 }), "stealth", "any_check")).toBe(5);
  });

  it("rounds an odd proficiency bonus down", () => {
    // DEX +3, half of PB 3 is 1.5, rounded down to 1.
    expect(skillCheckBonus(source(), "stealth", "any_check")).toBe(4);
  });

  it("adds nothing to a proficient skill", () => {
    expect(skillCheckBonus(source({ skill_proficiencies: { stealth: "proficient" } }), "stealth", "any_check")).toBe(6);
  });

  it("adds nothing to an expertise skill", () => {
    expect(skillCheckBonus(source({ skill_proficiencies: { stealth: "expertise" } }), "stealth", "any_check")).toBe(9);
  });

  it("applies to a 2024 skill check the character lacks proficiency in", () => {
    // SRD 5.2 "Bard": Strength (Athletics) without Athletics proficiency gets the half.
    expect(skillCheckBonus(source({ proficiency_bonus: 4 }), "athletics", "skill_check")).toBe(2);
  });

  it("reaches a plain ability check under 2014 but not 2024", () => {
    // PHB 2014: "any ability check"; SRD 5.2: only a check that uses a skill.
    expect(jackOfAllTradesBonus("any_check", 4, "ability")).toBe(2);
    expect(jackOfAllTradesBonus("skill_check", 4, "ability")).toBe(0);
  });

  it("adds nothing for a character without the feature", () => {
    expect(jackOfAllTradesBonus("none", 4, "skill")).toBe(0);
  });
});
