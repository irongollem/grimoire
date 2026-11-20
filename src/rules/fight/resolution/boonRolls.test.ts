/**
 * What a boon adds to a roll: Bless's d4 on attacks and saves, Shield of Faith's +2 armour class. Every expected number
 * is worked out in the comment above it from the rule, never read off a run. PHB means the 2014 Player's Handbook.
 */
import { describe, expect, it } from "vitest";
import type { AppliedCondition } from "@/types/condition.types";
import { combatant } from "../fightTestKit";
import { resolveAttackOn } from "./attack";
import { resolveConcentrationOn, resolveConditionSaveOn } from "./conditionSaves";
import { rollBoons } from "./boonRolls";
import { resolveSaveOn } from "./saves";
import { bite, scripted, table, victim } from "./resolutionTestKit";
import type { StatBlockEntry } from "@/types/statBlock.types";

const bless: AppliedCondition = { name: "Bless", grants: { attack: "1d4", save: "1d4" } };
const shieldOfFaith: AppliedCondition = { name: "Shield of Faith", grants: { ac: 2 } };
const blessed = (id = "wolf") => combatant(id, { hp: 11, max_hp: 11, conditions: [bless] });

describe("a boon on an attack", () => {
  // PHB "Bless": the d4 is added to the attack roll. d20 10 + 3 = 13 misses AC 15; with a d4 of 2 it is 15, which hits.
  // Bug caught: a Blessed attacker's d4 is not rolled or not added, so the attack still misses.
  it("a Blessed attacker's d4 turns a miss into a hit and is asked after the d20", async () => {
    const s = scripted([[10], [2], [4]]);
    const t = table([blessed(), victim({ ac: "15" })], { dice: s.dice });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6", 3), target: t.get("victim"), withinFiveFeet: true });
    expect(done.summary).toMatchObject({ natural: 10, total: 15, targetAc: 15, hit: true });
    expect(s.asks[0].counts).toEqual({ 20: 1 });
    expect(s.asks[1]).toMatchObject({ counts: { 4: 1 }, label: "Bless (attack)", rollerId: "wolf" });
  });

  // PHB "Making an Attack": a natural 1 always misses. 1 + 3 + a d4 of 4 = 8 would beat AC 5, but it misses.
  // Bug caught: the boon is added to the natural die or the natural 1 is no longer an automatic miss.
  it("a natural 1 with Bless still misses", async () => {
    const s = scripted([[1], [4]]);
    const t = table([blessed(), victim({ ac: "5" })], { dice: s.dice });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6", 3), target: t.get("victim"), withinFiveFeet: true });
    expect(done.summary).toMatchObject({ natural: 1, total: 8, hit: false, fumble: true });
  });

  // PHB "Shield of Faith": +2 AC. d20 10 + 3 = 13 hits AC 13; against a warded target AC 15 it misses.
  // Bug caught: the target's boon is not added to its armour class.
  it("a target with Shield of Faith turns a hit into a miss", async () => {
    const s = scripted([[10]]);
    const t = table([combatant("wolf", { hp: 11, max_hp: 11 }), victim({ ac: "13", conditions: [shieldOfFaith] })], { dice: s.dice });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6", 3), target: t.get("victim"), withinFiveFeet: true });
    expect(done.summary).toMatchObject({ total: 13, targetAc: 15, hit: false });
  });

  // PHB "Shield of Faith": the ward counts while it lasts. The caller holds a stale copy of the target from before the ward
  // went up; the fight's own copy has it, so AC 13 + 2 = 15 and d20 10 + 3 = 13 misses.
  // Bug caught: the armour class boon is read off the caller's copy of the target instead of the live one.
  it("reads the target's boon from the live fight, not a stale copy", async () => {
    const s = scripted([[10]]);
    const t = table([combatant("wolf", { hp: 11, max_hp: 11 }), victim({ ac: "13", conditions: [shieldOfFaith] })], { dice: s.dice });
    const stale = victim({ ac: "13" });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6", 3), target: stale, withinFiveFeet: true });
    expect(done.summary).toMatchObject({ targetAc: 15, hit: false });
  });

  // No boon, no extra die: one ask for the d20 and one for the damage, nothing else.
  // Bug caught: a die is asked for a creature that carries no boon.
  it("a creature with no boon asks for no extra die", async () => {
    const s = scripted([[15], [4]]);
    const t = table([combatant("wolf", { hp: 11, max_hp: 11 }), victim()], { dice: s.dice });
    await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6", 3), target: t.get("victim"), withinFiveFeet: true });
    expect(s.asks).toHaveLength(2);
    expect(s.asks.some((a) => a.counts[4] !== undefined)).toBe(false);
  });
});

describe("a boon on a saving throw", () => {
  const burst: StatBlockEntry = {
    name: "Burst",
    description: "",
    structured: { kind: "save", source: "manual", save: { ability: "con", dc: 14, fail: [], success: "none", conditions: [] } },
  };

  // PHB "Bless": the d4 is added to the saving throw. DC 14, bonus 0: d20 12 + d4 of 2 = 14 saves; 12 alone fails.
  // Bug caught: a Blessed saver's d4 is not added.
  it("a Blessed creature's saving throw adds the d4", async () => {
    const s = scripted([[12], [2]]);
    const t = table([combatant("wolf", { hp: 11, max_hp: 11 }), blessed("a")], { dice: s.dice, bonus: { a: 0 } });
    const done = await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: burst, targets: [t.get("a")] });
    expect(done.summary.targets[0]).toMatchObject({ total: 14, success: true });
    expect(s.asks[1]).toMatchObject({ counts: { 4: 1 }, label: "Bless (save)" });
  });

  // An automatic failure is not rolled, so its boon is not either. Paralyzed fails a Strength save.
  // Bug caught: a boon die is thrown for a save that was never rolled.
  it("rolls no boon for a save that fails automatically", async () => {
    const s = scripted([]);
    const t = table(
      [combatant("wolf", { hp: 11, max_hp: 11 }), combatant("a", { hp: 11, max_hp: 11, conditions: [bless, { name: "Paralyzed" }] })],
      { dice: s.dice, bonus: { a: 0 } },
    );
    const str = { ...burst, structured: { ...burst.structured, save: { ...burst.structured.save!, ability: "str" as const } } };
    await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: str, targets: [t.get("a")] });
    expect(s.asks).toHaveLength(0);
  });

  // PHB "Concentration": a Constitution saving throw, so Bless adds. 10 damage is DC 10: d20 8 + d4 of 2 = 10 keeps it; 8 alone loses.
  // Bug caught: a concentration check ignores the boon.
  it("a concentration check adds the d4", async () => {
    const s = scripted([[8], [2]]);
    const t = table([blessed("mage")], { dice: s.dice, bonus: { mage: 0 } });
    const out = await resolveConcentrationOn(t.ctx, { target: t.get("mage"), damage: 10 });
    expect(out.summary).toMatchObject({ dc: 10, total: 10, maintained: true });
  });

  // A repeat save against DC 13: d20 11 + d4 of 2 = 13 succeeds; 11 alone fails.
  // Bug caught: a repeat save ignores the boon.
  it("a repeat save adds the d4", async () => {
    const frightened: AppliedCondition = { name: "Frightened", ends: { kind: "save", ability: "wis", dc: 13, at: "end" }, due: { save: true } };
    const s = scripted([[11], [2]]);
    const t = table([combatant("g", { conditions: [bless, frightened] })], { dice: s.dice, bonus: { g: 0 } });
    const out = await resolveConditionSaveOn(t.ctx, { target: t.get("g"), condition: frightened });
    expect(out.summary).toMatchObject({ total: 13, success: true });
  });
});

describe("rollBoons", () => {
  // A boon that takes away ("-1d4", the Bane shape) subtracts: a 3 on the die is -3. PHB "Bane".
  // Bug caught: the sign is ignored and a penalty is added.
  it("takes a negative boon away", async () => {
    const s = scripted([[3]]);
    const t = table([combatant("a", { conditions: [{ name: "Bane", grants: { attack: "-1d4" } }] })], { dice: s.dice });
    const out = await rollBoons(t.ctx, t.get("a"), "attack", {});
    expect(out.total).toBe(-3);
  });

  // App convention: nobody rolled (null), so the boon adds nothing.
  it("adds nothing when nobody rolled the die", async () => {
    const t = table([blessed("a")], { dice: async () => null });
    expect((await rollBoons(t.ctx, t.get("a"), "attack", {})).total).toBe(0);
  });

  // Bug caught: a boon that ended before the roll is still rolled (the stale combatant is read, not the live one).
  it("reads the creature live, so an ended boon is not rolled", async () => {
    const s = scripted([]);
    const t = table([combatant("a", { conditions: [] })], { dice: s.dice });
    const out = await rollBoons(t.ctx, blessed("a"), "attack", {});
    expect(out.total).toBe(0);
    expect(s.asks).toHaveLength(0);
  });
});
