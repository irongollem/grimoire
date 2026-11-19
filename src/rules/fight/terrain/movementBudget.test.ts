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
    // Level 2: 30 - 10 = 20; 5 moved: 15. Bug: ignoring Exhaustion, or taking feet off under 2014, which halves
    // instead (PHB 2014 appendix A, level 2): 30 / 2 = 15; 5 moved: 10.
    expect(budget({ conditions: [cond("Exhaustion", 2)], ruleset: "2024", movementUsed: 5 })).toBe(15);
    expect(budget({ conditions: [cond("Exhaustion", 2)], ruleset: "2014", movementUsed: 5 })).toBe(10);
  });

  // PHB 2014 appendix A "Exhaustion": level 5 speed reduced to 0, level 6 death. Level 4 is still only halved (level 2's
  // effect): 30 / 2 = 15, less 5 moved = 10.
  // Under 2024 level 5 takes 25 ft off 30: 5 left, so it is not "speed 0" (SRD 5.2 "Exhaustion").
  // PHB 2014 appendix A "Exhaustion", level 2: "Speed halved". Level 1 does not touch speed. 5e rounds down: 25 / 2 = 12.
  // Under 2024 level 2 takes 10 ft off instead (SRD 5.2 "Exhaustion": 5 ft per level): 30 - 10 = 20.
  it("fails if 2014 Exhaustion level 2 leaves the speed whole, or halves it at level 1 or under 2024", () => {
    expect(budget({ conditions: [cond("Exhaustion", 2)], ruleset: "2014" })).toBe(15);
    expect(budget({ conditions: [cond("Exhaustion", 1)], ruleset: "2014" })).toBe(30);
    expect(budget({ conditions: [cond("Exhaustion", 2)], ruleset: "2014", speed: 25 })).toBe(12);
    expect(budget({ conditions: [cond("Exhaustion", 2)], ruleset: "2024" })).toBe(20);
  });

  it("fails if 2014 Exhaustion level 5 or 6 leaves a creature able to walk, or 2024 level 5 stops it", () => {
    expect(speedIsZero([cond("Exhaustion", 5)], "2014")).toBe(true);
    expect(budget({ conditions: [cond("Exhaustion", 6)], ruleset: "2014" })).toBe(0);
    expect(speedIsZero([cond("Exhaustion", 4)], "2014")).toBe(false);
    expect(budget({ conditions: [cond("Exhaustion", 4)], ruleset: "2014", movementUsed: 5 })).toBe(10);
    expect(speedIsZero([cond("Exhaustion", 5)], "2024")).toBe(false);
    expect(budget({ conditions: [cond("Exhaustion", 5)], ruleset: "2024" })).toBe(5);
  });

  it("Exhaustion cannot push the budget below 0", () => {
    // Level 6 under 2024 takes 30 ft off a 30 ft speed: 0.
    expect(budget({ conditions: [cond("Exhaustion", 6)], ruleset: "2024" })).toBe(0);
  });
});
