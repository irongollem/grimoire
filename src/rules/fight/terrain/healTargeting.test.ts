import { describe, expect, it } from "vitest";
import { NO_OCCLUDERS, occluders } from "../../../lib/battlemap/occlusion.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import { healableNow } from "../spells/castNow.ts";
import { clericBlock, cureWounds, healingWord, massHealingWord } from "../spells/spellTestKit.ts";
import type { SpellRecord } from "../spells/spellChoice.ts";
import { healTargetings } from "./healTargeting.ts";

const who = (id: string, x: number, over: Partial<RunCombatant> = {}): RunCombatant => ({
  instance_id: id, type: "monster", name: id, faction_id: "m", initiative: null, hp: 20, max_hp: 20, ac: "12", conditions: [], curses: [],
  death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x, y: 0 }, size: "medium", ...over,
});
const CLERIC = who("cleric", 0);
const hurt = (id: string, x: number, hp: number, over: Partial<RunCombatant> = {}) => who(id, x, { hp, ...over });
const downed = (id: string, x: number) => who(id, x, { type: "player", party_member_id: `pm-${id}`, hp: 0 });

function found(records: SpellRecord[], allies: RunCombatant[], over: { mover?: RunCombatant; scene?: boolean; kindOf?: (c: RunCombatant) => string | null; walls?: Parameters<typeof occluders>[0] } = {}) {
  const mover = over.mover ?? CLERIC;
  const heals = healableNow(clericBlock(), mover, records, "2014");
  const onBoard = [mover, ...allies];
  return healTargetings({ mover, allies, scene: over.scene === false ? null : { occluders: over.walls === undefined ? NO_OCCLUDERS : occluders(over.walls), onBoard }, heals, kindOf: over.kindOf });
}

describe("healTargetings", () => {
  // A creature at full hit points has nothing to heal: a heal is offered at the hurt only.
  // Bug caught: Cure Wounds offered at a full-health friend, so a cleric spends a slot on nobody.
  it("fails if a heal is offered at someone who is not hurt", () => {
    expect(found([cureWounds()], [who("friend", 1)])).toEqual([]);
  });

  // PHB 2014 "Cure Wounds": range Touch. Touch is 5 feet (`rangeFeetOf`): the friend one square away is in reach, the one three squares away
  // (15 feet by this grid) is not. Bug caught: a touch spell cast across the room.
  it("fails if a touch heal reaches past five feet", () => {
    const [t] = found([cureWounds()], [hurt("near", 1, 5), hurt("far", 3, 1)]);
    expect(t.targetIds).toEqual(["near"]);
  });

  // PHB 2014 "Healing Word": range 60 feet. Twelve squares off is 60 feet (an adjacent square is 5); thirteen is 65. Bug caught: the range read as touch, or off by a square.
  it("fails if a 60 foot heal does not reach 60 feet, or reaches 65", () => {
    const at = (x: number) => found([healingWord()], [hurt("friend", x, 5)]).flatMap((t) => t.targetIds);
    expect(at(12)).toEqual(["friend"]);
    expect(at(13)).toEqual([]);
  });

  // Bug caught: a heal aimed at the caster's foe. `allies` is who fights on the caster's side; a foe is never passed in, and a creature
  // of another faction named in `allies` would be a caller bug, so the guard is the caller's (`spellOptions` filters with `isAllyOf`).
  // What this file must hold: the caster itself is a target, since a creature may heal itself.
  it("fails if a hurt caster cannot heal itself with a 60 foot spell", () => {
    const [t] = found([healingWord()], [], { mover: hurt("cleric", 0, 4) });
    expect(t.targetIds).toEqual(["cleric"]);
    expect(t.distanceFeet).toBeNull();
  });

  // The neediest first: down, then below half, then the rest, and within one need the lowest share. A single-target spell is one option each.
  // Bug caught: options in list order, so the cleric's first option is a scratch when someone is down.
  it("fails if the neediest is not first: down, then below half, then hurt", () => {
    const options = found([healingWord()], [hurt("scratch", 1, 15), hurt("low", 2, 8), downed("down", 3)]);
    expect(options.map((o) => o.targetIds[0])).toEqual(["down", "low", "scratch"]);
    expect(options[0]).toMatchObject({ downIds: ["down"], lowIds: [] });
    expect(options[1]).toMatchObject({ downIds: [], lowIds: ["low"] });
  });

  // A dead character (three failed saves) and a monster at 0 are not targets.
  it("fails if a dead creature is a target", () => {
    const dead = who("dead", 1, { type: "player", party_member_id: "pm-dead", hp: 0, death_saves: { successes: 0, failures: 3 } });
    expect(found([healingWord()], [dead, hurt("corpse", 2, 0)])).toEqual([]);
  });

  // "Mass Healing Word": up to six creatures, once. Seven hurt friends: the six neediest are the targets, in one option.
  // Bug caught: one option per friend (the cleric would cast it seven times), or the seventh included.
  it("fails if a mass heal is not one option for the six neediest", () => {
    const friends = [1, 2, 3, 4, 5, 6, 7].map((x) => hurt(`f${x}`, x, 20 - x));
    const options = found([massHealingWord()], friends, { mover: CLERIC }).filter((o) => o.heal.spell === "Mass Healing Word");
    expect(options).toHaveLength(1);
    expect(options[0].targetIds).toHaveLength(6);
    expect(options[0].targetIds).not.toContain("f1");
  });

  // PHB 2014 "Cure Wounds": no effect on undead or constructs. A hurt undead friend is not a target of the 2014 spell; the 2024 spell has no such text.
  it("fails if a 2014 heal is aimed at an undead friend, or a 2024 one is not", () => {
    const kindOf = (c: RunCombatant) => (c.instance_id === "ghoul" ? "undead" : "humanoid");
    const ghoul = hurt("ghoul", 1, 4);
    expect(found([cureWounds()], [ghoul], { kindOf })).toEqual([]);
    expect(found([cureWounds({ ruleset: "2024" })], [ghoul], { kindOf }).flatMap((t) => t.targetIds)).toEqual(["ghoul"]);
  });

  // A kind the fight cannot tell is healed: the text excludes only what is known to be undead or a construct.
  it("fails if a creature of a kind the fight cannot tell is never healed", () => {
    const kindOf = () => null;
    expect(found([cureWounds()], [hurt("npc", 1, 4)], { kindOf }).flatMap((t) => t.targetIds)).toEqual(["npc"]);
  });

  // With no map nobody is out of reach: every hurt friend is a target.
  it("fails if, with no map, a hurt friend is left out for being far away", () => {
    expect(found([cureWounds()], [hurt("far", 40, 4)], { scene: false }).flatMap((t) => t.targetIds)).toEqual(["far"]);
  });

  // A friend with no square on the map cannot be measured, so no heal is aimed at it (the caster itself always can).
  it("fails if a friend with no place on a measured map is a target", () => {
    expect(found([healingWord()], [hurt("nowhere", 1, 4, { position: null })])).toEqual([]);
  });
});

describe("healTargetings: sight and self", () => {
  // A full wall between the caster and the friend one square away: within touch, but not reachable (total cover). Bug caught: a heal through a wall.
  it("fails if a heal reaches a friend behind a full wall", () => {
    const walls = { walls: [{ id: "w", a: [1, 0] as [number, number], b: [1, 1] as [number, number] }], doors: [], solid: [] };
    expect(found([cureWounds()], [hurt("friend", 1, 4)], { walls })).toEqual([]);
    expect(found([cureWounds()], [hurt("friend", 1, 4)]).flatMap((t) => t.targetIds)).toEqual(["friend"]);
  });

  // A spell whose range is Self covers the caster only: the friend beside them is not a target. Bug caught: a self-range heal cast at the party.
  it("fails if a heal with a range of Self is aimed at a friend", () => {
    const options = found([cureWounds({ range: "Self" })], [hurt("friend", 1, 4)], { mover: hurt("cleric", 0, 4) });
    expect(options.flatMap((t) => t.targetIds)).toEqual(["cleric"]);
  });
});
