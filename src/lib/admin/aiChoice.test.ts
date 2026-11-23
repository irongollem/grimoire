import { describe, expect, it } from "vitest";
import { aiChoiceLabel, countAiChoice } from "./aiChoice";

const owner = (owned: number, on: number) => ({ campaigns_owned: owned, campaigns_ai_on: on });

describe("aiChoiceLabel", () => {
  it("says nothing for an account that owns no campaign", () => {
    expect(aiChoiceLabel(owner(0, 0))).toBe("");
  });
  it("is off when no owned campaign has AI on", () => {
    expect(aiChoiceLabel(owner(2, 0))).toBe("AI off");
  });
  it("is on when every owned campaign has it on", () => {
    expect(aiChoiceLabel(owner(2, 2))).toBe("AI on");
  });
  it("names the split when only some do", () => {
    expect(aiChoiceLabel(owner(3, 1))).toBe("AI on in 1 of 3");
  });
});

describe("countAiChoice", () => {
  it("counts an owner with AI on anywhere as on, all-off as off, and skips non-owners", () => {
    expect(countAiChoice([owner(3, 1), owner(1, 1), owner(2, 0), owner(0, 0)])).toEqual({ on: 2, off: 1 });
  });
});
