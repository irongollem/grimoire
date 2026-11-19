/** Rule 10: Flee, from the enemy, from a spell, and off the map. */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import type { MapExit } from "../../../../lib/battlemap/mapExits.ts";
import type { FightMap } from "../battleMap.ts";
import { fleeSourceOf } from "./flee.ts";
import { mapOf, ogre, fresco, chicory, run, find } from "./turnOptionsTestKit.ts";

describe("rule 10: flee", () => {
  it("dashes to the square farthest from the nearest enemy, with twice the budget, and says what it provokes", () => {
    // Ogre (0,0), Chicory (1,0) beside it with her reaction free. The doubled budget is 60 ft: 12 steps west reaches
    // x=-12, whose cell is 13 steps (65 ft) from Chicory's. Every square of column x=-12, y -12..12 costs 60 ft, is 65 ft
    // away, and leaves Chicory's reach at the first step (one opportunity attack); the top row wins, (-12,-12).
    const o = find(run({ combatants: [ogre(), chicory(1, 0)] }), "flee");
    expect(o?.destination).toEqual({ x: -12, y: -12 });
    expect(o?.feet).toBe(60);
    expect(o?.provokes).toEqual([{ enemyId: "chicory", step: 0 }]);
    expect(o?.summary).toBe("Flee: dash 60 ft away, ending 65 ft from the nearest enemy; provokes an opportunity attack from Chicory");
  });

  it("never flees off the picture: the farthest square is the farthest ON the map", () => {
    // Bug it fails on: a search with no edge, which sent a fleeing creature to x = -10. A picture 6 squares across and as
    // tall (x and y 0 to 5). Ogre (1,1), Chicory (2,1) beside it. With 60 ft every square of the map is in reach, and the
    // distance from Chicory is the larger gap of the two axes: only row 5 gives 4 ((0,5) is 2 across and 4 down, (5,5) is
    // 3 across and 4 down); column 5 gives 3. Ties go to the top row then the left column, so (0,5).
    const bounded: FightMap = { ...mapOf(), bounds: { minX: 0, minY: 0, maxX: 5, maxY: 5 } };
    const o = find(run({ combatants: [ogre(1, 1), chicory(2, 1)], map: bounded }), "flee");
    expect(o?.destination).toEqual({ x: 0, y: 5 });
  });

  it("without the picture's height, flees only over rows that are known to exist", () => {
    // Bug it fails on: treating an unknown height as unbounded, which is what ran a creature off the picture. Nothing is
    // known of the rows except where the two creatures stand (both on row 1), so rows 0 and 1 are the whole map: the
    // farthest square from Chicory (2,1) in columns 0 to 5 is column 5, three across; of (5,0) and (5,1) the top row wins.
    const unknown: FightMap = { ...mapOf(), bounds: { minX: 0, minY: 0, maxX: 5, maxY: -1 }, rowsKnown: false };
    const o = find(run({ combatants: [ogre(1, 1), chicory(2, 1)], map: unknown }), "flee");
    expect(o?.destination).toEqual({ x: 5, y: 0 });
  });

  it("measures from the NEAREST of the enemies, not from the first one listed or from one alone", () => {
    // Budget 5 ft, so a flee reaches 2 steps: x and y in -2..2. Ogre (0,0), Fresco (-4,-4) listed first, Chicory (1,0).
    // Steps to the nearer enemy from each candidate: x=-2 squares are 3 from Chicory; from Fresco (-2,-2) is 2 steps
    // away, (-2,-1) is 3, (-2,0) 4, (-2,1) 5, (-2,2) 6. So (-2,-2) is only 2 from its nearest enemy and drops out; the best
    // is 3, at (-2,-1) to (-2,2), 10 ft each, with no cover and one opportunity attack from Chicory each: top row (-2,-1).
    // Chicory alone would give (-2,-2); Fresco alone would give (2,2).
    const o = find(run({ combatants: [ogre(), fresco(-4, -4), chicory(1, 0)], budgetFeet: 5 }), "flee");
    expect(o?.destination).toEqual({ x: -2, y: -1 });
  });

  it("prefers the square where it has cover from the enemy when several are equally far", () => {
    // Budget 5 ft, so a flee reaches 2 steps (10 ft). Ogre (0,0), Chicory (1,0). The squares farthest away are x=-2,
    // y -2..2 (3 steps, 15 ft); without a tie-break the top row, (-2,-2), wins. A pillar (a wall across x=-1 at
    // y 0.2 to 0.8, between the Ogre's start and Chicory's square) hides the squares behind it from Chicory, so one
    // of them is better covered than the open top-left square.
    const pillar = mapOf([[[-1, 0.2], [-1, 0.8]]]);
    const o = find(run({ combatants: [ogre(), chicory(1, 0)], map: pillar, budgetFeet: 5 }), "flee");
    expect(o?.exposure).toEqual([{ enemyId: "chicory", cover: expect.not.stringMatching(/^none$/) }]);
  });

  it("prefers the square that provokes fewer opportunity attacks when equally far and equally covered", () => {
    // Budget 5 ft: a flee reaches 2 steps. Ogre (0,0), Chicory (1,0) beside it (reach 5). Fresco (0,10) is far off but has
    // a 50 ft reach, which still holds the start (10 steps = 50 ft). The squares farthest from the nearest enemy are
    // x=-2, y -2..2, each 3 steps from Chicory. Their distance to Fresco is max(2, 10 - y) steps: for y=-2 and y=-1 that
    // is 12 and 11 steps (60 and 55 ft), outside Fresco's reach, so the dash leaves it and provokes her too; for
    // y=0, 1, 2 it is 10, 9, 8 steps (50, 45, 40 ft), inside it, so only Chicory is provoked. The top row of all five is
    // (-2,-2) and provokes twice. (-2,0) is reached by the search through (-1,-1), 55 ft from Fresco, so the step
    // out and back in provokes her as well; the first square that provokes only Chicory is (-2,1).
    const reachOf = (c: RunCombatant) => (c.instance_id === "fresco" ? 50 : 5);
    const o = find(run({ combatants: [ogre(), chicory(1, 0), fresco(0, 10)], budgetFeet: 5, reachOf }), "flee");
    expect(o?.provokes.map((p) => p.enemyId)).toEqual(["chicory"]);
    expect(o?.destination).toEqual({ x: -2, y: 1 });
  });

  it("is not offered when the Action is spent, since a Dash is an Action", () => {
    expect(find(run({ combatants: [ogre(0, 0, { action_used: true }), chicory(1, 0)] }), "flee")).toBeUndefined();
  });

  it("is not offered with nobody to flee from", () => {
    expect(find(run({ combatants: [ogre()] }), "flee")).toBeUndefined();
    expect(find(run({ combatants: [ogre(), chicory(1, 0, { hp: 0 })] }), "flee")).toBeUndefined();
  });

  it("is not offered when no reachable square is farther from the enemy than where it stands", () => {
    // Speed 0: the only square is the one it stands on.
    expect(find(run({ combatants: [ogre(), chicory(1, 0)], budgetFeet: 0 }), "flee")).toBeUndefined();
  });

  it("is not offered when nothing can be measured", () => {
    expect(find(run({ combatants: [ogre(), chicory(1, 0)], map: null }), "flee")).toBeUndefined();
  });
});

// SRD 5.1 Fear: "a creature must take the Dash action and move away from you by the safest available route on each of its
// turns, unless there is nowhere to move." RULE flee-by-spell (app convention).
describe("rule 10: flee from the caster of a spell (flee-by-spell)", () => {
  const frightened = (by: string) => ({ name: "Frightened", source: { id: by, spell: "Fear", mustFlee: true } });

  // Ogre (0,0), Chicory (1,0) beside it and Fresco (-3,0) on its other side, nearer to where it would run. With a Dash of 60 ft
  // it flees from Chicory alone to the far west... which Fresco is near: from Fresco alone it runs east. Bug caught: the flight
  // measures from the nearest enemy (as a morale flee does), so a creature afraid of Chicory runs from whoever is closest.
  it("runs from the one creature that frightens it, not from its nearest enemy", () => {
    const afraid = run({ combatants: [ogre(0, 0, { conditions: [frightened("fresco")] }), chicory(1, 0), fresco(-3, 0)] });
    const from = find(afraid, "flee");
    // Away from Fresco (west of it): east, past Chicory. Measuring from the nearest enemy would have kept it between them.
    expect(from?.destination?.x).toBeGreaterThan(0);
    expect(from?.summary).toContain("from Fresco");
    const plain = find(run({ combatants: [ogre(), chicory(1, 0), fresco(-3, 0)] }), "flee");
    expect(plain?.summary).toContain("from the nearest enemy");
  });

  // Bug caught: a creature afraid of a caster takes the way off the map nearest it, which can be behind the caster, instead of getting away from the caster.
  it("never leaves by a way off the map", () => {
    // The gate at (15,2) is in reach of the Dash (a morale flee would end on it and leave); the caster stands on the gate's far side.
    const map: FightMap = { ...mapOf(), bounds: { minX: 0, minY: 0, maxX: 19, maxY: 4 }, exits: [{ cell: "15,2", label: "East gate", kind: "entrance" }] };
    const combatants = (conditions: RunCombatant["conditions"]) => [ogre(10, 2, { conditions }), chicory(9, 2)];
    expect(find(run({ combatants: combatants([]), map }), "flee")?.leavesMap).toBe(true);
    const o = find(run({ combatants: combatants([frightened("chicory")]), map }), "flee");
    expect(o?.leavesMap).toBe(false);
  });

  // Bug caught: a creature keeps running from a caster who is down or gone, so a dead mage's fear never ends.
  it("is a plain morale-style flee once the caster is gone or at 0 hit points", () => {
    expect(fleeSourceOf(ogre(0, 0, { conditions: [frightened("fresco")] }), [ogre(), chicory(1, 0)])).toBeNull();
    expect(fleeSourceOf(ogre(0, 0, { conditions: [frightened("chicory")] }), [ogre(), chicory(1, 0, { hp: 0 })])).toBeNull();
    expect(fleeSourceOf(ogre(0, 0, { conditions: [frightened("chicory")] }), [ogre(), chicory(1, 0)])?.instance_id).toBe("chicory");
  });

  // Bug caught: every Frightened creature is made to run (the flag is read off the condition's name instead of its source).
  it("is not forced by a Frightened condition whose source does not say it", () => {
    expect(fleeSourceOf(ogre(0, 0, { conditions: [{ name: "Frightened", source: { id: "chicory", spell: "Fear" } }] }), [ogre(), chicory(1, 0)])).toBeNull();
  });
});

describe("rule 10: flee by a way off the map (#1203)", () => {
  const gate = (cell: string, label: string | null = null): MapExit => ({ cell, label, kind: "entrance" });
  const edge = (cell: string): MapExit => ({ cell, label: null, kind: "edge" });
  // A map 20 across and 5 tall (x 0-19, y 0-4) with the given ways off and walls.
  const mapWith = (exits: MapExit[], walls: [[number, number], [number, number]][] = []): FightMap => ({
    ...mapOf(walls), bounds: { minX: 0, minY: 0, maxX: 19, maxY: 4 }, exits,
  });

  it("ends ON a way off it can reach this turn, rather than just far from the enemy, and leaves the map", () => {
    // Bug it fails on: ignoring ways off, which ends on the farthest square from Chicory and never leaves. Ogre (10,2),
    // Chicory (9,2) beside it to the west; the dash is 60 ft (12 steps). The gate at (15,2) is 5 steps, 25 ft. The farthest
    // square from Chicory would be x=19 instead.
    const o = find(run({ combatants: [ogre(10, 2), chicory(9, 2)], map: mapWith([gate("15,2", "East gate")]) }), "flee");
    expect(o).toMatchObject({ destination: { x: 15, y: 2 }, feet: 25, leavesMap: true, exitLabel: "East gate", exitKind: "entrance" });
    expect(o?.summary).toBe('Flee: dash 25 ft and leave the map through "East gate"; provokes an opportunity attack from Chicory');
  });

  it("takes the nearest way off by cost, not the first listed or the farthest", () => {
    // Bug it fails on: taking exits[0]. Far gate (18,2) is listed first: 8 steps, 40 ft. Near gate (12,2): 2 steps, 10 ft.
    const o = find(run({ combatants: [ogre(10, 2), chicory(9, 2)], map: mapWith([gate("18,2", "Far"), gate("12,2", "Near")]) }), "flee");
    expect(o).toMatchObject({ destination: { x: 12, y: 2 }, feet: 10, exitLabel: "Near" });
  });

  it("among ways off at the same cost, the top-left one", () => {
    // Bug it fails on: an arbitrary tie. Ogre (10,2): gates at (12,1) and (12,3) both cost 2 steps; Chicory is far west.
    const o = find(run({ combatants: [ogre(10, 2), chicory(0, 2)], map: mapWith([gate("12,3"), gate("12,1")]) }), "flee");
    expect(o?.destination).toEqual({ x: 12, y: 1 });
  });

  it("a creature that already stands on a way off leaves without moving", () => {
    // Bug it fails on: demanding a move, so a goblin standing in the gate could not use it. Ogre on (3,2) which is a gate.
    const o = find(run({ combatants: [ogre(3, 2), chicory(2, 2)], map: mapWith([gate("3,2")]) }), "flee");
    expect(o).toMatchObject({ destination: { x: 3, y: 2 }, feet: 0, leavesMap: true });
    expect(o?.summary).toBe("Flee: leave the map through the entrance");
  });

  it("open country's edge reads as over the edge of the map, with no name", () => {
    // Bug it fails on: naming an edge like a gate. Ogre (17,2) is 2 steps from the right edge x=19.
    const o = find(run({ combatants: [ogre(17, 2), chicory(16, 2)], map: mapWith([edge("19,2")]) }), "flee");
    expect(o).toMatchObject({ destination: { x: 19, y: 2 }, leavesMap: true, exitLabel: null, exitKind: "edge" });
    expect(o?.summary).toContain("leave the map over the edge of the map");
  });

  it("a creature that covers a way off with any square leaves, not only by its top-left", () => {
    // Bug it fails on: testing the anchor alone, so a Large creature could never use a gate at the edge. A Large ogre
    // (2x2) must end inside the map: anchors (18,1) and (18,2) both cover x 18-19 and the edge cell (19,2); 3 steps, 15 ft, and the top one wins the tie. Ogre (15,2), Chicory (13,2).
    const large = ogre(15, 2, { size: "large" });
    const o = find(run({ combatants: [large, chicory(13, 2)], map: mapWith([edge("19,2")]) }), "flee");
    expect(o?.leavesMap).toBe(true);
    expect(o?.destination).toEqual({ x: 18, y: 1 });
    expect(o?.feet).toBe(15);
  });

  it("with no way to reach one this turn it walks the shortest way toward it, and says how far short", () => {
    // Bug it fails on: ending on the square farthest from the enemy (or leaving at all). Ogre (5,2), Chicory (4,2), the gate
    // at (19,2): 14 steps = 70 ft, the dash 60 ft. A one-row corridor (y 2 only) so the walk is the straight line: it ends
    // at (17,2), 12 steps, and is 10 ft short. Chicory is beside it, so the first step provokes.
    const narrow: FightMap = { ...mapWith([gate("19,2", "Far gate")]), bounds: { minX: 0, minY: 2, maxX: 19, maxY: 2 } };
    const o = find(run({ combatants: [ogre(5, 2), chicory(4, 2)], map: narrow }), "flee");
    expect(o).toMatchObject({ destination: { x: 17, y: 2 }, feet: 60, leavesMap: false, exitLabel: null });
    expect(o?.summary).toBe('Flee: dash 60 ft toward "Far gate", 10 ft short of it; provokes an opportunity attack from Chicory');
  });

  it("measures the walk around a wall, not through it", () => {
    // Bug it fails on: straight-line distance to the way off. A wall on x=7 from y=0 to y=4 closes rows 0-3 (row 4 is open);
    // the gate is at (8,0), 2 squares from Ogre (6,0) across the wall but a 9-step walk away: down column 6 to row 4,
    // across at (7,4), and back up column 8. Budget 5 ft, so the dash is 2 steps. The walk's second square is on row 2
    // ((6,2) or (5,2), both 2 steps down); the squares nearest the gate in a straight line are (6,0) and (6,1), on rows 0-1.
    // The remaining walk from there is 7 steps, 35 ft.
    const walled = mapWith([gate("8,0", "Gate")], [[[7, 0], [7, 4]]]);
    const o = find(run({ combatants: [ogre(6, 0), chicory(0, 0)], map: walled, budgetFeet: 5 }), "flee");
    expect(o).toMatchObject({ feet: 10, leavesMap: false });
    expect(o?.destination?.y).toBe(2);
    expect(o?.summary).toContain("35 ft short of it");
  });

  it("a way off no walk can reach is no way off: it flees from the enemy as before", () => {
    // Bug it fails on: offering nothing (or a walk into the wall) when every way off is sealed away. A wall on x=7 closes
    // the whole map (y -1 to 6); the gate (9,2) is on the far side. Ogre (5,2), Chicory (4,2): the old rule applies.
    const sealed = mapWith([gate("9,2")], [[[7, -1], [7, 6]]]);
    const o = find(run({ combatants: [ogre(5, 2), chicory(4, 2)], map: sealed }), "flee");
    expect(o?.leavesMap).toBe(false);
    expect(o?.destination?.x).toBeLessThanOrEqual(6);
    expect(o?.summary).toContain("away, ending");
  });

  it("a map with no way off flees from the enemy, and the option does not leave", () => {
    // Bug it fails on: marking every flee as leaving. Same geometry as the first test with no gate: the farthest square.
    const o = find(run({ combatants: [ogre(10, 2), chicory(9, 2)], map: mapWith([]) }), "flee");
    expect(o?.leavesMap).toBe(false);
    expect(o?.exitLabel).toBeNull();
    expect(o?.destination?.x).toBe(19);
  });

  it("no other kind of turn is ever offered a way off", () => {
    // Bug it fails on: marking any option that ends on a gate as leaving. Ogre (10,2) with Fresco standing at (13,2) on the
    // far side of a gate at (12,2): the attack option ends beside Fresco, the dash does not, and neither leaves.
    const options = run({ combatants: [ogre(10, 2), fresco(13, 2)], map: mapWith([gate("12,2")]) });
    for (const o of options.filter((x) => x.kind !== "flee")) expect(o.leavesMap).not.toBe(true);
  });
});
