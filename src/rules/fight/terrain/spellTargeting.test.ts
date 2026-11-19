import { describe, expect, it } from "vitest";
import { NO_OCCLUDERS } from "../../../lib/battlemap/occlusion.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import { castableNow } from "../spells/castNow.ts";
import { fireball, holdPerson, holdPersonEffect, mageBlock, mageWithHold } from "../spells/spellTestKit.ts";
import type { SpellRecord } from "../spells/spellChoice.ts";
import { inAimedArea, rangeFeetOf, spellTargetings } from "./spellTargeting.ts";

const who = (id: string, faction: string, x: number, y = 0): RunCombatant => ({
  instance_id: id, type: "monster", name: id, faction_id: faction, initiative: null, hp: 20, max_hp: 20, ac: "12", conditions: [], curses: [],
  death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x, y }, size: "medium",
});
const MAGE = who("mage", "m", 0);

function targetings(record: SpellRecord, hostiles: RunCombatant[], allies: RunCombatant[] = [], scene = true) {
  const spells = castableNow(mageBlock(), MAGE, [record], "2014");
  const onBoard = [MAGE, ...hostiles, ...allies];
  return spellTargetings({ mover: MAGE, hostiles, allies, scene: scene ? { occluders: NO_OCCLUDERS, onBoard } : null, spells });
}

describe("rangeFeetOf", () => {
  it("reads feet, miles, Touch as 5 feet and Self, and gives up on text it cannot read", () => {
    expect(rangeFeetOf("120 feet")).toBe(120);
    expect(rangeFeetOf("60 ft.")).toBe(60);
    expect(rangeFeetOf("Touch")).toBe(5);
    expect(rangeFeetOf("Self")).toBe("self");
    expect(rangeFeetOf("Self (15-foot cone)")).toBe("self");
    expect(rangeFeetOf("1 mile")).toBe(5280);
    expect(rangeFeetOf("Sight")).toBeNull();
  });
});

describe("spellTargetings", () => {
  // A sphere centred on the goblin 3 squares away (15 feet: the mage is 3 squares of gap + 1) with a 20-foot area reaches the mage
  // itself (15 feet from the centre). SRD 5.1 "Fireball": a creature in the area is caught, the caster included.
  // Bug caught: the caster's own place in the area is left out, so the mage fireballs itself without it counting as a friend.
  it("counts the caster as caught when it stands within the area of a sphere centred on an enemy", () => {
    const [t] = targetings(fireball(), [who("g1", "p", 3)]);
    expect(t).toMatchObject({ centerId: "g1", targetIds: ["g1"], friendsCaught: ["mage"] });
  });

  // A 10-foot emanation from the caster: the goblin one square off (10 feet by this grid: gap 1 + 1 squares) is in, the one three off (20 feet) is out;
  // the caster is never in its own emanation.
  // Bug caught: the emanation is centred on an enemy, or catches the caster, or reaches past its size.
  it("centres an emanation on the caster, reaches only its size, and leaves the caster out", () => {
    const found = targetings(fireball({ aoe_shape: "emanation", aoe_size: "10 feet", range: "Self" }), [who("near", "p", 1), who("far", "p", 3)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ centerId: null, targetIds: ["near"], friendsCaught: [] });
  });

  // Bug caught: a range of Self with an area is cast at a distant enemy as though it were a ranged ball.
  it("treats an area spell whose range is Self as an area on the caster", () => {
    const found = targetings(fireball({ range: "Self", aoe_shape: "cube", aoe_size: "15 feet" }), [who("near", "p", 1), who("far", "p", 20)]);
    expect(found.map((t) => [t.centerId, t.targetIds])).toEqual([[null, ["near"]]]);
  });

  // Bug caught: with nothing to measure an area spell is dropped, or invents who stands where.
  it("offers a single-target cast per enemy, catching no friend, when there is no map", () => {
    const found = targetings(fireball(), [who("g1", "p", 3), who("g2", "p", 4)], [who("ally", "m", 3)], false);
    expect(found.map((t) => [t.centerId, t.targetIds, t.friendsCaught, t.distanceFeet])).toEqual([["g1", ["g1"], [], null], ["g2", ["g2"], [], null]]);
  });

  // Bug caught: two centres that catch exactly the same creatures are both offered, crowding the list.
  it("keeps one option for centres that catch the same creatures, the nearer centre", () => {
    const found = targetings(fireball(), [who("g1", "p", 6), who("g2", "p", 7)]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ centerId: "g1", targetIds: ["g1", "g2"] });
  });
});

describe("spellTargetings: a spell limited to a kind of creature", () => {
  const hold = (over: Parameters<typeof holdPersonEffect>[0] = {}) => holdPerson({ condition_effect: holdPersonEffect({ only_kinds: ["humanoid"], ...over }) });
  const kinds: Record<string, string | null> = { wolf: "beast", bandit: "humanoid", Bandit: "humanoid", mystery: null };
  const kindOf = (c: RunCombatant) => kinds[c.instance_id] ?? null;
  const offered = (record: SpellRecord, hostiles: RunCombatant[], withKinds: boolean) => {
    const spells = castableNow(mageWithHold(), MAGE, [record], "2014", { kindsChecked: true });
    return spellTargetings({ mover: MAGE, hostiles, allies: [], scene: { occluders: NO_OCCLUDERS, onBoard: [MAGE, ...hostiles] }, spells, ...(withKinds ? { kindOf } : {}) });
  };

  // Bug caught: Hold Person offered at a wolf (a beast) or at a creature whose kind nobody knows.
  it("offers a single-target cast only at hostiles of a known, allowed kind", () => {
    const found = offered(hold(), [who("wolf", "p", 2), who("bandit", "p", 3), who("mystery", "p", 4)], true);
    expect(found.map((t) => t.targetIds)).toEqual([["bandit"]]);
  });

  // Bug caught: an area whose centre is a creature the spell cannot affect is offered, or the area lists a creature of the wrong kind among its targets.
  it("catches only allowed hostiles in an area, and offers no area centred on one that is not affected", () => {
    const found = offered(fireball({ condition_effect: holdPersonEffect({ only_kinds: ["humanoid"], save_ability: "DEX", conditions: ["Prone"] }) }), [who("wolf", "p", 2), who("bandit", "p", 3)], true);
    expect(found.every((t) => t.centerId === "bandit" && t.targetIds.every((id) => id === "bandit"))).toBe(true);
    expect(found.length).toBeGreaterThan(0);
  });

  // Bug caught: with no way to tell kinds, a limited spell is offered at everyone.
  it("offers a kind-limited spell nowhere when no kind lookup is given", () => {
    expect(offered(hold(), [who("bandit", "p", 3)], false)).toEqual([]);
  });

  // Bug caught: the kind filter leaking onto a spell with no kind limit.
  it("offers a spell with no kind limit exactly as before when a kind lookup is given", () => {
    const hostiles = [who("wolf", "p", 2), who("mystery", "p", 3)];
    const spells = castableNow(mageBlock(), MAGE, [fireball()], "2014");
    const input = { mover: MAGE, hostiles, allies: [], scene: { occluders: NO_OCCLUDERS, onBoard: [MAGE, ...hostiles] }, spells };
    expect(spellTargetings({ ...input, kindOf })).toEqual(spellTargetings(input));
  });
});

describe("a cone and a line, aimed from the caster", () => {
  const cone = () => fireball({ range: "Self (15-foot cone)", aoe_shape: "cone", aoe_size: "15 feet" });
  const line = () => fireball({ range: "Self (30-foot line)", aoe_shape: "line", aoe_size: "30 feet" });

  // SRD 5.1 "Areas of Effect", Cone: "A cone's width at a given point along its length is equal to that point's
  // distance from the point of origin." Aimed along the row from x=0: the square at (3, 1) is 15 feet along and
  // 5 feet off, inside the 7.5 feet the cone is half-wide there; (1, 1) is 5 feet along and 5 off, outside 2.5.
  // Bug caught: a cone as wide at its mouth as at its end (a square), or as a line with no width at all.
  it("widens a cone with distance: wide at its end, narrow at its mouth", () => {
    const found = targetings(cone(), [who("ahead", "p", 3), who("wide", "p", 3, 1), who("beside", "p", 1, 1)]);
    const along = found.find((t) => t.centerId === "ahead");
    expect(along?.targetIds.sort()).toEqual(["ahead", "wide"]);
  });

  // Bug caught: a cone or line reaching past its length, or cast at someone it cannot reach.
  it("reaches only its length, and is not aimed at a creature beyond it", () => {
    const found = targetings(cone(), [who("near", "p", 2), who("far", "p", 4)]);
    expect(found.map((t) => [t.centerId, t.targetIds])).toEqual([["near", ["near"]]]);
  });

  // SRD 5.1 "Areas of Effect", Line: straight from the origin up to its length. Bug caught: a line catching the
  // squares beside its path, or stopping at the creature it is aimed at instead of running on.
  it("runs a line on past the creature it is aimed at, and misses the squares beside its path", () => {
    const found = targetings(line(), [who("first", "p", 2), who("behind", "p", 5), who("beside", "p", 3, 1)]);
    expect(found.find((t) => t.centerId === "first")?.targetIds.sort()).toEqual(["behind", "first"]);
    expect(found.every((t) => !t.targetIds.includes("beside") || t.centerId === "beside")).toBe(true);
  });

  // The rule a creature weighs before it casts (friends in the fire). Bug caught: an ally standing in the cone
  // not counted, so the caster burns its own side without knowing; or the caster counted in its own cone.
  it("counts a friend standing in the area, and never the caster", () => {
    const [t] = targetings(cone(), [who("foe", "p", 3)], [who("ally", "m", 2)]);
    expect(t.friendsCaught).toEqual(["ally"]);
    expect(t.targetIds).toEqual(["foe"]);
  });

  // Bug caught: two aims that catch exactly the same creatures offered as two casts.
  it("offers one cast for aims that catch the same creatures", () => {
    const found = targetings(line(), [who("a", "p", 2), who("b", "p", 4)]);
    expect(found).toHaveLength(1);
    expect(found[0].targetIds.sort()).toEqual(["a", "b"]);
  });

  // A Large caster fills squares (0,0) to (1,1); its space ends 5 feet beyond a Medium one's from its centre.
  // Bug caught: a Large creature's cone measured from its centre, a square shorter than a Medium creature's.
  it("measures from the edge of the caster's space, so a Large caster's cone is no shorter", () => {
    const origin = { x: 5, y: 5 };
    const target = { anchor: { x: 4, y: 0 }, footprint: 1 };
    expect(inAimedArea("cone", 15, origin, 2.5, { x: 22.5, y: 5 }, target)).toBe(true);
    expect(inAimedArea("cone", 15, origin, 0, { x: 22.5, y: 5 }, target)).toBe(false);
  });
});
