import { describe, expect, it } from "vitest";
import { NO_OCCLUDERS, occluders } from "../../../lib/battlemap/occlusion.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { StatBlockEntry } from "../../../types/statBlock.types.ts";
import { boonableNow } from "../spells/castNow.ts";
import type { SpellRecord } from "../spells/spellChoice.ts";
import { bless, clericBlock, shieldOfFaith } from "../spells/spellTestKit.ts";
import { boonTargetings } from "./boonTargeting.ts";

const spellcasting = (lines: string): StatBlockEntry => ({
  name: "Spellcasting", structured: { kind: "other", source: "parsed" },
  description: `The cleric is a 5th-level spellcaster. Its spellcasting ability is Wisdom (spell save DC 13, +5 to hit with spell attacks). The cleric has the following cleric spells prepared:\n\n${lines}`,
});
const BLOCK = clericBlock({ special_abilities: [spellcasting("* 1st level (4 slots): bless, shield of faith\n* 2nd level (2 slots): aid")] });

const who = (id: string, x: number, over: Partial<RunCombatant> = {}): RunCombatant => ({
  instance_id: id, type: "monster", name: id, faction_id: "m", initiative: null, hp: 20, max_hp: 20, ac: "12", conditions: [], curses: [],
  death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x, y: 0 }, size: "medium", ...over,
});
const CLERIC = who("cleric", 0);
const foe = (id: string, x: number, y = 0) => who(id, x, { faction_id: "p", position: { x, y } });

function found(records: SpellRecord[], allies: RunCombatant[], hostiles: RunCombatant[] = [], over: { mover?: RunCombatant; scene?: boolean; walls?: Parameters<typeof occluders>[0] } = {}) {
  const mover = over.mover ?? CLERIC;
  const boons = boonableNow(BLOCK, mover, records, "2014");
  const onBoard = [mover, ...allies, ...hostiles];
  return boonTargetings({ mover, allies, hostiles, scene: over.scene === false ? null : { occluders: over.walls === undefined ? NO_OCCLUDERS : occluders(over.walls), onBoard }, boons });
}
const idsOf = (t: ReturnType<typeof found>) => t.map((x) => x.targetIds);

describe("boonTargetings", () => {
  // PHB 2014 "Bless": up to three creatures. Five friends in range: three are chosen, in one option.
  // Bug caught: the count ignored, so a cast names five and `cast_spell` refuses it, or one option per friend.
  it("fails if Bless takes more than three creatures, or is offered once per friend", () => {
    const friends = [1, 2, 3, 4, 5].map((x) => who(`f${x}`, x));
    const [t, ...rest] = found([bless()], friends);
    expect(t.targetIds).toHaveLength(3);
    expect(rest).toEqual([]);
  });

  // APP CONVENTION: a creature already holding the spell's condition is skipped (a second Bless would only replace the first).
  // Bug caught: the cleric re-blessing a friend while an unblessed one waits.
  it("fails if a friend who already holds Bless is chosen again", () => {
    const blessed = who("blessed", 1, { conditions: [{ name: "Bless" }] });
    const [t] = found([bless()], [blessed, who("plain", 2)], [], { mover: who("cleric", 0, { hp: 1 }) });
    expect(t.targetIds).not.toContain("blessed");
    expect(t.targetIds).toEqual(expect.arrayContaining(["plain", "cleric"]));
  });

  // PHB "Bless": the creatures are of the caster's choice and the app aims it at its own side only. A foe (and a Neutral) is never named.
  // Bug caught: a blessing on the enemy standing next to the cleric.
  it("fails if a foe is a target", () => {
    const [t] = found([bless()], [who("friend", 1)], [foe("goblin", 1, 1)]);
    expect(t.targetIds).not.toContain("goblin");
  });

  // PHB "Bless": "within range" (30 feet = 6 squares by this grid: a creature one square away is 5 feet). Seven squares off is 35 feet; six is 30.
  // Bug caught: a boon cast across the room.
  it("fails if a friend out of range is a target, or one at exactly 30 feet is not", () => {
    const [t] = found([bless()], [who("far", 7), who("edge", 6, { position: { x: 5, y: 3 } }), who("near", 1)]);
    expect(t.targetIds).not.toContain("far");
    expect(t.targetIds).toContain("edge");
  });

  // PHB "Bless": "that you can see": a wall of total cover between caster and friend blocks the boon. Bug caught: a boon cast through a wall.
  it("fails if a friend behind a wall is a target", () => {
    const wall = { walls: [{ id: "w", a: [2, -5] as [number, number], b: [2, 5] as [number, number] }], doors: [], solid: [] };
    const [t] = found([bless()], [who("behind", 3), who("near", 1, { position: { x: 1, y: 3 } })], [], { walls: wall });
    expect(t.targetIds).not.toContain("behind");
    expect(t.targetIds).toContain("near");
  });

  // APP CONVENTION: a boon does nothing for someone down; only the standing are chosen.
  // Bug caught: a slot spent on a friend lying at 0 hit points.
  it("fails if a friend at 0 hit points is a target", () => {
    const [t] = found([bless()], [who("down", 1, { hp: 0 }), who("up", 2)]);
    expect(t.targetIds).not.toContain("down");
  });

  // APP CONVENTION (AC boon): the creature with the most foes within 5 feet first. Pip has two foes beside it, Brug none, though Brug is the one with fewer hit points.
  // Bug caught: Shield of Faith on the friend nobody is hitting.
  it("fails if Shield of Faith goes to the friend with no foe beside it over the one with two", () => {
    const pip = who("pip", 2);
    const brug = who("brug", 1, { hp: 5, position: { x: 1, y: 4 } });
    const t = found([shieldOfFaith()], [brug, pip], [foe("g1", 3), foe("g2", 3, 1)]);
    expect(idsOf(t)).toEqual([["pip"]]);
  });

  // APP CONVENTION (AC boon): with equal foes beside them, the lowest current hit points first. Bug caught: list order.
  it("fails if Shield of Faith ignores who has the fewest hit points among equals", () => {
    const t = found([shieldOfFaith()], [who("hale", 1), who("hurt", 2, { hp: 4 })]);
    expect(idsOf(t)).toEqual([["hurt"]]);
  });

  // APP CONVENTION (attack boon): a creature with a foe within 5 feet is chosen before the rest. With a count of three, the two in melee go first and the third slot goes to the nearest of the rest.
  // Bug caught: Bless on three friends in the back rank while the two in melee are left out.
  it("fails if Bless leaves a friend in melee out for friends with no foe beside them", () => {
    const friends = [who("back1", 1, { position: { x: 1, y: 6 } }), who("back2", 2, { position: { x: 2, y: 6 } }), who("back3", 3, { position: { x: 3, y: 6 } }), who("front1", 4, { position: { x: 4, y: 0 } }), who("front2", 5, { position: { x: 5, y: 1 } })];
    const [t] = found([bless()], friends, [foe("goblin", 5, 0)]);
    expect(t.targetIds.slice(0, 2).sort()).toEqual(["front1", "front2"]);
  });

  // APP CONVENTION: the caster is last among equals. Bug caught: the cleric blessing itself ahead of a friend when only the count allows one.
  it("fails if the caster is chosen before an equal friend", () => {
    const [one] = found([bless()], [who("friend", 1)], []);
    expect(one.targetIds).toEqual(["friend", "cleric"]);
  });

  // With no map (no scene) every friend is in reach and nothing is within 5 feet of anything. Bug caught: no option without a scene.
  it("fails if a fight with no map offers no boon", () => {
    const [t] = found([bless()], [who("friend", 1)], [], { scene: false });
    expect(t.targetIds).toEqual(["friend", "cleric"]);
    expect(t.distanceFeet).toBeNull();
  });
});
