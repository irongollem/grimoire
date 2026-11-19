import { describe, expect, it } from "vitest";
import { DEEDS_REMEMBERED, freshDeed } from "./deeds.ts";

const HELD = "He keeps his hands close to his chest and watches the key.";

describe("freshDeed", () => {
  // Bug caught (seen live): a character restating the posture it already holds, turn after turn, as if it were news.
  it.each([
    "He keeps his hands close to his chest and watches the brass key.",
    "He watches the key without moving his hands from his chest.",
    "He keeps his hands close to his chest and watches the key.",
  ])("drops a deed that only tells the same posture again: %s", (again) => {
    expect(freshDeed(again, [HELD])).toBeNull();
  });

  // Bug caught: a new deed dropped because it shares a word or two with the last one (the same key, the same
  // hands), so a character can never act twice on the same thing.
  it.each([
    "He reaches for the tray by its cool edge.",
    "He picks up the key and holds it out to Comfit.",
    "He steps back from Chicory and moves closer to Comfit.",
  ])("keeps a deed that is something new: %s", (deed) => {
    expect(freshDeed(deed, [HELD])).toBe(deed);
  });

  // Bug caught: something done long ago never allowed again.
  it("only looks at the character's last few deeds", () => {
    const since = Array.from({ length: DEEDS_REMEMBERED }, (_, i) => `She does something else entirely number ${i} with the kettle${"s".repeat(i)}.`);
    expect(freshDeed(HELD, [HELD, ...since])).toBe(HELD);
  });

  it("has nothing to drop when there is no deed or no earlier one", () => {
    expect(freshDeed(null, [HELD])).toBeNull();
    expect(freshDeed(HELD, [])).toBe(HELD);
  });
});
