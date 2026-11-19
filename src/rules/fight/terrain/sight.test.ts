import { describe, expect, it } from "vitest";
import { NO_OCCLUDERS, occluders, type Occluders } from "../../../lib/battlemap/occlusion.ts";
import type { WallSegment } from "../../../lib/battlemap/walls.ts";
import type { FactionDef, RunCombatant } from "../../../types/encounter.types.ts";
import type { AttackStructure } from "../../../types/statBlock.types.ts";
import {
  attackFrom,
  coverBetween,
  coverBonus,
  boxesWithinFiveFeet,
  distanceFeet,
  opportunityAttacks,
  rangedAttackFacts,
  type Box,
  type HostileNearby,
  type OpportunityEnemy,
} from "./sight.ts";

// All maps are drawn in cell units, x to the right, y down; a medium creature at anchor (x,y) fills the square
// from (x,y) to (x+1,y+1). A wall is written as its two end points.
const box = (x: number, y: number, footprint = 1): Box => ({ anchor: { x, y }, footprint });
const walls = (...w: [[number, number], [number, number]][]): Occluders =>
  occluders({ walls: w.map(([a, b], i): WallSegment => ({ id: `w${i}`, a, b })), doors: [], solid: [] });
const atk = (delivery: AttackStructure["delivery"], o: Partial<AttackStructure> = {}): AttackStructure => ({
  delivery,
  bonus: 0,
  hit: [],
  ...o,
});

describe("boxesWithinFiveFeet", () => {
  // Worked by hand: 5 ft is one square; two spaces are within 5 ft when the empty gap between them (the larger of the
  // two axis gaps) is under one square.
  it.each<[string, Box, Box, boolean]>([
    ["same square (overlap)", box(2, 2), box(2, 2), true],
    ["side by side, touching", box(0, 0), box(1, 0), true],
    ["diagonal corner, touching", box(0, 0), box(1, 1), true],
    ["one empty square between", box(0, 0), box(2, 0), false],
    ["one empty square between on the diagonal", box(0, 0), box(2, 2), false],
    ["Large (2) and Medium one square past its edge", box(0, 0, 2), box(2, 0), true],
    ["Large (2) and Medium with a square gap", box(0, 0, 2), box(3, 0), false],
    ["Huge (3) diagonal past its corner", box(0, 0, 3), box(3, 3), true],
    ["Huge (3) overlapping a Medium inside it", box(0, 0, 3), box(1, 1), true],
    ["Tiny (0.5) with half a square to a Medium", box(0, 0, 0.5), box(1, 0), true],
    ["Tiny (0.5) with a full square to a Medium", box(0, 0, 0.5), box(2, 0), false],
  ])("%s", (_name, a, b, expected) => {
    expect(boxesWithinFiveFeet(a, b)).toBe(expected);
    expect(boxesWithinFiveFeet(b, a)).toBe(expected);
    expect(distanceFeet(a, b) <= 5).toBe(expected);
  });
});

describe("distanceFeet", () => {
  it("counts a diagonal neighbour as 5 ft, not 7 (PHB grid rule), and a one-square gap as 10", () => {
    // A at (0,0). B at (1,1) touches at a corner: 5 ft. C at (2,0): one empty square (1,0) between: 10 ft.
    expect(distanceFeet(box(0, 0), box(1, 1))).toBe(5);
    expect(distanceFeet(box(0, 0), box(2, 0))).toBe(10);
  });
  it("uses the larger axis gap, not the sum", () => {
    // (0,0) to (5,3): x gap 4, y gap 2 empty squares; the larger is 4, so 5 squares = 25 ft.
    expect(distanceFeet(box(0, 0), box(5, 3))).toBe(25);
  });
  it("measures between edges of a big creature, not between its anchor cells", () => {
    // Large (2 wide) at (0,0) fills x 0..2. A medium at (3,0) has one empty square (x=2) between: 10 ft.
    expect(distanceFeet(box(0, 0, 2), box(3, 0))).toBe(10);
  });
  it("calls a Tiny token under a square away 5 ft, as withinFiveFeet does, and 1.5 squares of gap 10 ft", () => {
    // Tiny (half square) at (0,0) fills x 0..0.5; medium at (1,0): gap 0.5 -> still 'within five feet' -> 5 ft.
    expect(distanceFeet(box(0, 0, 0.5), box(1, 0))).toBe(5);
    // Medium at (2,0): gap 1.5 whole squares floor to 1 -> 10 ft.
    expect(distanceFeet(box(0, 0, 0.5), box(2, 0))).toBe(10);
  });
});

describe("coverBonus", () => {
  it("gives +2 for half and +5 for three-quarters to both AC and Dex saves, nothing for none", () => {
    expect(coverBonus("none")).toEqual({ ac: 0, dexSave: 0 });
    expect(coverBonus("half")).toEqual({ ac: 2, dexSave: 2 });
    expect(coverBonus("three_quarters")).toEqual({ ac: 5, dexSave: 5 });
  });
});

describe("coverBetween", () => {
  it("is none in the open", () => {
    expect(coverBetween(box(0, 0), box(3, 0), NO_OCCLUDERS, [])).toBe("none");
  });

  it("is half when a short wall on the target's near edge blocks two of the four lines", () => {
    // Attacker (0,0), target (3,0). A wall on x=3 from y=0 to 0.5 (the top half of the target's near edge).
    // From every attacker corner the lines to the target's two top corners cross x=3 near y=0 and are blocked;
    // the lines to its two bottom corners cross near y=0.99 and are clear. Two blocked = half.
    expect(coverBetween(box(0, 0), box(3, 0), walls([[3, 0], [3, 0.5]]), [])).toBe("half");
  });

  it("is three-quarters when three of four lines are blocked and one is still clear", () => {
    // Same map plus a wall at x=3.5 through the whole square, which hides both right-hand corners. The wall at x=3
    // (top half) hides the top-left corner. Only the bottom-left corner (3.01, 0.99) is reachable: 3 blocked.
    const occ = walls([[3, 0], [3, 0.5]], [[3.5, 0], [3.5, 1]]);
    expect(coverBetween(box(0, 0), box(3, 0), occ, [])).toBe("three_quarters");
  });

  it("is total when every line is blocked", () => {
    // A full-height wall on x=2 between the two rows' only square.
    expect(coverBetween(box(0, 0), box(3, 0), walls([[2, 0], [2, 1]]), [])).toBe("total");
  });

  it("lets the attacker pick the corner with the least cover", () => {
    // Wall on x=2 from y=0 to 0.2. Standing at its bottom corner (y=0.99) the attacker sees all four corners of the
    // target past the wall's end (the steepest line crosses x=2 at y=0.34): none. From a top corner a line is blocked.
    // A rule that took the worst corner would say half.
    expect(coverBetween(box(0, 0), box(3, 0), walls([[2, 0], [2, 0.2]]), [])).toBe("none");
  });

  it("lets the attacker pick the target square with the least cover", () => {
    // Large target at (3,0) fills (3..5, 0..2). A wall on x=3 from y=0 to 1 shields only its top-left square; the
    // square at (3,1) is open, so there is no cover.
    expect(coverBetween(box(0, 0), box(3, 0, 2), walls([[3, 0], [3, 1]]), [])).toBe("none");
  });

  it("counts a wall on the near edge of the target's square as blocking", () => {
    // Attacker (0,0), target (1,0) next to it, wall on x=1 between them: every line crosses it.
    expect(coverBetween(box(0, 0), box(1, 0), walls([[1, 0], [1, 1]]), [])).toBe("total");
  });

  it("does not count a wall on the far edge of the target's square", () => {
    // Target (1,0) fills x 1..2; the wall on x=2 is behind it, lines end at x=1.99.
    expect(coverBetween(box(0, 0), box(1, 0), walls([[2, 0], [2, 1]]), [])).toBe("none");
  });

  it("does not count a wall on the attacker's own back edge", () => {
    // Attacker (1,0) fills x 1..2; a wall on its left edge x=1. All lines start at x=1.01 and run right.
    expect(coverBetween(box(1, 0), box(4, 0), walls([[1, 0], [1, 1]]), [])).toBe("none");
  });

  it("gives half cover for a creature standing on the line", () => {
    // Attacker (0,0), another creature at (1,0), target (2,0): every line crosses square (1,0).
    expect(coverBetween(box(0, 0), box(2, 0), NO_OCCLUDERS, [box(1, 0)])).toBe("half");
  });

  it("ignores a creature that is not on any line", () => {
    // A creature at (1,1) is below the row the lines run in (y 0.01..0.99).
    expect(coverBetween(box(0, 0), box(2, 0), NO_OCCLUDERS, [box(1, 1)])).toBe("none");
  });

  it("never lets a creature lower the cover walls already give", () => {
    // The three-quarters map with a creature at (1,0) as well: walls decide, still three-quarters, not half.
    const occ = walls([[3, 0], [3, 0.5]], [[3.5, 0], [3.5, 1]]);
    expect(coverBetween(box(0, 0), box(3, 0), occ, [box(1, 0)])).toBe("three_quarters");
  });

  it("never makes a creature total cover", () => {
    // Two creatures filling the whole row between attacker (0,0) and target (3,0) still leave half cover at most.
    expect(coverBetween(box(0, 0), box(3, 0), NO_OCCLUDERS, [box(1, 0), box(2, 0)])).toBe("half");
  });
});

describe("attackFrom: melee", () => {
  const from = (target: Box, attack: AttackStructure, occ: Occluders = NO_OCCLUDERS) =>
    attackFrom({ attacker: box(0, 0), attack, target, occluders: occ, others: [], hostiles: [] });

  it("reaches a creature exactly as far as its reach and no further", () => {
    // Reach 10 ft. Target at (2,0) has one empty square between: 10 ft. Target at (3,0): 15 ft.
    expect(from(box(2, 0), atk("melee", { reach: 10 })).possible).toBe(true);
    const far = from(box(3, 0), atk("melee", { reach: 10 }));
    expect(far).toMatchObject({ possible: false, reason: "out_of_reach", distanceFeet: 15 });
  });

  it("gives a melee attack that names no reach 5 ft (PHB: most creatures)", () => {
    expect(from(box(1, 0), atk("melee")).possible).toBe(true);
    expect(from(box(2, 0), atk("melee"))).toMatchObject({ possible: false, reason: "out_of_reach" });
  });

  it("cannot strike a target behind total cover", () => {
    // Target adjacent at (1,0) with a full wall on x=1 between them.
    const r = from(box(1, 0), atk("melee"), walls([[1, 0], [1, 1]]));
    expect(r).toMatchObject({ possible: false, reason: "total_cover", cover: "total" });
  });

  it("reports out_of_reach before total_cover when both apply", () => {
    const r = from(box(3, 0), atk("melee"), walls([[2, 0], [2, 1]]));
    expect(r.reason).toBe("out_of_reach");
  });

  it("is never long range or close combat", () => {
    const r = attackFrom({
      attacker: box(0, 0),
      attack: atk("melee"),
      target: box(1, 0),
      occluders: NO_OCCLUDERS,
      others: [],
      hostiles: [{ box: box(0, 1), incapacitated: false }],
    });
    expect(r).toMatchObject({ possible: true, longRange: false, closeCombat: false });
  });
});

describe("attackFrom: ranged", () => {
  const bow = atk("ranged", { range: { normal: 30, long: 120 } });
  // Target at (n,0): the gap is n-1 squares so the distance is 5n ft.
  const at = (n: number, attack = bow, hostiles: HostileNearby[] = [], occ: Occluders = NO_OCCLUDERS) =>
    attackFrom({ attacker: box(0, 0), attack, target: box(n, 0), occluders: occ, others: [], hostiles });

  it("is not long range at exactly the normal range, and is one square further", () => {
    // n=6 is 30 ft (normal); n=7 is 35 ft (long).
    expect(at(6)).toMatchObject({ possible: true, longRange: false, distanceFeet: 30 });
    expect(at(7)).toMatchObject({ possible: true, longRange: true, distanceFeet: 35 });
  });

  it("stops at the long range", () => {
    // n=24 is 120 ft; n=25 is 125 ft.
    expect(at(24).possible).toBe(true);
    expect(at(25)).toMatchObject({ possible: false, reason: "out_of_range" });
  });

  it("stops at the normal range when no long range is listed", () => {
    const thrown = atk("ranged", { range: { normal: 30 } });
    expect(at(6, thrown).possible).toBe(true);
    expect(at(7, thrown)).toMatchObject({ possible: false, reason: "out_of_range" });
  });

  it("refuses a ranged attack that lists no range instead of guessing one", () => {
    expect(at(2, atk("ranged"))).toMatchObject({ possible: false, reason: "out_of_range" });
  });

  it("cannot target a creature behind total cover", () => {
    expect(at(3, bow, [], walls([[2, 0], [2, 1]]))).toMatchObject({ possible: false, reason: "total_cover" });
  });

  it("is close combat when a conscious hostile with a clear line is within 5 ft", () => {
    // Attacker (0,0); hostile (0,1) directly below, touching.
    expect(at(4, bow, [{ box: box(0, 1), incapacitated: false }]).closeCombat).toBe(true);
  });

  it("is not close combat when that hostile is Incapacitated", () => {
    expect(at(4, bow, [{ box: box(0, 1), incapacitated: true }]).closeCombat).toBe(false);
  });

  it("is not close combat when the hostile is 10 ft away", () => {
    // Hostile at (0,2): one empty square between.
    expect(at(4, bow, [{ box: box(0, 2), incapacitated: false }]).closeCombat).toBe(false);
  });

  it("is not close combat when a wall cuts the line to the adjacent hostile", () => {
    // Hostile (0,1) below; a wall on y=1 between their squares. The attack lines stay in row 0, so cover is unaffected.
    const r = at(4, bow, [{ box: box(0, 1), incapacitated: false }], walls([[0, 1], [1, 1]]));
    expect(r).toMatchObject({ possible: true, closeCombat: false });
  });
});

describe("attackFrom: melee_or_ranged", () => {
  const both = atk("melee_or_ranged", { range: { normal: 30, long: 120 } });
  const hostiles: HostileNearby[] = [{ box: box(0, 1), incapacitated: false }];
  const at = (n: number) =>
    attackFrom({ attacker: box(0, 0), attack: both, target: box(n, 0), occluders: NO_OCCLUDERS, others: [], hostiles });

  it("is a melee attack (no close-combat penalty) when the target is in reach", () => {
    expect(at(1)).toMatchObject({ possible: true, closeCombat: false, longRange: false });
  });

  it("is a ranged attack, with the close-combat flag, when the target is out of reach", () => {
    expect(at(2)).toMatchObject({ possible: true, closeCombat: true, longRange: false });
  });

  it("is out of reach when it has no range and the target is beyond reach", () => {
    const r = attackFrom({
      attacker: box(0, 0),
      attack: atk("melee_or_ranged"),
      target: box(2, 0),
      occluders: NO_OCCLUDERS,
      others: [],
      hostiles: [],
    });
    expect(r).toMatchObject({ possible: false, reason: "out_of_reach" });
  });
});

describe("opportunityAttacks", () => {
  const enemy = (id: string, x: number, y: number, o: Partial<OpportunityEnemy> = {}): OpportunityEnemy => ({
    id,
    box: box(x, y),
    reachFeet: 5,
    reactionUsed: false,
    incapacitated: false,
    ...o,
  });
  const run = (
    path: [number, number][],
    enemies: OpportunityEnemy[],
    extra: { occ?: Occluders; disengaged?: boolean } = {},
  ) =>
    opportunityAttacks({
      path: path.map(([x, y]) => ({ x, y })),
      moverFootprint: 1,
      enemies,
      occluders: extra.occ ?? NO_OCCLUDERS,
      disengaged: extra.disengaged,
    });

  it("provokes when the mover steps out of a 5 ft reach, at the square it leaves", () => {
    // Enemy at (2,1). Mover (1,1) is adjacent; (0,1) has one empty square between (10 ft): out of reach.
    expect(run([[1, 1], [0, 1]], [enemy("a", 2, 1)])).toEqual([{ enemyId: "a", step: 0 }]);
  });

  it("does not provoke when the mover stays in reach (a diagonal neighbour is still 5 ft)", () => {
    expect(run([[1, 1], [1, 0]], [enemy("a", 2, 1)])).toEqual([]);
  });

  it("does not provoke when the mover never was in reach", () => {
    expect(run([[-2, 1], [-3, 1]], [enemy("a", 2, 1)])).toEqual([]);
  });

  it("measures leaving against the enemy's own reach: 10 ft reach provokes on the second step away", () => {
    // Enemy at (2,1) reach 10. (1,1) 5 ft, (0,1) 10 ft (still in reach), (-1,1) 15 ft (out): provokes at step 1.
    expect(run([[1, 1], [0, 1], [-1, 1]], [enemy("a", 2, 1, { reachFeet: 10 })])).toEqual([
      { enemyId: "a", step: 1 },
    ]);
  });

  it("provokes on leaving even when the path first walked into reach", () => {
    // Enemy (2,1) reach 10. (-1,1) is 15 ft (out), (0,1) is 10 ft (in), (-1,1) again (out): step 1.
    expect(run([[-1, 1], [0, 1], [-1, 1]], [enemy("a", 2, 1, { reachFeet: 10 })])).toEqual([
      { enemyId: "a", step: 1 },
    ]);
  });

  it("provokes an enemy only once per path, because it has one reaction", () => {
    // Out and back in and out again around an enemy at (2,1): first leaving at step 0, second at step 2.
    expect(run([[1, 1], [0, 1], [1, 1], [0, 1]], [enemy("a", 2, 1)])).toEqual([{ enemyId: "a", step: 0 }]);
  });

  it("skips an enemy whose reaction is spent", () => {
    expect(run([[1, 1], [0, 1]], [enemy("a", 2, 1, { reactionUsed: true })])).toEqual([]);
  });

  it("skips an Incapacitated enemy", () => {
    expect(run([[1, 1], [0, 1]], [enemy("a", 2, 1, { incapacitated: true })])).toEqual([]);
  });

  it("provokes nothing after Disengage", () => {
    expect(run([[1, 1], [0, 1]], [enemy("a", 2, 1)], { disengaged: true })).toEqual([]);
  });

  it("does not provoke when a wall hides the mover from the enemy", () => {
    // Wall on x=2 between mover (1,1) and enemy (2,1), running y 0..3.
    expect(run([[1, 1], [0, 1]], [enemy("a", 2, 1)], { occ: walls([[2, 0], [2, 3]]) })).toEqual([]);
  });

  it("does not provoke an enemy the mover only passes alongside", () => {
    // Path down column x=1, (1,0) to (1,3). Enemy b at (2,2) is adjacent or diagonal to (1,1), (1,2), (1,3) and
    // (1,1)..: it is never left within the path, so only a at (2,0) (adjacent at (1,0),(1,1), out at (1,2)) provokes, step 1.
    expect(run([[1, 0], [1, 1], [1, 2], [1, 3]], [enemy("b", 2, 2), enemy("a", 2, 0)])).toEqual([
      { enemyId: "a", step: 1 },
    ]);
  });

  it("lists two provoked enemies in step order, not input order", () => {
    // Column x=1, path (1,0) to (1,5), enemies at (2,0) and (2,3).
    // a (2,0): adjacent only at (1,0),(1,1); out at (1,2): provoked at step 1.
    // b (2,3): adjacent at (1,2),(1,3),(1,4); out at (1,5): provoked at step 4.
    const path: [number, number][] = [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [1, 5]];
    expect(run(path, [enemy("b", 2, 3), enemy("a", 2, 0)])).toEqual([
      { enemyId: "a", step: 1 },
      { enemyId: "b", step: 4 },
    ]);
  });
});

describe("rangedAttackFacts", () => {
  const person = (id: string, faction: string, x: number, y: number, over: Partial<RunCombatant> = {}): RunCombatant => ({
    instance_id: id, type: "monster", name: id, faction_id: faction, initiative: 10, hp: 10, max_hp: 10, ac: "12", conditions: [], curses: [],
    death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x, y }, size: "medium", ...over,
  });
  const factions: Pick<FactionDef, "id" | "hostile_to">[] = [
    { id: "players", hostile_to: ["enemy"] },
    { id: "enemy", hostile_to: ["players"] },
    { id: "neutral", hostile_to: [] },
  ];
  const range = { normal: 30, long: 120 };
  const facts = (attacker: RunCombatant, target: RunCombatant, all: RunCombatant[], occ: Occluders = NO_OCCLUDERS, r: typeof range | null = range) =>
    rangedAttackFacts({ attacker, target, combatants: all, factions, range: r, occluders: occ });
  // Archer at (0,0), target 7 squares away at (7,0): 35 ft by `distanceFeet`.
  const archer = person("archer", "players", 0, 0);
  const far = person("far", "enemy", 7, 0);

  // PHB 2014 ch. 9 "Ranged Attacks in Close Combat": any hostile beside the ATTACKER counts, not only the target.
  it("counts a hostile beside the attacker that is not the target", () => {
    const brute = person("brute", "enemy", 0, 1);
    expect(facts(archer, far, [archer, far, brute]).hostileWithinFiveFeetOfAttacker).toBe(true);
  });
  it("counts the target itself when it stands beside the attacker", () => {
    const near = person("near", "enemy", 1, 0);
    expect(facts(archer, near, [archer, near]).hostileWithinFiveFeetOfAttacker).toBe(true);
  });
  it("does not count a friend, a neutral, or an incapacitated or downed hostile beside the attacker", () => {
    const friend = person("friend", "players", 0, 1);
    const neutral = person("neutral", "neutral", 1, 1);
    const stunned = person("stunned", "enemy", 1, 0, { conditions: [{ name: "Stunned" }] });
    const dead = person("dead", "enemy", 0, 1, { hp: 0 });
    expect(facts(archer, far, [archer, far, friend, neutral, stunned, dead]).hostileWithinFiveFeetOfAttacker).toBe(false);
  });
  it("does not count a hostile beside the TARGET only", () => {
    const guard = person("guard", "enemy", 7, 1);
    expect(facts(archer, far, [archer, far, guard]).hostileWithinFiveFeetOfAttacker).toBe(false);
  });
  it("does not count a hostile a wall cuts off from the attacker", () => {
    const brute = person("brute", "enemy", 0, 1);
    expect(facts(archer, far, [archer, far, brute], walls([[0, 1], [1, 1]])).hostileWithinFiveFeetOfAttacker).toBe(false);
  });
  // PHB 2014 ch. 9 "Long Range": beyond the normal range. 7 squares is 35 ft, 6 squares is 30 ft.
  it("is long range just past the normal range and not at it", () => {
    expect(facts(archer, far, [archer, far]).longRange).toBe(true);
    const at30 = person("at30", "enemy", 6, 0);
    expect(facts(archer, at30, [archer, at30]).longRange).toBe(false);
  });
  it("claims no long range when the attack names no range, and nothing at all off the map", () => {
    expect(facts(archer, far, [archer, far], NO_OCCLUDERS, null).longRange).toBe(false);
    const unplaced = person("unplaced", "enemy", 0, 0, { position: null });
    expect(facts(archer, unplaced, [archer, unplaced])).toEqual({ hostileWithinFiveFeetOfAttacker: false, longRange: false });
  });
});
