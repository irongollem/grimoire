import { describe, expect, it } from "vitest";
import { rechargeSucceeds } from "./recharge.ts";

describe("rechargeSucceeds", () => {
  it.each([
    [4, false],
    [5, true],
    [6, true],
  ])("Recharge 5-6 on a %i", (d, e) => expect(rechargeSucceeds(d, { min: 5, max: 6 })).toBe(e));
  it("Recharge 6 needs a 6", () => {
    expect(rechargeSucceeds(5, { min: 6, max: 6 })).toBe(false);
    expect(rechargeSucceeds(6, { min: 6, max: 6 })).toBe(true);
  });
});
