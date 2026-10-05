import { describe, it, expect } from "vitest";
import { memberInitiativeModifier } from "@/rules/initiative";

describe("memberInitiativeModifier", () => {
  it("is the DEX modifier alone with no bonus", () => {
    expect(memberInitiativeModifier({ dex: 16, initiative_bonus: 0 })).toBe(3);
  });
  it("adds initiative_bonus", () => {
    expect(memberInitiativeModifier({ dex: 14, initiative_bonus: 5 })).toBe(7);
  });
  it("floors negative modifiers", () => {
    expect(memberInitiativeModifier({ dex: 9, initiative_bonus: 0 })).toBe(-1);
    expect(memberInitiativeModifier({ dex: 8, initiative_bonus: 1 })).toBe(0);
  });
});
