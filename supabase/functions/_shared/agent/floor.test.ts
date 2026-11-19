import { describe, expect, it } from "vitest";
import { floorOf } from "./floor.ts";

const going = { ended: "open" as const, cutShort: true };
const base = { lastExchange: going, narratorKeeps: false, rollAsked: false, inFight: false, finished: true };

describe("floorOf", () => {
  // Bug caught: every turn handing the floor back, so a conversation among the characters stops after three
  // lines and waits on a player who only wanted to watch.
  it("leaves the floor with the characters when they were stopped mid-conversation", () => {
    expect(floorOf(base)).toBe("characters");
  });

  // Bug caught (seen live): the player sits down "just to listen", a character speaks to the whole room, and the
  // turn is handed straight back, because only a call's limits counted as a conversation still going.
  it("leaves the floor with the characters when the narrator says they go on", () => {
    expect(floorOf({ ...base, narratorKeeps: true, lastExchange: { ended: "open", cutShort: false } })).toBe("characters");
  });

  // Bug caught: the characters talking on over a question that was put to the player, or after they had all had
  // their say (the page would then ask for a turn nobody has anything to add to, at the player's cost).
  it.each([
    ["someone turned to the player", { ...base, lastExchange: { ended: "to_player" as const, cutShort: false } }],
    ["the exchange came to rest by itself and the narrator said nothing of more", { ...base, lastExchange: { ended: "open" as const, cutShort: false } }],
    ["the narrator says they go on, but someone turned to the player", { ...base, narratorKeeps: true, lastExchange: { ended: "to_player" as const, cutShort: false } }],
    ["the narrator says they go on, but nobody spoke", { ...base, narratorKeeps: true, lastExchange: null }],
    ["nobody spoke", { ...base, lastExchange: null }],
    ["a roll is being asked of the player", { ...base, rollAsked: true }],
    ["a fight began or is being fought", { ...base, inFight: true }],
    ["the turn was stopped before its end", { ...base, finished: false }],
  ])("hands the floor to the player when %s", (_why, input) => {
    expect(floorOf(input)).toBe("player");
  });
});
