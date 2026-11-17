import { describe, expect, it } from "vitest";
import { pressureSpoken } from "./pressureLabel";

describe("pressureSpoken", () => {
  // Bug caught: a screen reader told how much time has gone instead of how much is left, the opposite of the pips' point.
  it("counts the turns left, not the turns gone", () => {
    expect(pressureSpoken({ filled: 1, segments: 4 })).toBe("Time is short: 3 of 4 turns left");
  });

  // Bug caught: "0 of 3 turns left" read out when the clock is full, instead of saying time is up.
  it("says time is out when the clock is full", () => {
    expect(pressureSpoken({ filled: 3, segments: 3 })).toBe("Out of time");
  });
});
