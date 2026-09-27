import { describe, it, expect } from "vitest";
import { sizeMultiplier, splitSpend, resetDelta, wholeCredits } from "./credit-math";

describe("sizeMultiplier", () => {
  it("is 1.0 for a square render", () => {
    expect(sizeMultiplier("1024x1024")).toBe(1);
  });
  it("is 1.5 for portrait and landscape (1.5× the square area)", () => {
    expect(sizeMultiplier("1024x1536")).toBe(1.5);
    expect(sizeMultiplier("1536x1024")).toBe(1.5);
  });
  it("falls back to 1 for blank/unknown/garbage sizes", () => {
    expect(sizeMultiplier(null)).toBe(1);
    expect(sizeMultiplier(undefined)).toBe(1);
    expect(sizeMultiplier("")).toBe(1);
    expect(sizeMultiplier("banana")).toBe(1);
    expect(sizeMultiplier("0x0")).toBe(1);
  });
  it("scales with larger renders (e.g. 2K square = 4×)", () => {
    expect(sizeMultiplier("2048x2048")).toBe(4);
  });
});

describe("splitSpend — subscription-first allocation", () => {
  it("draws entirely from subscription when it covers the cost", () => {
    expect(splitSpend(50, 1000)).toEqual({ subSpend: 50, purSpend: 0 });
  });
  it("draws entirely from purchased when subscription is empty", () => {
    expect(splitSpend(50, 0)).toEqual({ subSpend: 0, purSpend: 50 });
  });
  it("splits across the boundary when the cost exceeds remaining subscription", () => {
    // 30 sub credits left, spending 50 → 30 from sub, 20 from purchased
    expect(splitSpend(50, 30)).toEqual({ subSpend: 30, purSpend: 20 });
  });
  it("spends exactly the subscription balance with nothing left over", () => {
    expect(splitSpend(30, 30)).toEqual({ subSpend: 30, purSpend: 0 });
  });
  it("treats a negative subscription balance as zero (never refunds via over-draw)", () => {
    // a transient concurrent over-draw must not cause us to draw a negative amount
    expect(splitSpend(50, -10)).toEqual({ subSpend: 0, purSpend: 50 });
  });
  it("is a no-op for zero or negative cost", () => {
    expect(splitSpend(0, 1000)).toEqual({ subSpend: 0, purSpend: 0 });
    expect(splitSpend(-5, 1000)).toEqual({ subSpend: 0, purSpend: 0 });
  });
  it("conserves credits — subSpend + purSpend always equals cost (for positive cost)", () => {
    for (const [cost, sub] of [[50, 0], [50, 30], [50, 1000], [75, 75], [1, 0]] as const) {
      const { subSpend, purSpend } = splitSpend(cost, sub);
      expect(subSpend + purSpend).toBe(cost);
    }
  });
  it("supports fractional credits (provider multipliers)", () => {
    expect(splitSpend(7.5, 5)).toEqual({ subSpend: 5, purSpend: 2.5 });
  });
});

describe("wholeCredits — always rounds a charge up to a whole credit", () => {
  it("rounds a fractional charge up (26.25 → 27, the 0.35 OpenAI-image-multiplier case)", () => {
    expect(wholeCredits(26.25)).toBe(27);
  });
  it("is a no-op on a value that is already whole", () => {
    expect(wholeCredits(21)).toBe(21);
  });
  it("rounds a half-credit up (17.5 → 18)", () => {
    expect(wholeCredits(17.5)).toBe(18);
  });
  it("leaves a zero (free/infrastructure) charge at zero", () => {
    expect(wholeCredits(0)).toBe(0);
  });
  it("does not let float noise round a mathematically-whole product up a whole step", () => {
    // 60 * 0.35 is mathematically exactly 21; guard against a multiplication
    // chain that lands a hair above the integer (e.g. 21.000000000000004)
    // spuriously ceiling to 22.
    expect(wholeCredits(60 * 0.35)).toBe(21);
    expect(wholeCredits(21.000000000000004)).toBe(21);
  });
  it("never returns a negative number", () => {
    expect(wholeCredits(-5)).toBe(0);
    expect(wholeCredits(-0.5)).toBe(0);
  });
});

describe("resetDelta — use-it-or-lose-it monthly reset", () => {
  it("grants the full allowance when the bucket is empty", () => {
    expect(resetDelta(1500, 0)).toBe(1500);
  });
  it("expires unused credits — never accumulates past the allowance", () => {
    // 400 unused at period end + 1500 allowance must end at 1500, not 1900
    expect(resetDelta(1500, 400)).toBe(1100);
  });
  it("clears a negative (over-drawn) bucket back up to the allowance", () => {
    expect(resetDelta(1500, -50)).toBe(1550);
  });
  it("is a zero no-op delta when the bucket already equals the allowance", () => {
    // delta 0 still gets written as the per-period idempotency marker
    expect(resetDelta(1500, 1500)).toBe(0);
  });
  it("zeroes the bucket when the plan grants no credits", () => {
    expect(resetDelta(0, 250)).toBe(-250);
  });
  it("after applying the delta, the bucket sum always equals the allowance", () => {
    for (const [allowance, current] of [[1500, 0], [1500, 400], [1500, -50], [0, 250], [1000, 1000]] as const) {
      expect(current + resetDelta(allowance, current)).toBe(allowance);
    }
  });
});
