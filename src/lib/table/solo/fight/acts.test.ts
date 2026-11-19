import { describe, expect, it } from "vitest";
import { DISENGAGED, DODGING } from "@/rules/fight/stances";
import { actOutcome } from "./acts";

describe("actOutcome", () => {
  // Bug caught (seen live): Dodge and Disengage only spent the Action; the hounds attacked a dodging character at
  // no disadvantage. And the other way: Dodge given Disengage's condition.
  it("gives Dodge and Disengage each their own condition, until the character's next turn", () => {
    // PHB 2014 "Dodge" and "Disengage": both last until the start of your next turn.
    expect(actOutcome("dodge", "Rosie").stance).toMatchObject({ name: DODGING, ends: { kind: "turn", at: "start", of: "self" } });
    expect(actOutcome("disengage", "Rosie").stance).toMatchObject({ name: DISENGAGED, ends: { kind: "turn", at: "start", of: "self" } });
  });

  // Bug caught: Dash leaving a condition behind, or Dodge doubling the turn's speed.
  it("doubles the speed for Dash alone, and puts no condition on a Dash or a Hide", () => {
    expect(actOutcome("dash", "Rosie")).toMatchObject({ dashes: true, stance: null });
    expect(actOutcome("dodge", "Rosie").dashes).toBe(false);
    expect(actOutcome("hide", "Rosie").stance).toBeNull();
  });
});
