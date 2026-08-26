import { describe, expect, it } from "vitest";
import { MAX_GENERATION_ATTEMPTS, attemptCharge, attemptsRemaining, canAttempt } from "./generationBudget";

describe("attempt budget", () => {
  it("charges the first attempt on a slot and nothing after it", () => {
    expect(attemptCharge(12, 0)).toBe(12);
    expect(attemptCharge(12, 1)).toBe(0);
    expect(attemptCharge(12, 3)).toBe(0);
  });

  it("allows exactly one attempt plus three retries", () => {
    expect([0, 1, 2, 3].map(canAttempt)).toEqual([true, true, true, true]);
    expect(canAttempt(MAX_GENERATION_ATTEMPTS)).toBe(false);
    expect([0, 1, 2, 3, 4, 9].map(attemptsRemaining)).toEqual([4, 3, 2, 1, 0, 0]);
  });

  // The cap bounds provider calls, not only credits — a BYOK run reserves
  // nothing and must still stop at four.
  it("charges nothing once the budget is spent", () => {
    expect(attemptCharge(12, MAX_GENERATION_ATTEMPTS)).toBe(0);
    expect(attemptCharge(0, 0)).toBe(0);
  });
});
