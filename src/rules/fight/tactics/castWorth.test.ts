import { describe, expect, it } from "vitest";
import { NO_OCCLUDERS } from "../../../lib/battlemap/occlusion.ts";
import type { RunCombatant, ShownDeeds } from "../../../types/encounter.types.ts";
import type { GridCalibration } from "../../../types/location.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import type { StatBlockEntry } from "../../../types/statBlock.types.ts";
import { castableNow } from "../spells/castNow.ts";
import { holdPerson, holdPersonEffect, mageWithHold } from "../spells/spellTestKit.ts";
import type { SpellRecord } from "../spells/spellChoice.ts";
import type { FightMap } from "../terrain/battleMap.ts";
import { turnOptions } from "../terrain/options/compose.ts";
import { type UsableAttack } from "../terrain/options/types.ts";
import { withNumbers } from "./numbers.ts";
import { gateOptions, pickTurn } from "./pick.ts";
import { tacticalProfile } from "./profile.ts";

// What a condition spell is worth to the creature that casts it, end to end: the real options, numbers, gate and picker.
// A mage (spell save DC 14, Hold Person at level 2, three slots) with a dagger faces goblins that have 7 hit points, AC 15.
// Numbers worked out from the rules, not read off the code:
//   Dagger 1d4+2 averages 4.5, +5 against AC 15 needs 10: 11 faces (0.55), crit adds 1d4 (0.05 * 2.5): 0.55*4.5 + 0.125 = 2.6.
//   A goblin at WIS +0 fails DC 14 on 13 faces of 20: 0.65. Hold Person's Paralyzed repeats the save at the end of its turns
//   for up to 10 rounds: expected turns held (1 - 0.65^10) / (1 - 0.65) = 2.8187 (under the 3-round cap).
//   A foe seen to deal 12 a turn (24 over 2 turns): Paralyzed share 1, so 12 * 2.8187 * 0.65 (fail) = 21.986.
//   Restrained: 0.75 for a brawler, 0.5 for an archer: 12*0.75*2.8187*0.65 = 16.489 and 12*0.5*2.8187*0.65 = 10.993.

const CALIBRATION = { cells_per_image_width: 10, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 0, origin_cell_y: 0 } as GridCalibration;
const MAP: FightMap = { mapLocationId: "site", occluders: NO_OCCLUDERS, difficult: new Set(), solid: NO_OCCLUDERS.solid, calibration: CALIBRATION, bounds: { minX: -50, minY: -50, maxX: 50, maxY: 50 }, rowsKnown: true, exits: [] };
const DAGGER: UsableAttack = {
  list: "actions",
  entry: { name: "Dagger", description: "", structured: { source: "manual", kind: "attack", attack: { delivery: "melee", bonus: 5, hit: [{ dice: "1d4+2", type: "piercing" }] } } } as StatBlockEntry,
};

function creature(id: string, faction: string, x: number, y: number, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: faction, initiative: null, hp: 7, max_hp: 7, ac: "15", conditions: [], curses: [],
    death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x, y }, size: "medium", ...over,
  };
}
const MAGE = creature("mage", "m", 0, 0, { name: "Mage", hp: 40, max_hp: 40, ac: "12" });
const seen = (over: Partial<ShownDeeds>): ShownDeeds => ({ dealt: 0, turns: 0, cast: 0, ranged: 0, melee: 0, ...over });
/** A foe the fight has watched for 2 turns deal 24: 12 a turn. */
const hitter = (id: string, x: number, over: Partial<RunCombatant> = {}, deeds: Partial<ShownDeeds> = {}) =>
  creature(id, "p", x, 0, { name: id, shown_deeds: seen({ dealt: 24, turns: 2, melee: 2, ...deeds }), ...over });

const holding = (...conditions: ("Paralyzed" | "Restrained" | "Blinded" | "Deafened")[]) => (extra: Partial<ReturnType<typeof holdPersonEffect>> = {}): SpellRecord =>
  holdPerson({ condition_effect: holdPersonEffect({ conditions, ...extra }) });

function play(foes: RunCombatant[], over: { block?: MonsterStatBlock; record?: SpellRecord; attacks?: UsableAttack[] } = {}) {
  const block = over.block === undefined ? mageWithHold() : over.block;
  const attacks = over.attacks === undefined ? [DAGGER] : over.attacks;
  const combatants = [MAGE, ...foes];
  const spells = castableNow(block, MAGE, [over.record === undefined ? holdPerson() : over.record], "2014");
  const options = turnOptions({ combatants, moverId: "mage", map: MAP, budgetFeet: 30, attacks, reachOf: () => 5, ruleset: "2014", spells });
  const profile = tacticalProfile(block, "humanoid");
  const gated = withNumbers(gateOptions(options, profile, MAGE), {
    attacks, combatants, moverId: "mage", armorClassOf: (c) => Number(c.ac), ruleset: "2014", spells, saveBonusOf: () => 0,
  });
  const pick = pickTurn(gated, profile, { combatants, moverId: "mage", armorClassOf: (c) => Number(c.ac) });
  return { options: gated, pick, option: gated.find((o) => o.id === pick?.optionId) };
}
const trained = (): MonsterStatBlock => ({ ...mageWithHold(), int: 10 });
const simple = (): MonsterStatBlock => ({ ...mageWithHold(), int: 5 });

describe("a clever creature weighs what a condition is worth", () => {
  // Bug caught: a condition-only spell has 0 expected damage so it is offered and never chosen (the story's starting point).
  it("holds a foe that has been seen to deal 12 a turn: worth 21.986 against a dagger's 2.6", () => {
    const { option, pick } = play([hitter("Bram", 1)]);
    expect(option?.kind).toBe("spell");
    expect(option?.spell).toMatchObject({ name: "Hold Person", targetIds: ["Bram"], imposes: ["Paralyzed"] });
    expect(option?.spell?.expectedDamage).toBe(0);
    expect(option?.spell?.expectedWorth).toBeCloseTo(21.985687, 4);
    expect(pick?.reason).toBe("Casts Hold Person (level 2) at Bram, who has been dealing about 12 damage a turn: Paralyzed takes away about 22 damage of what it deals, against about 3 from Dagger and spends a level 2 slot.");
  });

  // Bug caught: every tier counts the worth, so a simple creature that cannot reason about a hold casts it too.
  it("leaves a condition unpriced for a simple creature, which keeps to the dagger", () => {
    const { option } = play([hitter("Bram", 1)], { block: simple() });
    expect(option?.kind).toBe("attack");
  });

  // The exception to RULE condition-worth: with no attack to make, a simple creature casts its best condition spell.
  // Bug caught: the exception is missing, so a creature with only a hold and nothing it can attack does nothing.
  it("lets a simple creature with no attack cast the hold anyway", () => {
    const { option } = play([hitter("Bram", 1)], { block: simple(), attacks: [] });
    expect(option?.spell?.name).toBe("Hold Person");
  });

  // The foe has 2 hit points; the dagger is expected to deal 2.6, at least what is left, so the slot is kept (RULE no-wasted-slot).
  // Bug caught: the slot rule ignores worth, or a held foe at 2 hit points is worth a level 2 slot.
  it("keeps its slot against a foe the dagger is expected to finish", () => {
    const { option } = play([hitter("Bram", 1, { hp: 2 })]);
    expect(option?.kind).toBe("attack");
  });

  // Bug caught: with nothing seen the worth is 0 so a clever creature never opens with a hold, or it reads the foe's sheet.
  // Nothing seen: the foe is taken to be as dangerous as the mover (its best expected damage, the dagger's 2.6):
  // 2.6 * 2.8187 * 0.65 = 4.763, which beats the dagger's 2.6.
  it("takes a foe it has seen nothing of to be as dangerous as itself", () => {
    const { option } = play([creature("Bram", "p", 1, 0, { name: "Bram" })]);
    expect(option?.spell?.expectedWorth).toBeCloseTo(4.7635, 3);
    expect(option?.kind).toBe("spell");
  });

  // Bug caught: the worth reads the target's real numbers; two foes that differ only in hit points, armor class and name
  // (what a sheet would show) must be worth the same.
  it("is worth the same on a frail foe and a sturdy one that have shown the same", () => {
    const frail = play([hitter("A", 1, { hp: 7, max_hp: 7 })]).option?.spell?.expectedWorth;
    const sturdy = play([hitter("B", 1, { hp: 90, max_hp: 90, ac: "15", monster_id: "m-dragon" })]).option?.spell?.expectedWorth;
    expect(sturdy).toBe(frail);
  });

  // Bug caught: a foe that already bears the condition is held again, wasting a slot.
  it("does not hold a foe that is already Paralyzed", () => {
    const { options } = play([hitter("Bram", 1, { conditions: [{ name: "Paralyzed" }] })]);
    expect(options.find((o) => o.kind === "spell")?.spell?.expectedWorth).toBe(0);
  });
});

describe("the spell helps pick the target (RULE spell-for-its-target)", () => {
  // Two foes seen to deal 12 a turn. The tactical mage's own attack target goes to the archer (hunted after casters), yet
  // Restrained is worth 16.489 on the brawler against 10.993 on the archer, so the spell goes to the brawler.
  // Bug caught: the spell is limited to the target chosen for the attack, so a hold lands on the archer.
  it("sends a holding spell to the brawler, though the attack would go to the archer", () => {
    const foes = [hitter("Archer", 2, {}, { melee: 0, ranged: 2 }), hitter("Brawler", 1)];
    const { option } = play(foes, { record: holding("Restrained")() });
    expect(option?.spell?.targetIds).toEqual(["Brawler"]);
    expect(option?.spell?.expectedWorth).toBeCloseTo(16.489266, 4);
  });

  // Blinded: 0.75 for an archer, 0.5 for a brawler. The brawler is nearer and has been seen to do no more than the archer.
  // Bug caught: the kind a condition hurts most is not consulted, so the blinding goes to whoever the attack chose.
  it("sends a blinding spell to the archer", () => {
    const foes = [hitter("Brawler", 1), hitter("Archer", 2, {}, { melee: 0, ranged: 2 })];
    const { option } = play(foes, { record: holding("Blinded")() });
    expect(option?.spell?.targetIds).toEqual(["Archer"]);
    expect(option?.spell?.expectedWorth).toBeCloseTo(16.489266, 4);
  });

  // A trained mage's attack goes to the most wounded foe (the fighter, 3 of 7), yet the spell that stops casting (with
  // Deafened, 0.1) is worth 12 * 1 * 2.8187 * 0.65 = 21.986 on a foe seen to cast, and only 2.199 on the fighter.
  // Bug caught: a casting-stopper is priced the same on everyone, or goes where the attack went.
  it("sends a casting-stopper to the foe that has been seen to cast", () => {
    const foes = [hitter("Fighter", 1, { hp: 3 }), hitter("Caster", 2, {}, { melee: 0, cast: 2 })];
    const { option } = play(foes, { block: trained(), record: holding("Deafened")({ stops_casting: "all" }) });
    expect(option?.spell?.targetIds).toEqual(["Caster"]);
    expect(option?.spell?.expectedWorth).toBeCloseTo(21.985687, 4);
  });

  // Bug caught: the retargeting also applies to a lower tier, which cannot weigh a spell for its target.
  it("keeps a lower tier to the target its rule chose", () => {
    const foes = [hitter("Archer", 2, {}, { melee: 0, ranged: 2 }), hitter("Brawler", 1)];
    const { option } = play(foes, { block: simple(), record: holding("Restrained")() });
    expect(option?.kind).toBe("attack");
  });

  // A simple creature with no attack counts worth (the exception) but still keeps to the target its own rule chose, the nearest:
  // the weak foe next to it, not the hitter two squares off.
  // Bug caught: the exception lets a lower tier weigh the spell on every foe, as only a trained or tactical one may.
  it("keeps a simple creature with nothing to attack to the nearest foe", () => {
    const foes = [hitter("Far", 3), hitter("Near", 1, {}, { dealt: 2 })];
    const { option } = play(foes, { block: simple(), attacks: [] });
    expect(option?.spell?.targetIds).toEqual(["Near"]);
  });

  // Bug caught: a held foe is chosen again over one that is not held.
  it("chooses the foe that does not already bear the condition", () => {
    const foes = [hitter("Held", 1, { conditions: [{ name: "Restrained" }] }), hitter("Free", 2)];
    const { option } = play(foes, { record: holding("Restrained")() });
    expect(option?.spell?.targetIds).toEqual(["Free"]);
  });
});

describe("hunting casters and archers (RULE hunt-casters-and-archers)", () => {
  // No spells: the pick is the dagger. The tactical mage goes for a foe seen to cast though it is the least wounded and holds nothing.
  // Bug caught: only a held concentration counts, so a foe that cast and is not concentrating is hunted like anyone.
  it("goes for a foe seen to cast although it is not concentrating", () => {
    const foes = [hitter("Wounded", 1, { hp: 2 }), hitter("Caster", 2, {}, { melee: 0, cast: 1 })];
    const { pick } = play(foes, { record: holdPerson({ id: "other", name: "Nothing" }), attacks: [DAGGER] });
    expect(pick?.optionId).toBe("attack:actions:Dagger:Caster");
  });

  it("goes for an archer after a caster, and for either before the most wounded", () => {
    const wounded = hitter("Wounded", 1, { hp: 2 });
    const archer = hitter("Archer", 2, {}, { melee: 0, ranged: 3 });
    const caster = hitter("Caster", 3, {}, { melee: 0, cast: 1 });
    const noSpell = { record: holdPerson({ name: "Nothing" }) };
    expect(play([wounded, archer], noSpell).pick?.optionId).toBe("attack:actions:Dagger:Archer");
    expect(play([wounded, archer, caster], noSpell).pick?.optionId).toBe("attack:actions:Dagger:Caster");
  });

  // Bug caught: the new preferences change a creature that has been shown nothing: it still goes for the most wounded.
  it("still goes for the most wounded when nothing has been seen", () => {
    const foes = [creature("Fresh", "p", 1, 0), creature("Hurt", "p", 2, 0, { hp: 2 })];
    expect(play(foes, { record: holdPerson({ name: "Nothing" }) }).pick?.optionId).toBe("attack:actions:Dagger:Hurt");
  });
});
