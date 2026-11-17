import { describe, expect, it } from "vitest";
import { helperActs, NEVER_SEEN } from "./helperTurn";

const calm = { hp: 10, playedDown: false, said: 0 };

describe("helperActs", () => {
  // Bug caught (seen in play): a helper asked for a turn of the story every round with nothing to react to, a
  // credit each time for "she keeps her hands folded".
  it("acts the first time their turn comes, and then not again while nothing has changed for them", () => {
    expect(helperActs(calm, NEVER_SEEN)).toBe(true);
    expect(helperActs(calm, calm)).toBe(false);
  });

  // Bug caught: a helper who goes on standing by while they are being clawed, the player drops, or the player
  // calls out to them.
  it.each([
    ["they were hurt", { ...calm, hp: 6 }],
    ["the played character went down", { ...calm, playedDown: true }],
    ["the player said something aloud", { ...calm, said: 1 }],
  ])("acts again when %s", (_why, now) => {
    expect(helperActs(now, calm)).toBe(true);
  });

  // Bug caught: healing counted as a reason (hit points changed), or the played character staying down counted
  // as news every round.
  it("does not act for being healed, or for a state that has not changed", () => {
    expect(helperActs({ ...calm, hp: 10 }, { ...calm, hp: 4 })).toBe(false);
    expect(helperActs({ ...calm, playedDown: true }, { ...calm, playedDown: true })).toBe(false);
  });
});
