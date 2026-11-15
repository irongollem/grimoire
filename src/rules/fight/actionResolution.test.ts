/**
 * The shared steps of resolving an action, driven by scripted dice against the real fight engine. Every expected
 * number is worked out in the comment above it from the rule it comes from, never read off a run. PHB 2014 means
 * the 2014 Player's Handbook, SRD 5.2 the 2024 System Reference Document.
 */
import { describe, expect, it } from "vitest";
import { ALL_DICE, type DieSize } from "@/lib/dice/dice";
import type { RolledFaces } from "@/lib/dice/diceRules";
import { dnd5eDiceRules } from "@/systems/dnd5e/dice/rules";
import type { RunCombatant } from "@/types/encounter.types";
import { emptyDefenses, type Defenses, type StatBlockEntry } from "@/types/statBlock.types";
import {
  ActionRefused,
  resolveAttackOn,
  resolveConcentrationOn,
  resolveConditionSaveOn,
  resolveOngoingDamageOn,
  resolveSaveOn,
  type DiceAsk,
  type DiceSource,
  type ResolutionContext,
} from "./actionResolution";
import { effectiveArmorClass, parseArmorClass } from "@/lib/encounters/actionTargeting";
import { applyFightCommand } from "./fightCommands";
import { combatant, deps, fight, pc } from "./fightTestKit";
import type { Cover } from "./terrain/sight";

/** Dice that come back as the faces the script lists, one list per roll, scored by the 5e rules like a physical roll typed in. */
function scripted(rolls: number[][]) {
  const asks: DiceAsk[] = [];
  const dice: DiceSource = async (ask) => {
    asks.push(ask);
    const flat = rolls.shift();
    if (!flat) throw new Error(`No roll was scripted for "${ask.label}"`);
    const mode = ask.mode ?? "normal";
    const faces: RolledFaces = {};
    let offset = 0;
    for (const sides of ALL_DICE) {
      const need = dnd5eDiceRules.facesNeeded(sides, ask.counts[sides] ?? 0, mode);
      if (need > 0) faces[sides as DieSize] = flat.slice(offset, offset + need);
      offset += need;
    }
    if (offset !== flat.length) throw new Error(`"${ask.label}" took ${offset} faces, the script gave ${flat.length}`);
    return { result: dnd5eDiceRules.score(ask.counts, ask.modifier, mode, faces), byPerson: false };
  };
  return { dice, asks };
}

interface Setup {
  dice: DiceSource;
  /** Save bonus by instance id; a combatant not listed has none (a player rolls their own). */
  bonus?: Record<string, number>;
  defenses?: Record<string, Defenses>;
  ruleset?: "2014" | "2024";
  /** The cover each target (by instance id) has against whoever acts; supplying this installs the context's `coverFor` hook, like the server does. A target not listed is unknown (null). */
  cover?: Record<string, Cover>;
}

/** A fight, and the context that resolves against it. `state()` is the fight as the resolution left it. */
function table(combatants: RunCombatant[], setup: Setup) {
  const ruleset = setup.ruleset ?? "2014";
  let current = fight(combatants, [], { ruleset });
  const ctx: ResolutionContext = {
    ruleset,
    dice: setup.dice,
    armorClassFor: (c) => parseArmorClass(effectiveArmorClass(c)),
    defensesFor: (c) => setup.defenses?.[c.instance_id] ?? emptyDefenses(),
    saveBonusFor: (c) => setup.bonus?.[c.instance_id] ?? null,
    live: (c) => current.combatants.find((x) => x.instance_id === c.instance_id) ?? c,
    coverFor: setup.cover
      ? (_attacker, target) => {
          const found = setup.cover?.[target.instance_id];
          return found === undefined ? null : found;
        }
      : undefined,
    apply(command) {
      const result = applyFightCommand(current, command, deps());
      current = result.state;
      return result.effects;
    },
  };
  const get = (id: string): RunCombatant => {
    const found = current.combatants.find((c) => c.instance_id === id);
    if (!found) throw new Error(`no ${id}`);
    return found;
  };
  return { ctx, get, hp: (id: string) => get(id).hp };
}

const bite = (dice: string, bonus = 4): StatBlockEntry => ({
  name: "Bite",
  description: "",
  structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus, hit: [{ dice, type: "piercing" }] } },
});

const wolf = () => combatant("wolf", { hp: 11, max_hp: 11 });
const victim = (over: Partial<RunCombatant> = {}) => combatant("victim", { hp: 40, max_hp: 40, ac: "13", ...over });

describe("resolveAttackOn: to hit and damage", () => {
  // PHB 2014 "Making an Attack": the attack hits when the total equals or exceeds the target's AC. d20 9 + 4 = 13 against
  // AC 13 hits; d20 8 + 4 = 12 misses. 1d6+2 with a 5 on the die deals 7, taken off 40 hit points.
  it("a total equal to AC hits and takes exactly the rolled damage off; one short misses and rolls no damage", async () => {
    const hit = scripted([[9], [5]]);
    const t = table([wolf(), victim()], { dice: hit.dice });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6+2"), target: t.get("victim"), withinFiveFeet: true });
    expect(done.summary).toMatchObject({ natural: 9, total: 13, targetAc: 13, hit: true, critical: false, damageTotal: 7 });
    expect(t.hp("victim")).toBe(33);

    const miss = scripted([[8]]);
    const t2 = table([wolf(), victim()], { dice: miss.dice });
    const missed = await resolveAttackOn(t2.ctx, { attacker: t2.get("wolf"), entry: bite("1d6+2"), target: t2.get("victim"), withinFiveFeet: true });
    expect(missed.summary).toMatchObject({ total: 12, hit: false, damageTotal: 0, damage: [] });
    expect(miss.asks).toHaveLength(1);
    expect(t2.hp("victim")).toBe(40);
  });

  // PHB 2014 "Critical Hits": a natural 20 hits whatever the AC and the damage dice are rolled twice, the modifier added
  // once. 2d6+3 becomes 4d6+3: faces 6+5+4+3 = 18, plus 3 = 21, off 40 leaves 19. Doubling the modifier would leave 16.
  it("a natural 20 hits whatever the armour and doubles the dice, not the modifier", async () => {
    const s = scripted([[20], [6, 5, 4, 3]]);
    const t = table([wolf(), victim({ ac: "30" })], { dice: s.dice });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("2d6+3"), target: t.get("victim"), withinFiveFeet: true });
    expect(done.summary).toMatchObject({ hit: true, critical: true, damageTotal: 21 });
    expect(s.asks[1]).toMatchObject({ counts: { 6: 4 }, modifier: 3, isDamage: true });
    expect(t.hp("victim")).toBe(19);
  });

  // PHB 2014 "Making an Attack": a natural 1 misses whatever the modifiers. 1 + 4 = 5 would beat AC 4, but it misses.
  it("a natural 1 misses even when the total beats the armour", async () => {
    const s = scripted([[1]]);
    const t = table([wolf(), victim({ ac: "4" })], { dice: s.dice });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6"), target: t.get("victim"), withinFiveFeet: true });
    expect(done.summary).toMatchObject({ total: 5, hit: false, fumble: true });
    expect(t.hp("victim")).toBe(40);
  });

  // PHB 2014 "Damage Resistance and Vulnerability": resistance halves the damage (rounded down), vulnerability doubles it,
  // immunity takes none. A 7 piercing: resistant floor(7/2) = 3, vulnerable 14, immune 0.
  it.each([
    ["resistance", { resistances: [{ types: ["piercing" as const] }] }, 3, 37],
    ["vulnerability", { vulnerabilities: [{ types: ["piercing" as const] }] }, 14, 26],
    ["immunity", { immunities: [{ types: ["piercing" as const] }] }, 0, 40],
  ])("the target's %s is applied to the damage before hit points are taken off", async (_name, defense, taken, left) => {
    const s = scripted([[15], [5]]);
    const t = table([wolf(), victim()], { dice: s.dice, defenses: { victim: { ...emptyDefenses(), ...defense } } });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6+2"), target: t.get("victim"), withinFiveFeet: true });
    expect(done.summary.damageTotal).toBe(taken);
    expect(done.summary.damage[0]).toMatchObject({ rolled: 7, applied: taken });
    expect(t.hp("victim")).toBe(left);
    // An immune target loses nothing, so no hit-point command is issued at all.
    expect(done.commands.some((c) => c.type === "adjust_hp")).toBe(taken > 0);
  });

  // PHB 2014 "Advantage and Disadvantage": advantage keeps the higher of two d20s. A Blinded target gives attackers
  // advantage (appendix A "Blinded"): faces 4 and 15 keep 15, +4 = 19 beats AC 18 (the 4 alone would miss).
  it("advantage from the target's condition keeps the higher of two d20s", async () => {
    const s = scripted([[4, 15], [3]]);
    const t = table([wolf(), victim({ ac: "18", conditions: [{ name: "Blinded" }] })], { dice: s.dice });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6"), target: t.get("victim"), withinFiveFeet: true });
    expect(s.asks[0].mode).toBe("advantage");
    expect(done.summary).toMatchObject({ natural: 15, total: 19, hit: true, mode: "advantage" });
  });

  // PHB 2014 "Advantage and Disadvantage": advantage and disadvantage cancel, however many of each. A Blinded target
  // (advantage) against a Poisoned attacker (disadvantage, appendix A "Poisoned") is a straight roll: one die, 10 + 4 = 14.
  it("advantage and disadvantage cancel to one plain d20", async () => {
    const s = scripted([[10], [3]]);
    const t = table([combatant("wolf", { hp: 11, max_hp: 11, conditions: [{ name: "Poisoned" }] }), victim({ ac: "13", conditions: [{ name: "Blinded" }] })], {
      dice: s.dice,
    });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6"), target: t.get("victim"), withinFiveFeet: true });
    expect(s.asks[0].mode).toBe("normal");
    expect(done.summary).toMatchObject({ natural: 10, total: 14, mode: "normal" });
  });

  // PHB 2014 appendix A "Paralyzed": an attack that hits is a critical hit if the attacker is within 5 feet. Paralyzed also
  // gives advantage: faces 12 and 3 keep 12, 12 + 4 = 16 beats AC 10. The critical doubles 1d6+2 to 2d6+2: 4 + 3 = 7, +2 = 9.
  // From beyond 5 feet it is a plain hit: 1d6+2 with a 4 deals 6.
  it("a hit on a paralyzed target within five feet is a critical, and from farther away it is not", async () => {
    const near = scripted([[12, 3], [4, 3]]);
    const t = table([wolf(), victim({ ac: "10", conditions: [{ name: "Paralyzed" }] })], { dice: near.dice });
    const crit = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6+2"), target: t.get("victim"), withinFiveFeet: true });
    expect(crit.summary).toMatchObject({ hit: true, critical: true, damageTotal: 9 });
    expect(near.asks[1].counts).toEqual({ 6: 2 });

    const far = scripted([[12, 3], [4]]);
    const t2 = table([wolf(), victim({ ac: "10", conditions: [{ name: "Paralyzed" }] })], { dice: far.dice });
    const plain = await resolveAttackOn(t2.ctx, { attacker: t2.get("wolf"), entry: bite("1d6+2"), target: t2.get("victim"), withinFiveFeet: false });
    expect(plain.summary).toMatchObject({ hit: true, critical: false, damageTotal: 6 });
  });

  // App convention: a further penalty (a called shot) comes off the total as well as the roll's modifier. d20 17 + 4 - 5 = 16
  // misses AC 17; without the penalty the 21 would hit.
  it("a penalty on the roll to hit is counted in the total", async () => {
    const s = scripted([[17]]);
    const t = table([wolf(), victim({ ac: "17" })], { dice: s.dice });
    const done = await resolveAttackOn(t.ctx, {
      attacker: t.get("wolf"), entry: bite("1d6"), target: t.get("victim"), withinFiveFeet: true, extraPenalty: -5,
    });
    expect(s.asks[0].modifier).toBe(-1);
    expect(done.summary).toMatchObject({ total: 16, hit: false });
  });

  it("refuses a target whose armour class has no number, instead of guessing a hit", async () => {
    const t = table([wolf(), victim({ ac: "see sheet" })], { dice: scripted([[15]]).dice });
    await expect(
      resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6"), target: t.get("victim"), withinFiveFeet: true }),
    ).rejects.toBeInstanceOf(ActionRefused);
  });

  it("resolves the save a hit forces on the creature that was hit, after the damage", async () => {
    const ghoul: StatBlockEntry = {
      name: "Claws",
      description: "",
      structured: {
        kind: "attack", source: "manual",
        attack: { delivery: "melee", bonus: 4, hit: [{ dice: "2d4+2", type: "slashing" }] },
        save: { ability: "con", dc: 10, fail: [], success: "none", conditions: [{ name: "Paralyzed" }] },
      },
    };
    // d20 15 hits AC 13; 2d4+2 with 3 + 2 deals 7. The victim's Con save: d20 4 + 0 = 4 < DC 10, so it is Paralyzed.
    const s = scripted([[15], [3, 2], [4]]);
    const t = table([wolf(), victim()], { dice: s.dice, bonus: { victim: 0 } });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: ghoul, target: t.get("victim"), withinFiveFeet: true });
    expect(t.hp("victim")).toBe(33);
    expect(done.summary.save).toMatchObject({ success: false, conditionsApplied: ["Paralyzed"] });
    expect(t.get("victim").conditions.map((c) => c.name)).toEqual(["Paralyzed"]);
  });
});

describe("resolveSaveOn", () => {
  const fireball: StatBlockEntry = {
    name: "Fire Burst",
    description: "",
    structured: {
      kind: "save", source: "manual",
      save: { ability: "dex", dc: 14, fail: [{ dice: "8d6", type: "fire" }], success: "half", conditions: [{ name: "Prone" }] },
    },
  };
  const crowd = () => [wolf(), combatant("a", { hp: 40, max_hp: 40 }), combatant("b", { hp: 40, max_hp: 40 }), combatant("c", { hp: 40, max_hp: 40 })];

  // PHB 2014 "Saving Throws" and the spell rule "a success takes half": one damage roll for everyone. 8d6 faces
  // 6+5+3+3+2+2+1+1 = 23. a rolls 5+0 = 5 < DC 14: fails and takes 23. b rolls 12+3 = 15: saves and takes half, 23/2 rounded
  // down (PHB 2014 ch. 1 "Rounding Down") = 11. c fails (3+0) but is immune to Prone. From 40: a 17, b 29, c 17.
  it("rolls the damage once for all, halves it once for the saver, and gives the failers the condition unless they are immune", async () => {
    const s = scripted([[5], [12], [3], [6, 5, 3, 3, 2, 2, 1, 1]]);
    const t = table(crowd(), {
      dice: s.dice,
      bonus: { a: 0, b: 3, c: 0 },
      defenses: { c: { ...emptyDefenses(), condition_immunities: ["Prone"] } },
    });
    const done = await resolveSaveOn(t.ctx, {
      attacker: t.get("wolf"), entry: fireball, targets: [t.get("a"), t.get("b"), t.get("c")],
    });
    expect(s.asks.filter((a) => a.isDamage)).toHaveLength(1);
    expect(s.asks.filter((a) => !a.isDamage).map((a) => a.rollerId)).toEqual(["a", "b", "c"]);
    expect([t.hp("a"), t.hp("b"), t.hp("c")]).toEqual([17, 29, 17]);
    expect(done.summary.targets.map((x) => [x.success, x.share, x.damageTotal])).toEqual([
      [false, "full", 23],
      [true, "half", 11],
      [false, "full", 23],
    ]);
    expect(t.get("a").conditions.map((c) => c.name)).toEqual(["Prone"]);
    expect(t.get("b").conditions).toEqual([]);
    expect(t.get("c").conditions).toEqual([]);
    expect(done.summary.targets[2].conditionsImmune).toEqual(["Prone"]);
  });

  // SRD "Damage Rolls" rounds the half down once over the whole roll: 7 fire + 7 poison is 14, half is 7 (not 3 + 3 = 6).
  it("halves a damage roll of several parts once over the whole roll", async () => {
    const twoParts: StatBlockEntry = {
      ...fireball,
      structured: {
        kind: "save", source: "manual",
        save: { ability: "dex", dc: 14, fail: [{ dice: "1d8", type: "fire" }, { dice: "1d8", type: "poison" }], success: "half", conditions: [] },
      },
    };
    const s = scripted([[18], [7], [7]]);
    const t = table(crowd(), { dice: s.dice, bonus: { a: 0 } });
    const done = await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: twoParts, targets: [t.get("a")] });
    expect(done.summary.targets[0]).toMatchObject({ success: true, damageTotal: 7 });
    expect(t.hp("a")).toBe(33);
  });

  // PHB 2014 appendix A "Paralyzed": automatically fails Strength and Dexterity saves, so no die is rolled for it.
  it("throws no die for a target that fails automatically, and no damage when every target saved against a save with no half", async () => {
    const web: StatBlockEntry = {
      ...fireball,
      structured: { kind: "save", source: "manual", save: { ability: "dex", dc: 12, fail: [{ dice: "2d6", type: "bludgeoning" }], success: "none", conditions: [] } },
    };
    // a is Paralyzed: it fails without a die, and 2d6 (3 + 4) is rolled for it: 40 - 7 = 33.
    const failing = scripted([[3, 4]]);
    const t = table([wolf(), combatant("a", { hp: 40, max_hp: 40, conditions: [{ name: "Paralyzed" }] })], { dice: failing.dice, bonus: { a: 0 } });
    const done = await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: web, targets: [t.get("a")] });
    expect(failing.asks.every((a) => a.isDamage)).toBe(true);
    expect(done.summary.targets[0]).toMatchObject({ autoFail: true, natural: null, success: false, damageTotal: 7 });
    expect(t.hp("a")).toBe(33);

    // b saves (15 + 0 >= 12) and a save with no half takes nothing, so no damage dice are thrown at all.
    const saving = scripted([[15]]);
    const t2 = table([wolf(), combatant("b", { hp: 40, max_hp: 40 })], { dice: saving.dice, bonus: { b: 0 } });
    const saved = await resolveSaveOn(t2.ctx, { attacker: t2.get("wolf"), entry: web, targets: [t2.get("b")] });
    expect(saved.amounts).toEqual([]);
    expect(saving.asks).toHaveLength(1);
    expect(t2.hp("b")).toBe(40);
  });

  it("refuses a target with no stat block to make the save from", async () => {
    const t = table([wolf(), pc("nessa")], { dice: scripted([]).dice });
    await expect(resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: fireball, targets: [t.get("nessa")] })).rejects.toThrow(/player rolls it/);
  });
});

describe("concentration, repeat saves and ongoing damage", () => {
  // PHB 2014 "Concentration": the Constitution save DC is 10 or half the damage, whichever is higher. 30 damage is DC 15.
  // d20 11 + 3 = 14 loses; 12 + 3 = 15 keeps. A lost save ends what the creature held.
  it("a Constitution save at max(10, half the damage) ends the concentration when it falls short, by one", async () => {
    const held = combatant("mage", {
      hp: 20, max_hp: 20,
      concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] },
    });
    const lost = table([held], { dice: scripted([[11]]).dice, bonus: { mage: 3 } });
    const out = await resolveConcentrationOn(lost.ctx, { target: lost.get("mage"), damage: 30 });
    expect(out.summary).toMatchObject({ dc: 15, total: 14, maintained: false });
    expect(lost.get("mage").concentration).toBeNull();

    const kept = table([held], { dice: scripted([[12]]).dice, bonus: { mage: 3 } });
    const ok = await resolveConcentrationOn(kept.ctx, { target: kept.get("mage"), damage: 30 });
    expect(ok.summary).toMatchObject({ total: 15, maintained: true });
    expect(kept.get("mage").concentration).not.toBeNull();
  });

  // A repeat save against the condition's own DC: d20 12 + 1 = 13 meets DC 13, so the condition ends; 11 + 1 = 12 keeps it.
  it("a repeat save at the condition's DC ends it on a success and leaves it on a failure", async () => {
    const stunned = (): RunCombatant =>
      combatant("g", { conditions: [{ name: "Frightened", ends: { kind: "save", ability: "wis", dc: 13, at: "end" }, due: { save: true } }] });
    const pass = table([stunned()], { dice: scripted([[12]]).dice, bonus: { g: 1 } });
    const passed = await resolveConditionSaveOn(pass.ctx, { target: pass.get("g"), condition: pass.get("g").conditions[0] });
    expect(passed.summary).toMatchObject({ total: 13, success: true });
    expect(pass.get("g").conditions).toEqual([]);

    const fail = table([stunned()], { dice: scripted([[11]]).dice, bonus: { g: 1 } });
    const failed = await resolveConditionSaveOn(fail.ctx, { target: fail.get("g"), condition: fail.get("g").conditions[0] });
    expect(failed.summary).toMatchObject({ total: 12, success: false });
    expect(fail.get("g").conditions.map((c) => c.name)).toEqual(["Frightened"]);
    // The debt is cleared, so it is not owed again until the next turn edge.
    expect(fail.get("g").conditions[0].due?.save).toBeFalsy();
  });

  // Ongoing damage goes through the bearer's defenses: 1d4 fire with a 3 is 3; a fire-resistant bearer takes floor(3/2) = 1.
  it("ongoing damage is rolled, run through defenses, taken off, and the debt cleared", async () => {
    const burning = (): RunCombatant =>
      combatant("g", { hp: 10, max_hp: 10, conditions: [{ name: "Burning", ongoing: { dice: "1d4", type: "fire", at: "start" }, due: { damage: true } }] });
    const plain = table([burning()], { dice: scripted([[3]]).dice });
    const out = await resolveOngoingDamageOn(plain.ctx, { target: plain.get("g"), condition: plain.get("g").conditions[0] });
    expect(out.summary.damageTotal).toBe(3);
    expect(plain.hp("g")).toBe(7);
    expect(plain.get("g").conditions[0].due?.damage).toBeFalsy();

    const resistant = table([burning()], {
      dice: scripted([[3]]).dice,
      defenses: { g: { ...emptyDefenses(), resistances: [{ types: ["fire"] }] } },
    });
    await resolveOngoingDamageOn(resistant.ctx, { target: resistant.get("g"), condition: resistant.get("g").conditions[0] });
    expect(resistant.hp("g")).toBe(9);
  });
});

// PHB 2014 ch. 9 "Cover": half cover +2 to AC and Dexterity saves, three-quarters +5, total cannot be targeted directly.
describe("cover on the server's attacks and saves", () => {
  const attackWith = async (cover: Cover | undefined, faces: number[][], targetOver: Partial<RunCombatant> = {}) => {
    const s = scripted(faces);
    const t = table([wolf(), victim(targetOver)], { dice: s.dice, cover: cover === undefined ? undefined : { victim: cover } });
    const done = await resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6+2"), target: t.get("victim"), withinFiveFeet: true });
    return { done, t, s };
  };

  // Wolf +4, d20 11: total 15. AC 13 plus half cover +2 is 15, and 15 meets 15, so it hits (boundary). With d20 10 the total
  // is 14: it would hit AC 13 and misses AC 15. Cover that was dropped would leave "targetAc: 13" and the 14 a hit.
  it("fails if half cover does not add 2 to the armour class, on both sides of the new number", async () => {
    const hit = await attackWith("half", [[11], [5]]);
    expect(hit.done.summary).toMatchObject({ total: 15, targetAc: 15, cover: "half", coverAc: 2, hit: true, damageTotal: 7 });
    const miss = await attackWith("half", [[10]]);
    expect(miss.done.summary).toMatchObject({ total: 14, targetAc: 15, cover: "half", coverAc: 2, hit: false, damageTotal: 0 });
    expect(miss.t.hp("victim")).toBe(40);
  });

  // Same wolf: AC 13 + 5 = 18. d20 14 totals 18 and hits; d20 13 totals 17 and misses (it would be a hit against 15, half cover's AC).
  it("fails if three-quarters cover adds 2 instead of 5, on both sides of the new number", async () => {
    const hit = await attackWith("three_quarters", [[14], [5]]);
    expect(hit.done.summary).toMatchObject({ total: 18, targetAc: 18, cover: "three_quarters", coverAc: 5, hit: true });
    const miss = await attackWith("three_quarters", [[13]]);
    expect(miss.done.summary).toMatchObject({ total: 17, targetAc: 18, coverAc: 5, hit: false });
  });

  // No cover, or an unknown one, leaves AC 13: d20 9 + 4 = 13 hits, and the summary says what was known.
  it("fails if 'none' or an unknown cover changes the armour class", async () => {
    const none = await attackWith("none", [[9], [5]]);
    expect(none.done.summary).toMatchObject({ targetAc: 13, cover: "none", coverAc: 0, hit: true });
    const unknown = await attackWith(undefined, [[9], [5]]);
    expect(unknown.done.summary).toMatchObject({ targetAc: 13, cover: null, coverAc: 0, hit: true });
    const notKnown = table([wolf(), victim()], { dice: scripted([[9], [5]]).dice, cover: {} });
    const done = await resolveAttackOn(notKnown.ctx, { attacker: notKnown.get("wolf"), entry: bite("1d6+2"), target: notKnown.get("victim"), withinFiveFeet: true });
    expect(done.summary).toMatchObject({ targetAc: 13, cover: null, coverAc: 0 });
  });

  // PHB 2014 ch. 9: total cover cannot be targeted directly. Refused naming both, before any die is thrown (the script holds none).
  it("fails if an attack on a target with total cover rolls a die or hurts it", async () => {
    const s = scripted([]);
    const t = table([wolf(), victim()], { dice: s.dice, cover: { victim: "total" } });
    await expect(
      resolveAttackOn(t.ctx, { attacker: t.get("wolf"), entry: bite("1d6+2"), target: t.get("victim"), withinFiveFeet: true }),
    ).rejects.toThrow(/victim has total cover from wolf/);
    expect(s.asks).toHaveLength(0);
    expect(t.hp("victim")).toBe(40);
  });

  const burst = (ability: "dex" | "con"): StatBlockEntry => ({
    name: "Burst",
    description: "",
    structured: { kind: "save", source: "manual", save: { ability, dc: 14, fail: [{ dice: "2d6", type: "fire" }], success: "half", conditions: [] } },
  });
  const saveWith = async (cover: Cover | undefined, d20: number, ability: "dex" | "con" = "dex") => {
    // A failed or successful save both take damage here (half on a success), so the damage die is always scripted: 3 + 4 = 7.
    const s = scripted([[d20], [3, 4]]);
    const t = table([wolf(), combatant("a", { hp: 40, max_hp: 40 })], { dice: s.dice, bonus: { a: 0 }, cover: cover === undefined ? undefined : { a: cover } });
    const done = await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: burst(ability), targets: [t.get("a")] });
    return { target: done.summary.targets[0], s };
  };

  // DC 14, Dex +0. Half cover +2: d20 12 totals 14 and saves (boundary); d20 11 totals 13 and fails. Without the cover 12 fails.
  it("fails if half cover does not add 2 to a Dexterity save, on both sides of the DC", async () => {
    const saved = await saveWith("half", 12);
    expect(saved.target).toMatchObject({ total: 14, coverBonus: 2, success: true, share: "half" });
    expect(saved.s.asks[0].modifier).toBe(2);
    const failed = await saveWith("half", 11);
    expect(failed.target).toMatchObject({ total: 13, coverBonus: 2, success: false, share: "full" });
  });

  it("fails if three-quarters cover does not add 5 to a Dexterity save, on both sides of the DC", async () => {
    const saved = await saveWith("three_quarters", 9);
    expect(saved.target).toMatchObject({ total: 14, coverBonus: 5, success: true });
    const failed = await saveWith("three_quarters", 8);
    expect(failed.target).toMatchObject({ total: 13, coverBonus: 5, success: false });
  });

  // App convention: a save action is not refused at total cover (areas can round corners); the target gets the three-quarters
  // bonus. d20 9 + 5 = 14 saves; a refusal or a +0 would not leave this save.
  it("fails if a target at total cover is refused a save or given no bonus", async () => {
    const saved = await saveWith("total", 9);
    expect(saved.target).toMatchObject({ total: 14, coverBonus: 5, success: true });
  });

  // PHB 2014 ch. 9 gives cover to Dexterity saves only. A Constitution save of d20 12 + 0 = 12 fails DC 14 under half cover.
  it("fails if cover is added to a save that is not a Dexterity save", async () => {
    const failed = await saveWith("half", 12, "con");
    expect(failed.target).toMatchObject({ total: 12, coverBonus: 0, success: false });
  });

  // Nothing known (no hook, or no entry for the target) is no bonus: the same d20 12 fails DC 14.
  it("fails if a save with no known cover gets a bonus", async () => {
    const failed = await saveWith(undefined, 12);
    expect(failed.target).toMatchObject({ total: 12, coverBonus: 0, success: false });
  });
});
