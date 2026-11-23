import { describe, expect, it } from "vitest";
import { clockFilled } from "./canonForces";

const tick = (delta = 1) => ({ delta });

describe("clockFilled", () => {
  it("is the sum of the ticks, so an undo that removes a tick moves the dial back", () => {
    expect(clockFilled([tick(1), tick(1), tick(-1)], 6)).toBe(1);
  });

  it("never runs past the clock's size, so a seventh tick on a clock of six does not draw a seventh segment", () => {
    expect(clockFilled(Array.from({ length: 7 }, () => tick()), 6)).toBe(6);
  });

  it("never runs below nothing, so ticking back on an empty clock is not a debt", () => {
    expect(clockFilled([tick(-2)], 6)).toBe(0);
  });
});
