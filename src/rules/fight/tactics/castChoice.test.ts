import { describe, expect, it } from "vitest";
import { NO_OCCLUDERS, occluders } from "../../../lib/battlemap/occlusion.ts";
import type { WallSegment } from "../../../lib/battlemap/walls.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { GridCalibration } from "../../../types/location.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { StatBlockEntry } from "../../../types/statBlock.types.ts";
import { castableNow } from "../spells/castNow.ts";
import { fireball, fireBolt, mageBlock } from "../spells/spellTestKit.ts";
import type { SpellRecord } from "../spells/spellChoice.ts";
import type { FightMap } from "../terrain/battleMap.ts";
import { MAX_SPELL_OPTIONS, type TurnOption, type UsableAttack } from "../terrain/options/types.ts";
import { turnOptions } from "../terrain/options/compose.ts";
import { stepsFor } from "./carryOut.ts";
import { withNumbers } from "./numbers.ts";
import { gateOptions, pickTurn } from "./pick.ts";
import { tacticalProfile } from "./profile.ts";

// The end-to-end of choosing to cast: the real options, numbers, gate and picker, on an SRD 5.1 mage (9th level, spell save
// DC 14, +6 to hit with spells, Fire Bolt at will, three 3rd-level slots for Fireball) against goblins.
// A goblin is AC 15, 7 hit points. Every number below is worked out from the rules, not read off the code:
//   Fireball 8d6 averages 28; a goblin at DEX +0 fails DC 14 on 13 faces of 20 (65%): per goblin 0.65*28 + 0.35*14 = 23.1.
//   Fire Bolt 2d10 at 9th level averages 11; +6 against AC 15 needs 9: 12 faces of 20 hit (0.60), plus the natural 20's
//     extra 2d10 dice (0.05 * 11): 0.60*11 + 0.05*11 = 7.15.
//   Dagger 1d4+2 averages 4.5, +5 against AC 15 needs 10: 11 faces (0.55), crit adds 1d4 (0.05 * 2.5): 0.55*4.5 + 0.125 = 2.6.

const CALIBRATION = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 } as GridCalibration;
const FAR_EDGES = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
function mapOf(walls: [[number, number], [number, number]][] = []): FightMap {
  const occ = walls.length === 0 ? NO_OCCLUDERS : occluders({ walls: walls.map(([a, b], i): WallSegment => ({ id: `w${i}`, a, b })), doors: [], solid: [] });
  return { mapLocationId: "site", occluders: occ, difficult: new Set(), solid: occ.solid, calibration: CALIBRATION, bounds: FAR_EDGES, rowsKnown: true, exits: [] };
}

function creature(id: string, faction: string, x: number, y: number, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: faction, initiative: null, hp: 7, max_hp: 7, ac: "15", conditions: [], curses: [],
    death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x, y }, size: "medium", ...over,
  };
}
const MAGE_AT = creature("mage", "m", 0, 0, { name: "Mage", hp: 40, max_hp: 40, ac: "12" });
const DAGGER: UsableAttack = {
  list: "actions",
  entry: { name: "Dagger", description: "", structured: { source: "manual", kind: "attack", attack: { delivery: "melee", bonus: 5, hit: [{ dice: "1d4+2", type: "piercing" }] } } } as StatBlockEntry,
};

interface Setup { combatants: RunCombatant[]; records?: SpellRecord[]; block?: MonsterStatBlock; attacks?: UsableAttack[]; map?: FightMap; mover?: RunCombatant }

/** Options, numbers, gate and pick, as `take_turn` runs them. */
function play(s: Setup) {
  const block = s.block === undefined ? mageBlock() : s.block;
  const mover = s.mover === undefined ? MAGE_AT : s.mover;
  const combatants = [mover, ...s.combatants];
  const attacks = s.attacks === undefined ? [DAGGER] : s.attacks;
  const spells = castableNow(block, mover, s.records === undefined ? [fireball(), fireBolt()] : s.records, "2014");
  const options = turnOptions({ combatants, moverId: "mage", map: s.map === undefined ? mapOf() : s.map, budgetFeet: 30, attacks, reachOf: () => 5, ruleset: "2014", spells });
  const profile = tacticalProfile(block, "humanoid");
  const gated = withNumbers(gateOptions(options, profile, mover), {
    attacks, combatants, moverId: "mage", armorClassOf: (c) => Number(c.ac), ruleset: "2014", spells, saveBonusOf: () => 0,
  });
  const pick = pickTurn(gated, profile, { combatants, moverId: "mage", armorClassOf: (c) => Number(c.ac) });
  return { options: gated, pick, option: gated.find((o) => o.id === pick?.optionId) };
}
const goblins = (...xs: number[]) => xs.map((x, i) => creature(`g${i + 1}`, "p", x, 0, { name: `Goblin ${i + 1}` }));

describe("a creature that casts chooses a spell", () => {
  // Bug caught: the engine only ever weighs attacks, so a mage with three goblins in a bunch swings its dagger (2.6) or bolts one (7.15).
  it("casts Fireball at three bunched goblins rather than stab one: 3 * 23.1 = 69.3 against 7.15", () => {
    const { option, pick } = play({ combatants: goblins(6, 7, 8) });
    expect(option?.kind).toBe("spell");
    expect(option?.spell).toMatchObject({ name: "Fireball", castLevel: 3, kind: "save", spends: true, friendsCaught: [] });
    expect(option?.spell?.targetIds).toEqual(["g1", "g2", "g3"]);
    expect(option?.spell?.expectedDamage).toBeCloseTo(69.3, 5);
    expect(option?.spell?.hitChance).toBeCloseTo(0.65, 5);
    expect(pick?.reason).toBe("Casts Fireball (level 3) at Goblin 1, Goblin 2 and Goblin 3: about 69 damage, against about 3 from Dagger and spends a level 3 slot.");
  });

  // Bug caught: the cast catches its own side. The mage's ally stands in the middle of the bunch, so every centre of the
  // sphere would burn it; the mage bolts a goblin instead (7.15, no slot).
  it("does not cast Fireball when its own ally would be in the fire, and bolts a goblin instead", () => {
    const ally = creature("ally", "m", 7, 1, { name: "Ally" });
    const { options, pick, option } = play({ combatants: [...goblins(6, 7, 8), ally] });
    const ball = options.find((o) => o.kind === "spell" && o.spell?.name === "Fireball");
    expect(ball?.spell?.friendsCaught).toEqual(["ally"]);
    expect(option?.spell).toMatchObject({ name: "Fire Bolt", castLevel: 0, spends: false });
    expect(pick?.reason).toMatch(/^Casts Fire Bolt at Goblin 1, /);
    expect(option?.spell?.expectedDamage).toBeCloseTo(7.15, 5);
  });

  // The slot is not worth it on a goblin with 1 hit point left: the dagger (2.6) and Fire Bolt (7.15) each do more than 1.
  // Bug caught: the mage spends its top slot on something nearly dead.
  it("keeps its slot against one goblin at 1 hit point and uses the cantrip", () => {
    const { option } = play({ combatants: [creature("g1", "p", 6, 0, { name: "Goblin 1", hp: 1 })] });
    expect(option?.spell).toMatchObject({ name: "Fire Bolt", spends: false });
  });

  // With no cantrip on hand only the dagger (2.6) is free, and it still beats 1 hit point: the slot stays unspent.
  it("keeps its slot for the dagger when it has no cantrip, against a goblin at 1 hit point", () => {
    const { option } = play({ combatants: [creature("g1", "p", 6, 0, { name: "Goblin 1", hp: 1 })], records: [fireball()] });
    expect(option?.kind).toBe("attack");
  });

  // The same lone goblin at full 7 hit points: the best free option (Fire Bolt, 7.15) is at least its 7 hit points, so the slot is
  // still not spent. At 8 hit points the bolt cannot finish it and Fireball (23.1) is worth the slot.
  // Bug caught: the hit-point test is off by one (> instead of >=) or compares with the wrong total.
  it("spends the slot when the free option cannot finish the target: 7.15 against 7 hit points keeps it, against 8 spends it", () => {
    const seven = play({ combatants: [creature("g1", "p", 6, 0, { hp: 7 })] });
    expect(seven.option?.spell?.name).toBe("Fire Bolt");
    const eight = play({ combatants: [creature("g1", "p", 6, 0, { hp: 8, max_hp: 8 })] });
    expect(eight.option?.spell?.name).toBe("Fireball");
  });

  // Bug caught: a creature with a slot of the right level spends a bigger one, or offers the cast when every level is gone.
  it("casts Fireball at 4th level when its 3rd-level slots are spent, and not at all when every slot it could use is", () => {
    const three = (extra: Partial<RunCombatant>) => play({ combatants: goblins(6, 7, 8), mover: { ...MAGE_AT, ...extra } });
    const up = three({ action_uses: { "slots/3": { used: 3, per_day: 3 } } });
    expect(up.option?.spell).toMatchObject({ name: "Fireball", castLevel: 4 });
    const none = three({ action_uses: { "slots/3": { used: 3, per_day: 3 }, "slots/4": { used: 3, per_day: 3 } } });
    expect(none.options.some((o) => o.spell?.name === "Fireball")).toBe(false);
    expect(none.option?.spell?.name).toBe("Fire Bolt");
  });

  // Bug caught: a cone is approximated as a sphere and offered. A mage whose only damaging spell is a cone has no spell option.
  it("offers no cone and no line", () => {
    for (const shape of ["cone", "line"]) {
      const { options } = play({ combatants: goblins(6, 7, 8), records: [fireball({ aoe_shape: shape })] });
      expect(options.some((o) => o.kind === "spell")).toBe(false);
    }
  });

  // Bug caught: the caster's own Action is spent already, but it is still offered a cast.
  it("offers no spell once the Action is used", () => {
    const { options } = play({ combatants: goblins(6, 7, 8), mover: { ...MAGE_AT, action_used: true } });
    expect(options.some((o) => o.kind === "spell")).toBe(false);
  });

  // Bug caught: with no Spellcasting entry the option list changes, or a spell option appears with no record.
  it("gives a creature with no Spellcasting entry exactly the options it got before", () => {
    const plain = mageBlock({ special_abilities: [] });
    const withSpells = turnOptions({ combatants: [MAGE_AT, ...goblins(6, 7, 8)], moverId: "mage", map: mapOf(), budgetFeet: 30, attacks: [DAGGER], reachOf: () => 5, ruleset: "2014", spells: castableNow(plain, MAGE_AT, [fireball(), fireBolt()], "2014") });
    const before = turnOptions({ combatants: [MAGE_AT, ...goblins(6, 7, 8)], moverId: "mage", map: mapOf(), budgetFeet: 30, attacks: [DAGGER], reachOf: () => 5, ruleset: "2014" });
    expect(withSpells).toEqual(before);
    expect(before.some((o) => o.kind === "spell")).toBe(false);
  });

  // Bug caught: a spell option shoves the mage's attack, move or Dodge options out of the list, or the list has no ceiling.
  it("caps the spell options on their own, leaving the attack and Dodge options alone", () => {
    const crowd = Array.from({ length: 14 }, (_, i) => creature(`e${i}`, "p", 6 + 5 * (i % 4), 5 * Math.floor(i / 4), { name: `E${i}` }));
    const baseline = turnOptions({ combatants: [MAGE_AT, ...crowd], moverId: "mage", map: mapOf(), budgetFeet: 30, attacks: [DAGGER], reachOf: () => 5, ruleset: "2014" });
    const { options } = play({ combatants: crowd, records: [fireBolt()] });
    expect(options.filter((o) => o.kind === "spell")).toHaveLength(MAX_SPELL_OPTIONS);
    expect(options.filter((o) => o.kind !== "spell").map((o) => o.id)).toEqual(baseline.map((o) => o.id));
  });

  // A wall between the mage and the goblin is total cover: no line, so no cast at it.
  // Bug caught: a spell is aimed through a wall, at a creature the caster cannot see.
  it("does not cast at a goblin behind a wall", () => {
    const wall: [[number, number], [number, number]][] = [[[3, -10], [3, 10]]];
    const { options } = play({ combatants: goblins(6), map: mapOf(wall) });
    expect(options.some((o) => o.kind === "spell")).toBe(false);
  });

  // Fire Bolt's range is 120 feet: a goblin standing 24 squares away is 120 feet off (a square touching the mage is 5 feet) and in range, one square further is 125 and out.
  // Bug caught: range is ignored, or off by one square.
  it("casts only within the spell's range", () => {
    expect(play({ combatants: goblins(24), records: [fireBolt()] }).options.some((o) => o.id === "spell:Fire Bolt:0:g1")).toBe(true);
    expect(play({ combatants: goblins(25), records: [fireBolt()] }).options.some((o) => o.id === "spell:Fire Bolt:0:g1")).toBe(false);
  });

  // Bug caught: the cast's steps are a swing plus a separate Action step (spending the Action twice), or leave out the targets.
  it("carries a cast out as one cast step and nothing that spends again", () => {
    const { option } = play({ combatants: goblins(6, 7, 8) });
    expect(stepsFor(option as TurnOption, [DAGGER])).toEqual([{ type: "cast", spell: "Fireball", castLevel: 3, targetIds: ["g1", "g2", "g3"] }]);
  });

  // Bug caught: the gate drops spells for a tier, so an instinct or simple creature never casts.
  it("offers spells to every tier that offers attacks", () => {
    for (const int of [3, 5, 9, 17]) {
      const block = mageBlock({ int });
      expect(tacticalProfile(block, "humanoid").offers.has("spell")).toBe(true);
    }
  });
});

describe("the two comparisons with exact numbers", () => {
  const profile = tacticalProfile(mageBlock(), "humanoid");
  const g = creature("g1", "p", 1, 0, { name: "Goblin 1", hp: 5, max_hp: 5 });
  const ctx = { combatants: [MAGE_AT, g], moverId: "mage", armorClassOf: () => 15 };
  const base = { destination: null, path: null, feet: null, distanceFeet: null, provokes: [], exposure: [] };
  const attack = (expected: number): TurnOption => ({
    ...base, id: "attack:actions:Dagger:g1", kind: "attack", targetId: "g1", summary: "",
    attack: { list: "actions", action: "Dagger", steps: null, distanceFeet: 5, cover: "none", longRange: false, closeCombat: false, hitChance: 0.5, expectedDamage: expected },
  });
  const cast = (expected: number, spends: boolean): TurnOption => ({
    ...base, id: "spell:X:0:g1", kind: "spell", targetId: "g1", attack: null, summary: "",
    spell: { name: "X", castLevel: spends ? 3 : 0, kind: "save", targetIds: ["g1"], friendsCaught: [], spends, distanceFeet: 5, hitChance: 0.5, expectedDamage: expected },
  });

  // The free attack is expected to deal 5 and the goblin has exactly 5 hit points left: the attack can finish it, so the slot is kept.
  // Bug caught: "at least equal" written as "more than", so a slot is spent where the free option already finishes the target.
  it("keeps the slot when the free option's expected damage equals the hit points left, and spends it a hair under", () => {
    expect(pickTurn([attack(5), cast(50, true)], profile, ctx)?.optionId).toBe("attack:actions:Dagger:g1");
    expect(pickTurn([attack(4.9), cast(50, true)], profile, ctx)?.optionId).toBe("spell:X:0:g1");
  });

  // Bug caught: a tie goes to the spell (a cast that spends nothing still ranks above the attack it merely equals).
  it("gives a tie in expected damage to the attack, and a cast that does more wins", () => {
    expect(pickTurn([attack(10), cast(10, false)], profile, ctx)?.optionId).toBe("attack:actions:Dagger:g1");
    expect(pickTurn([attack(10), cast(10.5, false)], profile, ctx)?.optionId).toBe("spell:X:0:g1");
  });
});
