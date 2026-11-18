import { describe, expect, it } from "vitest";
import { NO_OCCLUDERS } from "../../../lib/battlemap/occlusion.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import { castableNow } from "../spells/castNow.ts";
import { fireball, mageBlock } from "../spells/spellTestKit.ts";
import type { SpellRecord } from "../spells/spellChoice.ts";
import { rangeFeetOf, spellTargetings } from "./spellTargeting.ts";

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
