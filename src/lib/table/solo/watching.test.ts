import { describe, expect, it } from "vitest";
import { goesOnByItself, MAX_WATCHED_IN_A_ROW } from "./watching";

const base = { floor: "characters" as const, wanted: true, watched: 0, busy: false, writing: false };

describe("goesOnByItself", () => {
  it("lets the characters go on when they still have the floor", () => {
    expect(goesOnByItself(base)).toBe(true);
  });

  // Bug caught: a conversation that runs on for ever on the player's credits; or one more than the limit.
  it("stops after a few turns in a row", () => {
    expect(goesOnByItself({ ...base, watched: MAX_WATCHED_IN_A_ROW - 1 })).toBe(true);
    expect(goesOnByItself({ ...base, watched: MAX_WATCHED_IN_A_ROW })).toBe(false);
  });

  // Bug caught: the characters talking over the player (who has begun to write), over a roll that is asked for,
  // or for a player who switched this off; each of those spends a turn the player did not ask for.
  it.each([
    ["the floor is the player's", { ...base, floor: "player" as const }],
    ["the player switched it off", { ...base, wanted: false }],
    ["a fight or a roll is waiting", { ...base, busy: true }],
    ["the player has begun to write", { ...base, writing: true }],
  ])("does not go on when %s", (_why, input) => {
    expect(goesOnByItself(input)).toBe(false);
  });
});
