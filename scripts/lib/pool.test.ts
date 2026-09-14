import { describe, expect, it } from "vitest";
import { pooled } from "./pool";

describe("pooled", () => {
  it("runs every item with at most `limit` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    await pooled([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      seen.push(n);
      inFlight--;
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("handles an empty list", async () => {
    await expect(pooled([], 4, async () => {})).resolves.toBeUndefined();
  });
});
