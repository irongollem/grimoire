import { describe, expect, it } from "vitest";
import { pressureAfterSend, pressureSpoken } from "./pressureLabel";

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

describe("pressureAfterSend", () => {
  // Bug caught: "Out of time" left on the page for the rest of the sitting, because nothing ever takes a spent clock off.
  it("drops a full clock when the story moves on", () => {
    expect(pressureAfterSend({ filled: 3, segments: 3 })).toBeNull();
  });

  // Bug caught: a clock that is still counting taken off the page by the player's next message.
  it("keeps a clock with a turn still left, and stays empty when there was none", () => {
    expect(pressureAfterSend({ filled: 2, segments: 3 })).toEqual({ filled: 2, segments: 3 });
    expect(pressureAfterSend(null)).toBeNull();
  });
});
