import { describe, expect, it } from "vitest";
import { creditsDue, creditsForUsd, usdForSteps, usdForUsage, type ModelPrice } from "./metering";
import type { AgentUsage } from "./types";

const usage = (over: Partial<AgentUsage> = {}): AgentUsage => ({
  provider: "p",
  model: "m",
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...over,
});

const price: ModelPrice = { inputPerMillion: 0.2, outputPerMillion: 1.2, cachedInputPerMillion: 0.05 };

describe("usdForUsage", () => {
  it("prices input and output at their own rates", () => {
    // 1,000,000 * 0.20 / 1e6 = 0.20; 100,000 * 1.20 / 1e6 = 0.12; together 0.32.
    expect(usdForUsage(usage({ inputTokens: 1_000_000, outputTokens: 100_000 }), price)).toBeCloseTo(0.32, 10);
  });

  it("prices cache reads at the cached rate when there is one", () => {
    // 2,000,000 cached * 0.05 / 1e6 = 0.10. Billing them at 0.20 would give 0.40.
    expect(usdForUsage(usage({ cacheReadTokens: 2_000_000 }), price)).toBeCloseTo(0.1, 10);
  });

  it("bills cache reads at the full input rate when no cached rate is on file, never free or cheaper", () => {
    // 2,000,000 * 0.20 / 1e6 = 0.40. A null rate treated as 0 would give 0.
    const noCached: ModelPrice = { ...price, cachedInputPerMillion: null };
    expect(usdForUsage(usage({ cacheReadTokens: 2_000_000 }), noCached)).toBeCloseTo(0.4, 10);
  });

  it("bills cache writes at the full input rate, not the cached rate", () => {
    // 1,000,000 * 0.20 / 1e6 = 0.20. At the cached rate it would be 0.05.
    expect(usdForUsage(usage({ cacheWriteTokens: 1_000_000 }), price)).toBeCloseTo(0.2, 10);
  });
});

describe("usdForSteps", () => {
  it("adds every step, so a multi-call turn is not billed for its last call only", () => {
    // Step one 0.20 (1M input), step two 0.12 (100k output): 0.32.
    const total = usdForSteps([usage({ inputTokens: 1_000_000 }), usage({ outputTokens: 100_000 })], price);
    expect(total).toBeCloseTo(0.32, 10);
  });

  it("is zero for no steps", () => {
    expect(usdForSteps([], price)).toBe(0);
  });
});

describe("creditsForUsd", () => {
  it("is usd times margin over the price of a credit, unrounded", () => {
    // 0.32 * 3 / 0.02 = 48 for a 3x margin; 0.01 * 2 / 0.04 = 0.5 stays a half, not a whole.
    expect(creditsForUsd(0.32, { usdPerCredit: 0.02, margin: 3 })).toBeCloseTo(48, 10);
    expect(creditsForUsd(0.01, { usdPerCredit: 0.04, margin: 2 })).toBeCloseTo(0.5, 10);
  });

  it.each([
    ["zero usdPerCredit", { usdPerCredit: 0, margin: 2 }],
    ["negative usdPerCredit", { usdPerCredit: -1, margin: 2 }],
    ["NaN usdPerCredit", { usdPerCredit: Number.NaN, margin: 2 }],
    ["infinite usdPerCredit", { usdPerCredit: Number.POSITIVE_INFINITY, margin: 2 }],
    ["zero margin", { usdPerCredit: 0.02, margin: 0 }],
    ["negative margin", { usdPerCredit: 0.02, margin: -2 }],
    ["NaN margin", { usdPerCredit: 0.02, margin: Number.NaN }],
  ])("throws on %s instead of making play free", (_name, calibration) => {
    expect(() => creditsForUsd(1, calibration)).toThrow("Credit calibration is not usable");
  });
});

describe("creditsDue", () => {
  it("bills nothing while the total stays inside one credit", () => {
    expect(creditsDue(0.2, 0.9)).toBe(0);
  });

  it("bills the whole credits newly crossed, and only those", () => {
    // floor(3.1) - floor(0.4) = 3 - 0.
    expect(creditsDue(0.4, 3.1)).toBe(3);
    // Already past 2: crossing to 2.9 bills nothing more.
    expect(creditsDue(2.2, 2.9)).toBe(0);
  });

  it("counts a total that is 1 up to float noise as having reached 1", () => {
    const noisy = 0.6 + 0.3 + 0.1; // 0.9999999999999999 in IEEE doubles, mathematically 1
    expect(noisy).not.toBe(1);
    expect(creditsDue(0.3, noisy)).toBe(1);
  });

  it("does not bill a credit twice when the earlier total was float noise below a whole", () => {
    // Before is 1 - 1e-12, which is the whole credit 1; after 1.5 crosses nothing new.
    expect(creditsDue(1 - 1e-12, 1.5)).toBe(0);
  });

  it("never goes negative when the total moves backwards", () => {
    expect(creditsDue(3.5, 1.2)).toBe(0);
  });

  it("treats NaN or negative totals as nothing accrued rather than billing garbage", () => {
    expect(creditsDue(Number.NaN, 2.5)).toBe(2);
    expect(creditsDue(0, Number.NaN)).toBe(0);
    expect(creditsDue(-5, 1.5)).toBe(1);
  });
});
