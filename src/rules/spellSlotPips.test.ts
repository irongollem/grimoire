import { describe, expect, it } from "vitest";
import { usedAfterPipTap } from "@/rules/spellSlotPips";

describe("usedAfterPipTap", () => {
  const slot = { max: 4, used: 1 }; // 3 remaining: pips 1-3 filled
  it("spends a filled pip and the ones to its right", () => {
    expect(usedAfterPipTap(slot, 3)).toBe(2);
    expect(usedAfterPipTap(slot, 1)).toBe(4);
  });
  it("restores an empty pip and the ones to its left", () => {
    expect(usedAfterPipTap(slot, 4)).toBe(0);
  });
  it("restores the last slot from a fully spent level", () => {
    expect(usedAfterPipTap({ max: 3, used: 3 }, 1)).toBe(2);
  });
});
