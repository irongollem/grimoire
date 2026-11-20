/** Rules 2 to 5: Dash, Disengage, Dodge and Hide. */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { mapOf, ogre, fresco, chicory, run, find } from "./turnOptionsTestKit.ts";

describe("rule 2: dash", () => {
  it("dashes with twice the budget toward a hostile no attack reaches, and not toward one an attack reaches", () => {
    // Ogre (0,0). Fresco (12,0) is 12 squares off: touching it needs 11 steps (55 ft), more than 30 but within the
    // doubled 60. The nearest squares are (11,-1), (11,0), (11,1) at 55 ft, 5 ft from Fresco; the top row wins.
    // (12,-1) also touches Fresco but costs 60. Chicory (1,0) is beside the Ogre, so she gets an attack and no dash; the
    // run east leaves her reach, so the dash provokes her.
    const options = run({ combatants: [ogre(), fresco(12, 0), chicory(1, 0)] });
    const dash = find(options, "dash:fresco");
    expect(dash?.destination).toEqual({ x: 11, y: -1 });
    expect(dash?.feet).toBe(55);
    expect(dash?.distanceFeet).toBe(5);
    expect(dash?.summary).toBe("Dash 55 ft toward Fresco, ending 5 ft away; provokes an opportunity attack from Chicory");
    expect(find(options, "dash:chicory")).toBeUndefined();
    expect(find(options, "attack:actions:Greatclub:chicory")).toBeDefined();
  });

  it("offers a dash toward a target that is walled off from every attack square", () => {
    // Fresco is shut in a closet (walls round (5,0)), so no attack option. The dash ends as near as the walls allow:
    // (4,-1), (4,0) and (4,1) are 4 steps (20 ft) and touch Fresco's square; the top row wins, (4,-1).
    const closet = mapOf([[[5, 0], [6, 0]], [[6, 0], [6, 1]], [[6, 1], [5, 1]], [[5, 1], [5, 0]]]);
    const options = run({ combatants: [ogre(), fresco(5, 0)], map: closet });
    expect(find(options, "attack:actions:Greatclub:fresco")).toBeUndefined();
    expect(find(options, "dash:fresco")?.destination).toEqual({ x: 4, y: -1 });
  });
});

describe("rule 3: disengage", () => {
  it("ends on the square farthest from its nearest enemy, provoking nothing", () => {
    // Ogre (0,0), Chicory (1,0) beside it with her reaction free. Six steps west is the farthest the Ogre can get: at
    // x=-6 (box -6..-5) the gap to Chicory's box (x 1..2) is 1-(-5) = 6 squares, so 35 ft. Every square x=-6, y -6..6
    // costs 30 ft; the top row wins, (-6,-6).
    const o = find(run({ combatants: [ogre(), chicory(1, 0)] }), "disengage");
    expect(o?.destination).toEqual({ x: -6, y: -6 });
    expect(o?.feet).toBe(30);
    expect(o?.provokes).toEqual([]);
    expect(o?.summary).toBe("Disengage: move 30 ft to a square 35 ft from the nearest enemy, with no opportunity attacks");
  });

  it("is not offered when no enemy that could take an opportunity attack has it in reach", () => {
    // Chicory is 5 squares away: nobody threatens the Ogre.
    expect(find(run({ combatants: [ogre(), chicory(6, 0)] }), "disengage")).toBeUndefined();
  });

  it("is not offered when the only enemy beside it has spent its reaction or cannot act", () => {
    expect(find(run({ combatants: [ogre(), chicory(1, 0, { reactionUsed: true })] }), "disengage")).toBeUndefined();
    expect(find(run({ combatants: [ogre(), chicory(1, 0, { conditions: [{ name: "Paralyzed" }] as RunCombatant["conditions"] })] }), "disengage")).toBeUndefined();
  });

  // PHB 2014 ch. 9 "Surprise": the surprised enemy cannot react yet, so nothing threatens the Ogre; under 2024 it can.
  it("fails if a surprised 2014 enemy still counts as a threat to disengage from, or a 2024 one does not", () => {
    expect(find(run({ combatants: [ogre(), chicory(1, 0, { surprised: true })] }), "disengage")).toBeUndefined();
    expect(find(run({ ruleset: "2024", combatants: [ogre(), chicory(1, 0, { surprised: true })] }), "disengage")).toBeDefined();
  });

  it("is not offered when no reachable square is farther from the enemy than where it stands", () => {
    // Speed 0 (a grappled creature): the only square is the one it stands on.
    expect(find(run({ combatants: [ogre(), chicory(1, 0)], budgetFeet: 0 }), "disengage")).toBeUndefined();
  });
});

describe("rule 4: dodge", () => {
  it("is always offered, standing where it stands, even with nothing else to do", () => {
    const options = run({ combatants: [ogre(), fresco(40, 40)], attacks: [] });
    const dodge = find(options, "dodge");
    expect(dodge).toMatchObject({ kind: "dodge", destination: { x: 0, y: 0 }, feet: 0 });
    expect(dodge?.summary).toBe("Dodge: stay put and take the Dodge action");
  });
});

describe("rule 5: hide", () => {
  // A wall along x=2 from y=1 to y=10, with Fresco at (4,0) east of it. Squares west of the wall from row 2 down have
  // no line to Fresco: the line to the nearest corner crosses x=2 at y >= 1.015, inside the wall. Row 1 and row 0 do
  // not (a line crosses x=2 above y=1).
  const WALL = mapOf([[[2, 1], [2, 10]]]);

  it("moves to the nearest square with total cover against every hostile", () => {
    // Row 2 is 2 steps from (0,0): 10 ft. (-1,2) is too far west: the line from Fresco's corner crosses x=2 at y 0.81,
    // above the wall's end. (0,2) and (1,2) qualify at 10 ft; the left one wins.
    const o = find(run({ combatants: [ogre(), fresco(4, 0)], map: WALL }), "hide");
    expect(o?.feet).toBe(10);
    expect(o?.destination).toEqual({ x: 0, y: 2 });
    expect(o?.exposure).toEqual([{ enemyId: "fresco", cover: "total" }]);
    expect(o?.summary).toBe("Hide: move 10 ft to a square where no enemy has a line, then take the Hide action");
  });

  it("is not offered when there is nobody to hide from", () => {
    // Alone on the field: "total cover against every enemy" is vacuously true, but there is nothing to hide from.
    expect(find(run({ combatants: [ogre()], map: WALL }), "hide")).toBeUndefined();
  });

  it("is not offered on open ground", () => {
    expect(find(run({ combatants: [ogre(), fresco(4, 0)] }), "hide")).toBeUndefined();
  });

  it("is not offered when a second enemy still sees every square that hides it from the first", () => {
    // Chicory (-3,6) stands in the open on the west side of the wall.
    expect(find(run({ combatants: [ogre(), fresco(4, 0), chicory(-3, 6)], map: WALL }), "hide")).toBeUndefined();
  });
});
