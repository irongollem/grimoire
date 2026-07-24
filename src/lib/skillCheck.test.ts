import { describe, it, expect } from "vitest";
import { skillCheckBonus, type SkillCheckSource } from "@/lib/skillCheck";

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
  it("returns the raw ability modifier when not proficient", () => {
    // Stealth keys off DEX (16 → +3), no proficiency.
    expect(skillCheckBonus(source(), "stealth")).toBe(3);
  });

  it("adds the proficiency bonus when proficient", () => {
    expect(skillCheckBonus(source({ skill_proficiencies: { stealth: "proficient" } }), "stealth")).toBe(6);
  });

  it("doubles the proficiency bonus for expertise", () => {
    expect(skillCheckBonus(source({ skill_proficiencies: { stealth: "expertise" } }), "stealth")).toBe(9);
  });

  it("keys off the skill's own ability (Athletics → STR)", () => {
    // STR 10 → +0, proficient (+3).
    expect(skillCheckBonus(source({ skill_proficiencies: { athletics: "proficient" } }), "athletics")).toBe(3);
  });

  it("uses override scores while keeping the member's proficiency", () => {
    // Beast DEX 20 → +5, plus proficiency +3.
    const s = source({ skill_proficiencies: { stealth: "proficient" } });
    const beast = { str: 12, dex: 20, con: 14, int: 3, wis: 12, cha: 6 };
    expect(skillCheckBonus(s, "stealth", beast)).toBe(8);
  });

  it("treats a missing proficiency map as no proficiency", () => {
    expect(skillCheckBonus(source({ skill_proficiencies: null }), "stealth")).toBe(3);
  });
});
