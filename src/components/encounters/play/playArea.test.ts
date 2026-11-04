import { describe, expect, it, vi } from "vitest";
import { damageAll } from "./playArea";

describe("damageAll", () => {
  it("hits every selected creature once and nobody else, for the same amount", () => {
    const adjust = vi.fn();
    expect(damageAll(new Set(["a", "b", "c"]), 7, adjust)).toBe(3);
    expect(adjust.mock.calls).toEqual([["a", -7], ["b", -7], ["c", -7]]);
  });

  it("does not hit the same creature twice when the selection lists it twice", () => {
    const adjust = vi.fn();
    expect(damageAll(["a", "a", "b"], 4, adjust)).toBe(2);
    expect(adjust).toHaveBeenCalledTimes(2);
  });

  // A typed 0, a negative or a half point would heal, do nothing or write a fraction into someone's HP.
  it.each([0, -3, 2.5, Number.NaN])("hits nobody for an amount of %s", (amount) => {
    const adjust = vi.fn();
    expect(damageAll(["a"], amount, adjust)).toBe(0);
    expect(adjust).not.toHaveBeenCalled();
  });
});
