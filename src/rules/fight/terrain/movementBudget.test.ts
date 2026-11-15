import { describe, expect, it } from "vitest";
import type { AppliedCondition } from "../../../types/condition.types.ts";
import { movementBudgetFeet, speedIsZero } from "./movementBudget.ts";

const cond = (name: string, level?: number): AppliedCondition => (level === undefined ? { name } : { name, level });
const budget = (over: Partial<Parameters<typeof movementBudgetFeet>[0]>) =>
  movementBudgetFeet({ speed: 30, movementUsed: undefined, conditions: [], ruleset: "2014", ...over });

describe("the feet of movement left this turn", () => {
  it("is the speed less the feet already moved", () => {
    // 30 ft speed, 10 ft moved: 20 left. Bug: ignoring the tally, so a creature that had moved got a fresh budget.
    expect(budget({ movementUsed: 10 })).toBe(20);
    expect(budget({})).toBe(30);
  });

  it("never goes below 0 when more was moved than the speed (a Dash)", () => {
    // 45 ft moved on a 30 ft speed: 0, not -15. Bug: returning the raw difference.
    expect(budget({ movementUsed: 45 })).toBe(0);
  });

  it("says nothing when no speed is known, never a guessed one", () => {
    expect(budget({ speed: null })).toBeNull();
  });

  it.each(["Grappled", "Paralyzed", "Petrified", "Restrained", "Stunned", "Unconscious"])(
    "%s sets the speed to 0 under 2014, however little has been moved",
    (name) => {
      // Bug: omitting one of the six conditions whose 2014 text says the speed is 0 or the creature can't move.
      expect(budget({ conditions: [cond(name)] })).toBe(0);
    },
  );

  it.each(["Grappled", "Paralyzed", "Petrified", "Restrained", "Unconscious"])("%s sets the speed to 0 under 2024", (name) => {
    expect(budget({ conditions: [cond(name)], ruleset: "2024" })).toBe(0);
  });

  it("Stunned stops a walk under 2014 but not under 2024, whose text does not mention movement", () => {
    // Bug: applying the 2014 list to a 2024 campaign, freezing a Stunned creature the book lets walk.
    expect(speedIsZero([cond("Stunned")], "2014")).toBe(true);
    expect(speedIsZero([cond("Stunned")], "2024")).toBe(false);
  });

  it("a condition that does not touch speed leaves the budget alone", () => {
    // Bug: treating any condition as immobilising. Poisoned and Prone (standing is not modelled) change nothing here.
    expect(budget({ conditions: [cond("Poisoned"), cond("Prone")], movementUsed: 5 })).toBe(25);
  });

  it("2024 Exhaustion takes 5 ft per level off the speed, then the moved feet", () => {
    // Level 2: 30 - 10 = 20; 5 moved: 15. Bug: ignoring Exhaustion, or applying it under 2014 (which tiers it).
    expect(budget({ conditions: [cond("Exhaustion", 2)], ruleset: "2024", movementUsed: 5 })).toBe(15);
    expect(budget({ conditions: [cond("Exhaustion", 2)], ruleset: "2014", movementUsed: 5 })).toBe(25);
  });

  it("Exhaustion cannot push the budget below 0", () => {
    // Level 6 under 2024 takes 30 ft off a 30 ft speed: 0.
    expect(budget({ conditions: [cond("Exhaustion", 6)], ruleset: "2024" })).toBe(0);
  });
});
