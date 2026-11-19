import { describe, expect, it } from "vitest";
import { NO_OCCLUDERS, occluders } from "../../../lib/battlemap/occlusion.ts";
import type { WallSegment } from "../../../lib/battlemap/walls.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { GridCalibration } from "../../../types/location.types.ts";
import type { ActionStructure, AttackStructure, StatBlockEntry } from "../../../types/statBlock.types.ts";
import type { MapExit } from "../../../lib/battlemap/mapExits.ts";
import { castableNow } from "../spells/castNow.ts";
import { fireball, mageBlock } from "../spells/spellTestKit.ts";
import type { FightMap } from "./battleMap.ts";
import {
  compareExposure,
  fleeSourceOf,
  MAX_TURN_OPTIONS,
  turnOptions,
  type TurnOption,
  type TurnOptionsInput,
  type UsableAttack,
} from "./turnOptions.ts";

// Every map is drawn in cell units, x to the right, y down; a Medium creature at anchor (x,y) fills the square from
// (x,y) to (x+1,y+1). Speed 30 ft is 6 squares, so the budget below reaches any square within 6 steps (diagonals
// cost 5 ft like any step). The Ogre (faction "m") is the mover; Fresco and Chicory (faction "p") are its enemies.

const CALIBRATION = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 } as GridCalibration;

// A map far wider than any fight below, so its edge never matters here (the edge has its own tests in reach.test.ts).
const FAR_EDGES = { minX: -50, minY: -50, maxX: 50, maxY: 50 };

function mapOf(walls: [[number, number], [number, number]][] = []): FightMap {
  const occ = walls.length === 0 ? NO_OCCLUDERS : occluders({ walls: walls.map(([a, b], i): WallSegment => ({ id: `w${i}`, a, b })), doors: [], solid: [] });
  return { mapLocationId: "site", occluders: occ, difficult: new Set(), solid: occ.solid, calibration: CALIBRATION, bounds: FAR_EDGES, rowsKnown: true, exits: [] };
}
const OPEN = mapOf();

function creature(id: string, name: string, faction: string, x: number, y: number, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name,
    faction_id: faction,
    initiative: null,
    hp: 20,
    max_hp: 20,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    position: { x, y },
    size: "medium",
    ...over,
  };
}
const ogre = (x = 0, y = 0, over: Partial<RunCombatant> = {}) => creature("ogre", "Ogre", "m", x, y, over);
const fresco = (x: number, y: number, over: Partial<RunCombatant> = {}) => creature("fresco", "Fresco", "p", x, y, over);
const chicory = (x: number, y: number, over: Partial<RunCombatant> = {}) => creature("chicory", "Chicory", "p", x, y, over);

const entry = (name: string, structured: Partial<ActionStructure> & Pick<ActionStructure, "kind">): StatBlockEntry => ({
  name,
  description: "",
  structured: { source: "manual", ...structured },
});
const attackEntry = (name: string, attack: Partial<AttackStructure>): StatBlockEntry =>
  entry(name, { kind: "attack", attack: { delivery: "melee", bonus: 5, hit: [], ...attack } });
const CLUB: UsableAttack = { list: "actions", entry: attackEntry("Greatclub", {}) };

function run(over: Partial<TurnOptionsInput> & Pick<TurnOptionsInput, "combatants">): TurnOption[] {
  return turnOptions({ moverId: "ogre", map: OPEN, budgetFeet: 30, attacks: [CLUB], reachOf: () => 5, ruleset: "2014", ...over });
}
const find = (options: TurnOption[], id: string) => options.find((o) => o.id === id);

describe("rule 1: attack", () => {
  it("moves into reach and says so: 20 ft to a square beside a target 5 squares away, with a stable id", () => {
    // Ogre (0,0), Fresco (5,0). Squares beside Fresco are x=4 (4 steps, 20 ft) or x=6 (6 steps, 30 ft). All three at x=4
    // cost 20 ft and see Fresco the same; the top row wins the tie, (4,-1).
    const o = find(run({ combatants: [ogre(), fresco(5, 0)] }), "attack:actions:Greatclub:fresco");
    expect(o?.destination).toEqual({ x: 4, y: -1 });
    expect(o?.feet).toBe(20);
    expect(o?.attack).toMatchObject({ list: "actions", action: "Greatclub", distanceFeet: 5, cover: "none", longRange: false, closeCombat: false });
    expect(o?.summary).toBe("Move 20 ft to attack Fresco with Greatclub");
  });

  it("attacks from where it stands when already in reach, not from a square it walked to (fewest feet)", () => {
    // Ogre (0,0), Fresco (1,0) beside it. Every square touching Fresco is 5 ft away or more; staying is 0 ft. Without
    // the feet rule the tie falls to the top-left square, (0,-1).
    const o = find(run({ combatants: [ogre(), fresco(1, 0)] }), "attack:actions:Greatclub:fresco");
    expect(o?.feet).toBe(0);
    expect(o?.destination).toEqual({ x: 0, y: 0 });
    expect(o?.summary).toBe("Attack Fresco with Greatclub from where Ogre stands");
  });

  it("prefers the square that provokes nothing over a nearer-looking one that does", () => {
    // Ogre (0,0). Chicory (0,1) is beside it with her reaction free. Fresco (2,0). The squares one step away that touch
    // Fresco are (1,-1), (1,0), (1,1). Chicory's reach covers (1,0) and (1,1) (touching her square), but stepping to (1,-1)
    // leaves it, so it provokes. Ties otherwise go to the top row, which would pick (1,-1).
    const options = run({ combatants: [ogre(), fresco(2, 0), chicory(0, 1)] });
    const o = find(options, "attack:actions:Greatclub:fresco");
    expect(o?.destination).toEqual({ x: 1, y: 0 });
    expect(o?.provokes).toEqual([]);
  });

  it("lists the opportunity attack its path provokes, by enemy and step, in the summary", () => {
    // Ogre (0,0), Chicory (0,1) beside it. Fresco (3,-2): the squares touching it are x=2, y -3..-1, 2 steps from the
    // Ogre, and Chicory's reach ends one square from her: every path leaves it at its first step, from step 0.
    const o = find(run({ combatants: [ogre(), fresco(3, -2), chicory(0, 1)] }), "attack:actions:Greatclub:fresco");
    expect(o?.provokes).toEqual([{ enemyId: "chicory", step: 0 }]);
    expect(o?.summary).toContain("; provokes an opportunity attack from Chicory");
  });

  it("prefers a square that is not at long range", () => {
    // Shortbow: normal 10 ft, long 30 ft. Ogre (0,0), Fresco (4,0): from the start 3 empty squares lie between, so
    // 20 ft, which is long range. Two steps east is 10 ft (normal): the squares at x=2, y -2..2 and the ones
    // beyond are 10 ft or closer; of those costing 10 ft of walking the top row is (2,-2) (gap 1 on both axes, 10 ft).
    // Without the rule the start (0 ft, long range) wins on feet.
    const bow: UsableAttack = { list: "actions", entry: attackEntry("Shortbow", { delivery: "ranged", range: { normal: 10, long: 30 } }) };
    const o = find(run({ combatants: [ogre(), fresco(4, 0)], attacks: [bow] }), "attack:actions:Shortbow:fresco");
    expect(o?.attack?.longRange).toBe(false);
    expect(o?.destination).toEqual({ x: 2, y: -2 });
    expect(o?.feet).toBe(10);
  });

  it("prefers a square where it is not shooting with an enemy within 5 ft", () => {
    // Shortbow normal 60. Ogre (0,0) with Chicory (0,1) beside it, her reaction spent so nothing provokes. Fresco (5,0)
    // is 25 ft off, in range from anywhere. Staying is close combat. One step away to a square 10 ft from Chicory is
    // not: (-1,-1), (0,-1), (1,-1) all qualify and the top-left one wins. Without the rule the start wins on feet.
    const bow: UsableAttack = { list: "actions", entry: attackEntry("Shortbow", { delivery: "ranged", range: { normal: 60 } }) };
    const o = find(run({ combatants: [ogre(), fresco(5, 0), chicory(0, 1, { reactionUsed: true })], attacks: [bow] }), "attack:actions:Shortbow:fresco");
    expect(o?.attack?.closeCombat).toBe(false);
    expect(o?.destination).toEqual({ x: -1, y: -1 });
    expect(o?.feet).toBe(5);
  });

  it("prefers a square where the target has the least cover, even if it costs feet", () => {
    // Shortbow normal 120. Ogre (0,0), Fresco (4,0). A pillar: a wall on x=2 from y=0.2 to y=0.8 sits across the middle
    // of the line between them. With no budget the Ogre must shoot from (0,0): the pillar blocks the line to Fresco's far
    // corners from every corner of the Ogre's square, so Fresco has cover. With 30 ft it walks to a square off the pillar's
    // line and Fresco has none. Without the rule the start wins on feet.
    const bow: UsableAttack = { list: "actions", entry: attackEntry("Shortbow", { delivery: "ranged", range: { normal: 120 } }) };
    const pillar = mapOf([[[2, 0.2], [2, 0.8]]]);
    const fixed = find(run({ combatants: [ogre(), fresco(4, 0)], attacks: [bow], map: pillar, budgetFeet: 0 }), "attack:actions:Shortbow:fresco");
    expect(fixed?.attack?.cover).not.toBe("none");
    const free = find(run({ combatants: [ogre(), fresco(4, 0)], attacks: [bow], map: pillar }), "attack:actions:Shortbow:fresco");
    expect(free?.attack?.cover).toBe("none");
    expect(free?.feet).toBeGreaterThan(0);
  });

  it("prefers the square where the mover itself has cover from the other enemies", () => {
    // Ogre (0,0). Fresco (2,0) is the target; its reach does not touch the Ogre. Chicory sits at (5,0), her reaction
    // spent, straight behind Fresco. The squares touching Fresco, one step away, are (1,-1), (1,0), (1,1). From (1,0) every
    // line from Chicory runs through Fresco's square (half cover for the Ogre); from (1,-1) and (1,1) the lines skim
    // past it and the Ogre has none. The top row would pick (1,-1) without the rule.
    const o = find(run({ combatants: [ogre(), fresco(2, 0), chicory(5, 0, { reactionUsed: true })] }), "attack:actions:Greatclub:fresco");
    expect(o?.destination).toEqual({ x: 1, y: 0 });
    expect(o?.exposure).toEqual([
      { enemyId: "fresco", cover: "none" },
      { enemyId: "chicory", cover: "half" },
    ]);
  });

  it("says in the summary what cover the mover ends with, so a move that only buys cover does not read as a pointless walk", () => {
    // The same scene: the Ogre ends at (1,0) with half cover from Chicory and none from Fresco. Only the cover it
    // has is named; "no cover from Fresco" would be noise.
    const o = find(run({ combatants: [ogre(), fresco(2, 0), chicory(5, 0, { reactionUsed: true })] }), "attack:actions:Greatclub:fresco");
    expect(o?.summary).toContain("ends with half cover from Chicory");
    expect(o?.summary).not.toContain("from Fresco");
  });

  it("offers nothing against a target at total cover from every square it can reach", () => {
    // Fresco (5,0) stands in a closet: walls on all four edges of its square. No line reaches it, so no attack option;
    // Chicory (2,0) is in the open and still gets one.
    const closet = mapOf([[[5, 0], [6, 0]], [[6, 0], [6, 1]], [[6, 1], [5, 1]], [[5, 1], [5, 0]]]);
    const options = run({ combatants: [ogre(), fresco(5, 0), chicory(2, 0)], map: closet });
    expect(find(options, "attack:actions:Greatclub:fresco")).toBeUndefined();
    expect(find(options, "attack:actions:Greatclub:chicory")).toBeDefined();
  });

  it("makes one option per usable attack per target", () => {
    // Two attacks, two hostiles both within a step: four attack options.
    const slam: UsableAttack = { list: "actions", entry: attackEntry("Slam", {}) };
    const options = run({ combatants: [ogre(), fresco(1, 0), chicory(0, 1)], attacks: [CLUB, slam] });
    expect(options.filter((o) => o.kind === "attack").map((o) => o.id).sort()).toEqual([
      "attack:actions:Greatclub:chicory",
      "attack:actions:Greatclub:fresco",
      "attack:actions:Slam:chicory",
      "attack:actions:Slam:fresco",
    ]);
  });

  it("does not offer an attack against a friend, a dead enemy or a downed enemy", () => {
    // Ally (same faction) at (1,0); Fresco at 0 hp at (0,1); Chicory alive at (-1,0).
    const options = run({ combatants: [ogre(), creature("ally", "Ally", "m", 1, 0), fresco(0, 1, { hp: 0 }), chicory(-1, 0)] });
    expect(options.filter((o) => o.kind === "attack").map((o) => o.targetId)).toEqual(["chicory"]);
  });
});

describe("compareExposure", () => {
  const e = (...covers: ("none" | "half" | "three_quarters" | "total")[]) => covers.map((cover, i) => ({ enemyId: `e${i}`, cover }));
  it("judges by the worst-covered enemy first, not by the total", () => {
    // [none, total] has a bare flank; [half, half] has none. The second is better covered even though a sum of ranks
    // (0+3=3) beats (1+1=2).
    expect(compareExposure(e("none", "total"), e("half", "half"))).toBeGreaterThan(0);
    expect(compareExposure(e("half", "half"), e("none", "total"))).toBeLessThan(0);
  });
  it("is a tie for equal exposure in a different order", () => {
    expect(compareExposure(e("none", "half"), e("half", "none"))).toBe(0);
  });
});

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

describe("rule 6: nothing to measure", () => {
  const unmeasured = (over: Partial<TurnOptionsInput>) => run({ combatants: [ogre(), fresco(3, 0), chicory(0, 3)], ...over });
  const expectedShape = (options: TurnOption[]) => {
    expect(options.map((o) => o.id)).toEqual(["attack:actions:Greatclub:fresco", "attack:actions:Greatclub:chicory", "dodge"]);
    for (const o of options.filter((x) => x.kind === "attack")) {
      expect(o).toMatchObject({ destination: null, path: null, feet: null, provokes: [], exposure: [] });
      expect(o.attack).toMatchObject({ distanceFeet: null, cover: null, longRange: null, closeCombat: null });
      expect(o.summary).toMatch(/the distance is not known, so no movement is offered$/);
    }
  };

  it("offers attacks with no facts and Dodge when the fight has no map", () => expectedShape(unmeasured({ map: null })));
  it("does the same when the speed is unknown", () => expectedShape(unmeasured({ budgetFeet: null })));
  it("offers no attack against a friend when nothing can be measured", () => {
    const options = run({ combatants: [ogre(), creature("ally", "Ally", "m", 1, 0), fresco(3, 0)], map: null });
    expect(options.map((o) => o.id)).toEqual(["attack:actions:Greatclub:fresco", "dodge"]);
  });
  it("does the same when the mover has no place on the map", () => {
    expectedShape(unmeasured({ combatants: [ogre(0, 0, { position: null }), fresco(3, 0), chicory(0, 3)] }));
  });
});

describe("rule 7: who gets nothing, and a spent Action", () => {
  it("gets nothing at 0 hit points", () => {
    expect(run({ combatants: [ogre(0, 0, { hp: 0 }), fresco(1, 0)] })).toEqual([]);
  });

  it("gets nothing while Incapacitated or Stunned", () => {
    expect(run({ combatants: [ogre(0, 0, { conditions: [{ name: "Incapacitated" }] as RunCombatant["conditions"] }), fresco(1, 0)] })).toEqual([]);
    expect(run({ combatants: [ogre(0, 0, { conditions: [{ name: "Stunned" }] as RunCombatant["conditions"] }), fresco(1, 0)] })).toEqual([]);
  });

  // PHB 2014 ch. 9 "Surprise": cannot move or take an action on its first turn of the combat.
  // Bug: surprise was only shown and cleared; the app still played the surprised creature's first turn.
  it("gets nothing on round 1 of a 2014 fight while surprised", () => {
    expect(run({ round: 1, combatants: [ogre(0, 0, { surprised: true }), fresco(1, 0)] })).toEqual([]);
  });

  it("gets its options once the first round is over, or when surprised under 2024 (which only costs Initiative)", () => {
    expect(run({ round: 2, combatants: [ogre(0, 0, { surprised: true }), fresco(1, 0)] }).length).toBeGreaterThan(0);
    expect(run({ round: 1, ruleset: "2024", combatants: [ogre(0, 0, { surprised: true }), fresco(1, 0)] }).length).toBeGreaterThan(0);
    expect(run({ round: 1, combatants: [ogre(0, 0), fresco(1, 0)] }).length).toBeGreaterThan(0);
  });

  it("keeps only Bonus Action attacks and a plain move when the Action is spent", () => {
    // Fresco (1,0) is beside the Ogre: a Bonus Action Tail attack reaches it. Chicory (12,0) is out of reach: a plain
    // move of 30 ft toward her, not a Dash. No Dodge, no Disengage, no Hide, no Action attack.
    const tail: UsableAttack = { list: "bonus_actions", entry: attackEntry("Tail", {}) };
    const options = run({ combatants: [ogre(0, 0, { action_used: true }), fresco(1, 0), chicory(12, 0)], attacks: [CLUB, tail] });
    expect(options.map((o) => o.id)).toEqual(["attack:bonus_actions:Tail:fresco", "move:chicory"]);
    expect(find(options, "move:chicory")?.feet).toBe(30);
  });

  it("drops the Bonus Action attacks once the Bonus Action is spent", () => {
    const tail: UsableAttack = { list: "bonus_actions", entry: attackEntry("Tail", {}) };
    const options = run({ combatants: [ogre(0, 0, { action_used: true, bonus_used: true }), fresco(1, 0)], attacks: [tail] });
    expect(options).toEqual([]);
  });
});

describe("rule 8: multiattack", () => {
  const club = attackEntry("Greatclub", {});
  const multi = (steps: { action: string; count: number }[]) => entry("Multiattack", { kind: "multiattack", multiattack: steps });

  it("offers a Multiattack whose steps name attacks on the stat block, with the steps listed", () => {
    const attacks: UsableAttack[] = [
      { list: "actions", entry: multi([{ action: "Greatclub", count: 2 }, { action: "Slam", count: 1 }]) },
      { list: "actions", entry: club },
      { list: "actions", entry: attackEntry("Slam", {}) },
    ];
    const o = find(run({ combatants: [ogre(), fresco(1, 0)], attacks }), "attack:actions:Multiattack:fresco");
    expect(o?.attack?.steps).toEqual([{ action: "Greatclub", count: 2 }, { action: "Slam", count: 1 }]);
    expect(o?.summary).toBe("Attack Fresco with Multiattack (Greatclub x2, Slam) from where Ogre stands");
  });

  it("stands where the first step's attack can reach", () => {
    // The first step is a ranged Javelin (range 60), so it is possible from the start at 25 ft; a melee first step
    // would need a walk.
    const attacks: UsableAttack[] = [
      { list: "actions", entry: multi([{ action: "Javelin", count: 1 }]) },
      { list: "actions", entry: attackEntry("Javelin", { delivery: "ranged", range: { normal: 60 } }) },
    ];
    const o = find(run({ combatants: [ogre(), fresco(5, 0)], attacks }), "attack:actions:Multiattack:fresco");
    expect(o?.feet).toBe(0);
  });

  it("leaves out a Multiattack that names a step the stat block does not have, or has no steps", () => {
    const ghost: UsableAttack[] = [{ list: "actions", entry: multi([{ action: "Bite", count: 1 }]) }, { list: "actions", entry: club }];
    expect(find(run({ combatants: [ogre(), fresco(1, 0)], attacks: ghost }), "attack:actions:Multiattack:fresco")).toBeUndefined();
    const empty: UsableAttack[] = [{ list: "actions", entry: multi([]) }, { list: "actions", entry: club }];
    expect(find(run({ combatants: [ogre(), fresco(1, 0)], attacks: empty }), "attack:actions:Multiattack:fresco")).toBeUndefined();
  });

  it("leaves out a Multiattack whose first step is not an attack", () => {
    const save = entry("Roar", { kind: "save" });
    const attacks: UsableAttack[] = [{ list: "actions", entry: multi([{ action: "Roar", count: 1 }]) }, { list: "actions", entry: save }];
    expect(find(run({ combatants: [ogre(), fresco(1, 0)], attacks }), "attack:actions:Multiattack:fresco")).toBeUndefined();
  });

  it("does not offer an option list, which has no entry name of its own for a command to name", () => {
    const breath = entry("Breath", { kind: "options", options: [{ name: "Fire", kind: "attack", attack: { delivery: "ranged", bonus: 0, hit: [], range: { normal: 30 } } }] });
    const options = run({ combatants: [ogre(), fresco(1, 0)], attacks: [{ list: "actions", entry: breath }] });
    expect(options.filter((o) => o.kind === "attack")).toEqual([]);
  });
});

describe("rule 9: the cap", () => {
  it("keeps Dodge, Flee and the options against the nearest targets, dropping the farthest first", () => {
    // Seven hostiles in a column at x=3, listed farthest first. Each is reachable, and with two attacks that is 14
    // attack options against a room of 10 (12 minus the two fixed options, Flee and Dodge; the column leaves nothing to
    // Disengage from or Hide behind). Distances from the Ogre (0,0): y=0, 2, -2 are 15 ft (3 targets, 6 options);
    // y=4, -4 are 20 ft (4 options); y=6, -6 are 30 ft and get no room. Taking the first 10 in listed order would keep
    // the farthest instead.
    const slam: UsableAttack = { list: "actions", entry: attackEntry("Slam", {}) };
    const ys = [-6, 6, -4, 4, -2, 2, 0];
    const hostiles = ys.map((y, i) => creature(`h${i + 1}`, `H${i + 1}`, "p", 3, y));
    const options = run({ combatants: [ogre(), ...hostiles], attacks: [CLUB, slam] });
    expect(options).toHaveLength(MAX_TURN_OPTIONS);
    expect(options.slice(-2).map((o) => o.id)).toEqual(["flee", "dodge"]);
    const targets = new Set(options.filter((o) => o.kind === "attack").map((o) => o.targetId));
    // h3 (y=-4), h4 (y=4), h5 (-2), h6 (2), h7 (0) all kept; h1 (y=-6) and h2 (y=6) dropped.
    for (const id of ["h3", "h4", "h5", "h6", "h7"]) expect(targets.has(id)).toBe(true);
    expect(targets.has("h1")).toBe(false);
    expect(targets.has("h2")).toBe(false);
  });
});

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

// SRD 5.1 Black Tentacles: "A creature restrained by the tentacles can use its action to make a Strength or Dexterity check
// (its choice) against your spell save DC."
describe("rule 12: break free (#1021)", () => {
  const held = (over: Partial<RunCombatant> = {}) =>
    ogre(0, 0, { conditions: [{ name: "Restrained", source: { id: "mage", spell: "Black Tentacles" }, breakFree: { abilities: ["str", "dex"], dc: 14 } }], ...over });

  // Bug caught: a held creature is never offered the check, so it stands in the tentacles all fight.
  it("offers one option per condition with a way out, naming the ability and the DC, and the first ability when none is chosen for it", () => {
    const options = run({ combatants: [held(), fresco(5, 0)] });
    const free = find(options, "break_free:Restrained");
    expect(free).toMatchObject({ kind: "break_free", targetId: null, breakFree: { name: "Restrained", ability: "str" } });
    expect(free?.summary).toBe("Break free of Restrained: a STR check against DC 14, using its Action");
    expect(options.filter((o) => o.kind === "break_free")).toHaveLength(1);
  });

  // Bug caught: the ability the creature would use is not the one the caller picked (Dexterity here), so the step checks with the wrong one.
  it("carries the ability the caller says the creature would use", () => {
    const options = run({ combatants: [held(), fresco(5, 0)], breakFreeAbility: () => "dex" });
    expect(find(options, "break_free:Restrained")?.breakFree?.ability).toBe("dex");
  });

  // Bug caught: the check is offered when the Action is already spent, so trying again and again in one turn is free.
  it("is not offered when the Action is spent", () => {
    expect(find(run({ combatants: [held({ action_used: true }), fresco(5, 0)] }), "break_free:Restrained")).toBeUndefined();
  });

  // Bug caught: the rule changes the list of a creature with no such condition.
  it("adds nothing for a creature with no such condition, and not when the creature cannot act", () => {
    expect(run({ combatants: [ogre(), fresco(5, 0)] }).some((o) => o.kind === "break_free")).toBe(false);
    expect(run({ combatants: [held({ conditions: [{ name: "Paralyzed", breakFree: { abilities: ["str"], dc: 14 } }] }), fresco(5, 0)] })).toEqual([]);
  });

  // Not on the map at all (rule 6): the check needs no square, so it is still offered.
  it("is offered where nothing can be measured", () => {
    expect(find(run({ combatants: [held(), fresco(5, 0)], map: null }), "break_free:Restrained")).toBeDefined();
  });
});

describe("allies in a spell's area", () => {
  const factions = [
    { id: "m", hostile_to: ["p"] },
    { id: "p", hostile_to: ["m"] },
    { id: "n", hostile_to: [] },
  ];
  const caster = ogre(0, 0);
  const spells = castableNow(mageBlock(), caster, [fireball()], "2014");
  const friends = (extra: RunCombatant[]) => {
    const options = run({ combatants: [caster, fresco(4, 0), ...extra], attacks: [], spells, factions });
    const cast = options.find((o) => o.kind === "spell");
    return cast?.spell === undefined || cast.spell === null ? undefined : [...cast.spell.friendsCaught].sort();
  };

  // Bug: "everyone not hostile" made a Neutral bystander an ally, so the cast counted it as a friend caught in the blast
  // (and a heal or a buff would have been aimed at it).
  it("does not count a Neutral bystander in the area as a friend", () => {
    // Fireball centred on Fresco (4,0) has a 20 ft radius; the Neutral at (4,1) is inside it, the caster is 20 ft away.
    expect(friends([creature("bystander", "Bystander", "n", 4, 1)])).toEqual(["ogre"]);
  });
  it("counts a creature of the caster's own faction in the area as a friend", () => {
    expect(friends([creature("brother", "Brother", "m", 4, 1)])).toEqual(["brother", "ogre"]);
  });
});
