/** Rule 11, moving for a better cast (#1021 row 5b): a spell with no option from where the creature stands is offered from one square it walks to. */
import { describe, expect, it } from "vitest";
import { combatantFootprint } from "../../../../lib/battlemap/tokenFootprint.ts";
import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { castableNow } from "../../spells/castNow.ts";
import { fireBolt, fireball, mageBlock } from "../../spells/spellTestKit.ts";
import { coverBetween, distanceFeet } from "../sight.ts";
import { chicory, creature, fresco, mapOf, ogre, run } from "./turnOptionsTestKit.ts";
import { betterSquare, type MovedTargeting } from "./movedSpells.ts";

// The Ogre (faction "m") is the caster; with the kit's factions-less default a different faction is an opponent. Speed 30 ft is
// 6 squares. A distance is 5 ft per square of gap (`distanceFeet`): a foe at anchor x is (x - 1) squares of gap from an Ogre at 0.
const bolt = (range: string, over: Partial<RunCombatant> = {}) => castableNow(mageBlock(), ogre(0, 0, over), [fireBolt({ range })], "2014");
const walks = (options: ReturnType<typeof run>) => options.filter((o) => o.kind === "spell" && o.id.endsWith(":walk"));
const stays = (options: ReturnType<typeof run>) => options.filter((o) => o.kind === "spell" && !o.id.endsWith(":walk"));

describe("rule 11: moving for a better cast", () => {
  // Fresco at anchor 10 is 9 squares of gap: 50 ft. A 30 ft spell needs a gap of 5 squares or less, so the Ogre must stand at x >= 4
  // (gap 10 - 4 - 1 = 5): 4 squares, 20 ft. Every square of column 4 with |y| <= 4 costs 20 ft too (diagonals are 5 ft) and is 30 ft
  // from Fresco; of those the straight walk, nearest the start as the crow flies, is (4,0). Bug caught (the odd diagonal): the
  // top-row tie order sending the Ogre to (4,-4).
  // Bug caught: a caster whose only foe is out of range stands still and does nothing, or the walk is not the shortest that brings it in range.
  it("walks the shortest way that brings the only foe into range, and says so", () => {
    const options = run({ combatants: [ogre(), fresco(10, 0)], attacks: [], spells: bolt("30 feet") });
    expect(stays(options)).toEqual([]);
    const [cast] = walks(options);
    expect(cast).toMatchObject({ id: "spell:Fire Bolt:0:fresco:walk", targetId: "fresco", destination: { x: 4, y: 0 }, feet: 20, provokes: [] });
    expect(cast.path).toHaveLength(5);
    expect(cast.path?.[0]).toEqual({ x: 0, y: 0 });
    expect(cast.path?.at(-1)).toEqual({ x: 4, y: 0 });
    expect(cast.spell).toMatchObject({ targetIds: ["fresco"], distanceFeet: 30 });
    expect(cast.summary).toBe("Walk 20 ft and cast Fire Bolt at Fresco");
  });

  // Bug caught: a creature that can already cast from where it stands is made to walk as well (a second, moved option beside the cast).
  it("offers no walk when the foe is already in range", () => {
    // Fresco at anchor 4 is 3 squares of gap: 20 ft, inside 30.
    const options = run({ combatants: [ogre(), fresco(4, 0)], attacks: [], spells: bolt("30 feet") });
    expect(stays(options).map((o) => o.id)).toEqual(["spell:Fire Bolt:0:fresco"]);
    expect(walks(options)).toEqual([]);
  });

  // Bug caught: a walk offered to a foe no square within the move can bring into range (the cast would then be offered and fail).
  it("offers no walk when no square within the move reaches the foe", () => {
    // The Ogre walks 6 squares at most: to x = 6, gap 20 - 6 - 1 = 13 squares, 70 ft, far outside 30.
    expect(walks(run({ combatants: [ogre(), fresco(20, 0)], attacks: [], spells: bolt("30 feet") }))).toEqual([]);
  });

  // A wall from (2,-3) to (2,4) between the Ogre (0,0) and Fresco (5,0) walls it off from the start: total cover, so no sight, so no cast from here.
  // The wall is 7 squares long, so the Ogre goes round it: the chosen square must have sight to Fresco and be within the 30 ft range, judged here with the same rule helpers.
  // Bug caught: a walk to a square that is in range but still behind the wall, or a spell offered from here through a wall.
  it("walks to a square with sight when a wall hides the foe", () => {
    const map = mapOf([[[2, -3], [2, 4]]]);
    const caster = ogre();
    const target = fresco(5, 0);
    const options = run({ combatants: [caster, target], map, attacks: [], spells: bolt("30 feet") });
    expect(stays(options)).toEqual([]);
    const [cast] = walks(options);
    expect(cast).toBeDefined();
    const there = { anchor: cast.destination as { x: number; y: number }, footprint: combatantFootprint(caster) };
    const foe = { anchor: { x: 5, y: 0 }, footprint: combatantFootprint(target) };
    expect(cast.feet).toBeGreaterThan(0);
    expect(coverBetween(there, foe, map.occluders, [])).not.toBe("total");
    expect(distanceFeet(there, foe)).toBeLessThanOrEqual(30);
  });

  // Fireball is a 20 ft sphere centred on a foe, and the caster in it counts as caught. Fresco at anchor 3 is 2 squares of gap, 15 ft, so
  // from where the Ogre stands the only placement catches the Ogre itself. A square at least 25 ft from Fresco is outside it: gap 4 squares, so x <= -2
  // (3 - x - 1 >= 4), 2 squares and 10 ft away; of the squares at x = -2 the straight step back, nearest the start, is (-2,0).
  // Bug caught: the walk is offered for a cast that is already possible from here, or the moved cast still catches the caster, or it ignores who an area catches.
  it("walks out of its own area spell's blast: a cast that would catch the caster from here does not stop the walk", () => {
    const caster = ogre();
    const spells = castableNow(mageBlock(), caster, [fireball()], "2014");
    const options = run({ combatants: [caster, fresco(3, 0)], attacks: [], spells });
    const here = stays(options).find((o) => o.spell?.name === "Fireball" && o.spell.castLevel === 3);
    expect(here?.spell?.friendsCaught).toEqual(["ogre"]);
    const moved = walks(options).find((o) => o.spell?.name === "Fireball" && o.spell.castLevel === 3);
    expect(moved).toMatchObject({ id: "spell:Fireball:3:fresco:walk", destination: { x: -2, y: 0 }, feet: 10 });
    expect(moved?.spell).toMatchObject({ targetIds: ["fresco"], friendsCaught: [] });
    expect(moved?.summary).toMatch(/^Walk 10 ft and cast Fireball \(level 3\) at Fresco/);
  });

  // The Ogre starts at (0,0). Fresco at (4,-1) can be touched from column 3 (rows -2, -1, 0), 15 ft away. Chicory is a foe with 30 ft reach at (1,5), too far
  // to touch within the 20 ft move (a gap of 4 rows is 4 squares: it would need the Ogre at row 4, 20 ft, and nothing is gained by it that 15 ft does not already give).
  // Its reach covers rows >= -1 (gap |y - 5| - 1 <= 5), so the Ogre starts inside it. (3,-2) is outside it: every walk there leaves its reach and provokes.
  // A 3 step walk to (3,-1) or (3,0) only visits rows -1, 0 and 1 (each step changes the row by at most one and the net change is 0 or -1... never row -2),
  // so it never leaves the reach. The top-first tie order alone would pick (3,-2); the square must be chosen for provoking nothing.
  // Bug caught: the walk is chosen by distance alone and takes an opportunity attack another square of the same length avoids.
  it("prefers the square whose walk provokes fewer opportunity attacks over one earlier in the tie order", () => {
    const caster = ogre();
    const spells = castableNow(mageBlock(), caster, [fireBolt({ range: "Touch" })], "2014");
    const guard = chicory(1, 5);
    const options = run({ combatants: [caster, fresco(4, -1), guard], attacks: [], spells, budgetFeet: 20, reachOf: (c) => (c.instance_id === "chicory" ? 30 : 5) });
    const cast = walks(options).find((o) => o.targetId === "fresco");
    expect(cast?.provokes).toEqual([]);
    expect(cast?.feet).toBe(15);
    expect(cast?.destination).not.toEqual({ x: 3, y: -2 });
    expect([-1, 0]).toContain(cast?.destination?.y);
    expect(cast?.destination?.x).toBe(3);
  });

  // Fresco at (4,-4) is touched from (3,-3), the only square 15 ft away that is adjacent to it ((3,-4) and (4,-3) are 20 ft). The only 15 ft walk there is the
  // diagonal (1,-1), (2,-2), (3,-3). Chicory (30 ft reach, at (1,6), too far to touch within 20 ft: it would need row 5) covers rows >= 0 (gap |y - 6| - 1 <= 5), so the Ogre
  // starts inside its reach and leaves it on the first step, (0,0) to (1,-1) (path index 0): one opportunity attack, from Chicory, and no square is a cheaper way to the cast.
  // Bug caught: a provoking walk is offered with nothing saying so, so whoever picks the turn cannot weigh it.
  it("names the opportunity attack a walk provokes", () => {
    const caster = ogre();
    const spells = castableNow(mageBlock(), caster, [fireBolt({ range: "Touch" })], "2014");
    const options = run({ combatants: [caster, fresco(4, -4), chicory(1, 6)], attacks: [], spells, budgetFeet: 20, reachOf: (c) => (c.instance_id === "chicory" ? 30 : 5) });
    const cast = walks(options).find((o) => o.targetId === "fresco");
    expect(cast).toMatchObject({ destination: { x: 3, y: -3 }, feet: 15, provokes: [{ enemyId: "chicory", step: 0 }] });
    expect(cast?.summary).toBe("Walk 15 ft and cast Fire Bolt at Fresco; provokes an opportunity attack from Chicory");
  });

  // Bug caught: an option offered more than once for one spell and level (one per square tried), flooding the list.
  it("offers one moved option per spell and cast level", () => {
    const options = run({ combatants: [ogre(), fresco(10, 0), chicory(10, 2)], attacks: [], spells: bolt("30 feet") });
    expect(walks(options)).toHaveLength(1);
  });

  // Bug caught: a creature with no Action left is walked to a cast it can no longer make.
  it("offers no walk when the Action is spent", () => {
    expect(walks(run({ combatants: [ogre(0, 0, { action_used: true }), fresco(10, 0)], attacks: [], spells: bolt("30 feet") }))).toEqual([]);
  });

  // A 60 ft mover reaches 12 squares. The foe at anchor 15 is in 30 ft range from x = 9, a 45 ft walk; the search tries only the `MAX_CAST_SQUARES` cheapest
  // walks (121 squares are within 25 ft, the rest of the 128 are the first of the 30 ft ring), so that walk is not looked at: a documented bound, not a missed rule.
  // Bug caught: the bound is dropped, so a turn tries every square a fast creature reaches (625 of them here) for every spell it has no cast for.
  it("looks only at the cheapest walks: a cast that needs a 45 ft walk is not found", () => {
    expect(walks(run({ combatants: [ogre(), fresco(15, 0)], budgetFeet: 60, attacks: [], spells: bolt("30 feet") }))).toEqual([]);
    expect(walks(run({ combatants: [ogre(), fresco(10, 0)], budgetFeet: 60, attacks: [], spells: bolt("30 feet") }))).toHaveLength(1);
  });

  // Rule 6: no map, nothing to walk on.
  it("offers no walk where nothing can be measured", () => {
    expect(walks(run({ combatants: [ogre(), creature("f", "Foe", "p", 10, 0)], map: null, attacks: [], spells: bolt("30 feet") }))).toEqual([]);
  });
});

describe("betterSquare: the order two walk squares are ranked in", () => {
  const square = (x: number, y: number, feet: number, targets: string[], provokes = 0): MovedTargeting => ({
    rc: { cell: { x, y }, feet } as MovedTargeting["rc"],
    provokes: Array.from({ length: provokes }, (_, i) => ({ enemyId: `e${i}`, step: 0 })),
    targeting: { targetIds: targets } as MovedTargeting["targeting"],
  });
  const START = { x: 0, y: 0 };
  // APP CONVENTION, the order: fewer opportunity attacks, fewer feet, more targets, the straight walk, top-left. Bugs caught: a walk that
  // provokes chosen over one that does not, a longer walk over a shorter, a Fireball square catching one foe over one catching two at the
  // same cost, or the corner square over the straight one.
  it("fails if any rule of the order is skipped or reversed", () => {
    expect(betterSquare(square(5, 5, 25, ["a"]), square(4, 0, 20, ["a"], 1), START)).toBe(true);
    expect(betterSquare(square(4, 0, 20, ["a"]), square(5, 0, 25, ["a"]), START)).toBe(true);
    expect(betterSquare(square(4, -4, 20, ["a", "b"]), square(4, 0, 20, ["a"]), START)).toBe(true);
    expect(betterSquare(square(4, 0, 20, ["a"]), square(4, -4, 20, ["a"]), START)).toBe(true);
    expect(betterSquare(square(4, -4, 20, ["a"]), square(4, 0, 20, ["a"]), START)).toBe(false);
  });
});

