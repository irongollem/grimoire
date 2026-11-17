import { describe, expect, it } from "vitest";
import { endLine, parseFightChange } from "./fightChange";

describe("parseFightChange", () => {
  it("reads a condition, damage and an end as the server sends them", () => {
    expect(parseFightChange({ costs: "action", condition: { target: "Hound 1", name: "Blinded", rounds: 1 }, damage: null, ends: null })).toEqual({
      costs: "action", condition: { target: "Hound 1", name: "Blinded", rounds: 1 }, damage: null, ends: null,
    });
    expect(parseFightChange({ costs: "nothing", condition: null, damage: null, ends: "they_give_in" })?.ends).toBe("they_give_in");
  });

  // Bug caught: half of a broken change carried out (the Action spent, nothing done; or damage of "lots").
  it.each([
    ["an unknown cost", { costs: "free", condition: null, damage: { target: "Hound 1", amount: 4 }, ends: null }],
    ["damage that is not a whole number", { costs: "action", condition: null, damage: { target: "Hound 1", amount: 4.5 }, ends: null }],
    ["a condition with no rounds", { costs: "action", condition: { target: "Hound 1", name: "Blinded" }, damage: null, ends: null }],
    ["an unknown ending", { costs: "action", condition: null, damage: null, ends: "everyone_dies" }],
    ["a change that costs nothing and does nothing", { costs: "nothing", condition: null, damage: null, ends: null }],
    ["not a change at all", "blinded"],
  ])("takes %s for no change", (_what, raw) => {
    expect(parseFightChange(raw)).toBeNull();
  });
});

describe("a failed attempt", () => {
  // Bug caught: an attempt whose roll failed costing the turn nothing, so a player can try the same stunt again and again.
  it("is a change that only spends what trying cost", () => {
    expect(parseFightChange({ costs: "action", condition: null, damage: null, ends: null })).toEqual({ costs: "action", condition: null, damage: null, ends: null });
  });
});

describe("endLine", () => {
  it("says who got away by name", () => {
    expect(endLine("you_get_away", "Rosie")).toBe("The fight is over: Rosie got away");
  });
});
