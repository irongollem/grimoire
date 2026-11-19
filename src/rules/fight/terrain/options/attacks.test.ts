/** Rules 1, 6 and 8: an attack as an option, measured or not, and a Multiattack. */
import { describe, expect, it } from "vitest";
import { type TurnOption, type TurnOptionsInput, type UsableAttack } from "./types.ts";
import { mapOf, creature, ogre, fresco, chicory, entry, attackEntry, CLUB, run, find } from "./turnOptionsTestKit.ts";

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
