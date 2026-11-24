import { describe, expect, it } from "vitest";
import { boardEndOf, calledOffText, endingChange, parseCallOff } from "./callOffFight";
import type { FightState } from "./fight";

const fight: FightState = {
  encounterId: "e1",
  name: "The Watching Pack",
  phase: "running",
  round: 1,
  fighters: [{ name: "Hound", side: "enemy", hp: 9, maxHp: 16, nature: { line: "", yields: true, immune: [], pursuit: "hunts" } }],
};

describe("parseCallOff", () => {
  it("takes each listed way and nothing else", () => {
    for (const how of ["never_happened", "they_give_in", "they_flee", "you_get_away"]) expect(parseCallOff({ how })).toEqual({ ok: true, value: how });
    expect(parseCallOff({ how: "they_die" }).ok).toBe(false);
    expect(parseCallOff({}).ok).toBe(false);
  });
});

describe("what a call-off hands the board", () => {
  // Bug caught: never_happened handed to the page as an ending, so the board writes back and awards for a fight that did not happen.
  it("hands the board an ending for the three endings, free of cost, and none for a fight that never happened", () => {
    expect(boardEndOf("never_happened")).toBeNull();
    expect(boardEndOf("they_flee")).toBe("they_flee");
    expect(endingChange("you_get_away")).toEqual({ costs: "nothing", condition: null, damage: null, ends: "you_get_away" });
  });

  // Bug caught: getting away told without who gives chase, so the pursuers never arrive.
  it("tells who gives chase after getting away, and nothing of it for the other ways", () => {
    expect(calledOffText("you_get_away", fight)).toContain("give");
    expect(calledOffText("they_flee", fight)).not.toContain("chase");
    expect(calledOffText("never_happened", fight)).toContain("never happened");
  });
});
