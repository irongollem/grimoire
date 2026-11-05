import { describe, it, expect } from "vitest";
import { memberInitiativeModifier } from "@/rules/initiative";

describe("memberInitiativeModifier", () => {
  // PHB 2014 "Initiative" (Dexterity check)
  it("is the DEX modifier alone with no bonus", () => {
    expect(memberInitiativeModifier({ dex: 16, initiative_bonus: 0, proficiency_bonus: 2 }, "none")).toBe(3);
  });
  it("adds initiative_bonus", () => {
    expect(memberInitiativeModifier({ dex: 14, initiative_bonus: 5, proficiency_bonus: 2 }, "none")).toBe(7);
  });
  it("floors negative modifiers", () => {
    expect(memberInitiativeModifier({ dex: 9, initiative_bonus: 0, proficiency_bonus: 2 }, "none")).toBe(-1);
    expect(memberInitiativeModifier({ dex: 8, initiative_bonus: 1, proficiency_bonus: 2 }, "none")).toBe(0);
  });
  it("uses a supplied DEX in place of the character's, as in a Wild Shape form", () => {
    expect(memberInitiativeModifier({ dex: 8, initiative_bonus: 0, proficiency_bonus: 2 }, "none", 14)).toBe(2);
    expect(memberInitiativeModifier({ dex: 18, initiative_bonus: 5, proficiency_bonus: 2 }, "none", 10)).toBe(5);
  });
  it("adds a 2014 Bard's Jack of All Trades, initiative being a Dexterity check", () => {
    // PHB 2014 "Initiative" is a Dexterity check, and Jack of All Trades reaches any ability check: +3 DEX, half of PB 3 is 1.
    expect(memberInitiativeModifier({ dex: 16, initiative_bonus: 0, proficiency_bonus: 3 }, "any_check")).toBe(4);
  });
  it("leaves a 2024 Bard's initiative alone, since it uses no skill", () => {
    // SRD 5.2 "Bard": only a check that uses a skill proficiency the character lacks.
    expect(memberInitiativeModifier({ dex: 16, initiative_bonus: 0, proficiency_bonus: 3 }, "skill_check")).toBe(3);
  });
});
