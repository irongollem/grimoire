// The numbers on an attack option (#1203): the chance to hit and the damage to expect, so a picker (or a model) can
// weigh one attack against another. A turn option carries `hitChance` and `expectedDamage` as null until this fills
// them in.
//
// What is a book rule here: a natural 1 always misses and a natural 20 always hits (PHB 2014 ch. 9 "Rolling 1 or 20"),
// advantage and disadvantage on the d20 (ch. 9 "Advantage and Disadvantage"), long range and an enemy within 5 feet
// both imposing disadvantage on a ranged attack (ch. 9 "Ranged Attacks"), cover's bonus to AC (ch. 9 "Cover"), and a
// critical hit rolling the damage dice twice (ch. 9 "Critical Hits"). What is app convention: reading a stat block's
// structure to average it, the mean over a Multiattack, and what is left out.
//
// Damage resistance, immunity and vulnerability are weighed only as far as the fight has shown them (#1021): a part of
// a hit is multiplied by what `shown_defenses` on the target says for its type (0, 0.5 or 2) and by 1 otherwise. A
// creature cannot read its target's sheet, so a defense nothing has shown is never counted, whatever the stat block
// says. Not modelled: damage from a magical source (it looks up the plain type), a hit that is an
// automatic critical against a Paralyzed or Unconscious target, riders that need a saving throw, a creature that
// attacks with a weapon it has not got. Nothing is rounded here; only a summary line rounds, for display.
//
// A spell option (#1021) is weighed with the same arithmetic: an attack spell is `oneAttack` on its entry, a save spell
// is the chance each target fails its save (a natural 20 does not save on a saving throw; PHB 2014 ch. 7 "Saving
// Throws") times the damage, plus the chance it succeeds times half of it when the spell halves. A spell attack is
// weighed with no cover and no enemy-within-5-feet penalty, and a save with no cover bonus: none of the three is known
// to the option.
//
// Sneak Attack is weighed too (#1021): when the mover is a Rogue ally whose use this turn is not spent (`sneakDiceOf`), an
// eligible swing (advantage, or normal with an enemy of the target within 5 feet, `enemyBesideTarget`: the rule `resolve_attack`
// applies) adds the dice once per option, as the chance this swing is the first eligible one to hit, so a Multiattack is not
// credited with a Sneak Attack per swing. A dagger beats a longsword for a Rogue when it applies, by arithmetic and not by a special case.
//
// A spell that imposes a condition is worth something too (#1021, the clever layer): `expectedWorth` is, summed over the
// targets, the chance each fails its save times what the condition is worth on it (`conditionWorth.ts`, in hit points,
// built only from what the fight has shown of that target). A condition the target already bears is worth 0 on it, and a
// spell that imposes nothing has a worth of 0. Several conditions on one spell are not added: the worth is the largest.
//
// Pure and edge-importable (relative `.ts` imports only).

import { parseExpression } from "../../../lib/dice/dice.ts";
import type { RollMode } from "../../../systems/dnd5e/dice/rollMode.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { AttackStructure, DamagePart, SaveAbility, SaveCondition, SaveStructure } from "../../../types/statBlock.types.ts";
import { attackRollMode } from "../../combat/attackRoll.ts";
import { enemyBesideTarget } from "../allies/sneak.ts";
import type { FactionSides } from "../sides.ts";
import { autoFailsSave, saveRollMode } from "../../combat/savingThrow.ts";
import { getExhaustionD20Penalty } from "../../conditions.ts";
import { boonArmorClass, boonMean } from "../boons.ts";
import { coverBonus, DEFAULT_REACH_FEET } from "../terrain/sight.ts";
import { ASSUMED_ROUNDS, conditionWorth, expectedRounds, type StopsCasting } from "./conditionWorth.ts";
import { shownDefenseMultiplier } from "./shownDefenses.ts";
import type { CastNow } from "../spells/castNow.ts";
import type { TurnOption, TurnOptionAttack, TurnOptionSpell, UsableAttack } from "../terrain/options/types.ts";

export interface NumbersContext {
  /** The mover's usable attacks: where an option's entry, and a Multiattack's steps, are found by name. */
  attacks: readonly UsableAttack[];
  combatants: readonly RunCombatant[];
  moverId: string;
  /** A target's armor class, or null when it is not known: both numbers of its options stay null. */
  armorClassOf: (target: RunCombatant) => number | null;
  ruleset: RulesetKey;
  /** The mover's castable spells: where a spell option's entry is found. Left out for a creature that casts none. */
  spells?: readonly CastNow[];
  /** A target's bonus on a save of this ability, or null when it is not known (the chance to fail is then `UNKNOWN_SAVE_FAIL_CHANCE`). */
  saveBonusOf?: (target: RunCombatant, ability: SaveAbility) => number | null;
  /**
   * The Sneak Attack dice the mover would add to a hit of the attack named so, or null: it has no Sneak Attack, the attack is not one it
   * rides, or the turn's one use is already spent. Left out for a creature with no Sneak Attack (every monster).
   */
  sneakDiceOf?: (attackName: string) => string | null;
  /** Who fights whom, for the enemy beside the target that makes Sneak Attack apply. Left out, nothing is hostile (a Sneak Attack then needs advantage). */
  factions?: FactionSides;
}

/** APP CONVENTION: a target whose save bonus is not known (a character the server could not read) fails half the time. */
export const UNKNOWN_SAVE_FAIL_CHANCE = 0.5;

/**
 * The chance one saving throw fails against `dc`: the faces that reach it with `bonus` save, and unlike an attack roll a
 * natural 20 is no automatic success and a 1 no automatic failure (PHB 2014 ch. 7 "Saving Throws"). Need 14 with +0:
 * faces 14 to 20 are 7 of 20 saving, so it fails 65% of the time.
 */
export function chanceToFail(bonus: number, dc: number, mode: RollMode): number {
  return 1 - withMode(interpolated(bonus, (b) => Math.min(20, Math.max(0, 21 - (dc - b))) / 20), mode);
}

/**
 * The chance one d20 attack hits: the faces that reach `ac` with `bonus`, a natural 20 always, a natural 1 never
 * (PHB 2014 ch. 9 "Rolling 1 or 20"). Need 9 on the die: faces 9 to 19 are 11, plus the 20 is 12 of 20.
 */
export function chanceToHit(bonus: number, ac: number, mode: RollMode): number {
  return withMode(
    interpolated(bonus, (b) => (Math.max(0, 20 - Math.max(ac - b, 2)) + 1) / 20),
    mode,
  );
}

/**
 * APP CONVENTION: a boon's mean (Bless adds 2.5) makes the bonus fractional. The face count is only defined for whole
 * bonuses, so a fractional one reads linearly between the whole bonuses either side. Chosen over the exact mean over the
 * boon's faces because it needs no knowledge of the dice and is exact whenever the count of faces is linear in the bonus
 * (everywhere but at the natural 1 and 20 limits, where it stays monotonic and never leaves them). It equals the whole-bonus
 * result for a whole bonus, and the natural 20 and natural 1 limits live inside `faceChance`, so they still hold. The
 * interpolation is on the single-die chance, before advantage or disadvantage is applied.
 */
function interpolated(bonus: number, faceChance: (whole: number) => number): number {
  const low = Math.floor(bonus);
  if (low === bonus) return faceChance(bonus);
  const share = bonus - low;
  return faceChance(low) * (1 - share) + faceChance(low + 1) * share;
}

/** The chance a natural 20 shows on the kept die. */
export function chanceOfNatural20(mode: RollMode): number {
  return withMode(1 / 20, mode);
}

/** Advantage keeps the better of two dice (1 - (1 - p)^2), disadvantage the worse (p^2). PHB 2014 ch. 9. */
function withMode(p: number, mode: RollMode): number {
  if (mode === "advantage") return 1 - (1 - p) * (1 - p);
  if (mode === "disadvantage") return p * p;
  return p;
}

/** A spell's damage is magical, as `cast_spell` resolves it: it is weighed against what the fight has shown of magical blows. */
const SPELL_DAMAGE: readonly string[] = ["magical"];

/** The average of what a hit rolls, and of its dice alone (a critical rolls those twice). Null when a part cannot be read. */
function averageOf(parts: readonly DamagePart[], target: RunCombatant, properties: readonly string[] = []): { all: number; diceOnly: number } | null {
  let all = 0;
  let diceOnly = 0;
  for (const part of parts) {
    const parsed = parseExpression(part.dice);
    if (parsed === null) return null;
    const dice = parsed.terms.reduce((sum, t) => sum + (t.count * (t.sides + 1)) / 2, 0);
    // Per target, per part: only a defense the fight has shown to this target counts.
    const weight = shownDefenseMultiplier(target, part.type, properties);
    all += (dice + parsed.modifier) * weight;
    diceOnly += dice * weight;
  }
  return { all, diceOnly };
}

/** The mode of one attack from one square, by the one attack rule (`attackRollMode`). */
function modeOf(attack: AttackStructure, facts: TurnOptionAttack, mover: RunCombatant, target: RunCombatant, ruleset: RulesetKey): RollMode {
  const distance = facts.distanceFeet;
  const near = distance !== null && distance <= DEFAULT_REACH_FEET;
  // A melee-or-ranged attack is thrown when the target is beyond the reach it would swing at.
  const reach = attack.reach === undefined ? DEFAULT_REACH_FEET : attack.reach;
  const thrown = attack.delivery === "melee_or_ranged" && distance !== null && distance > reach;
  const delivery = attack.delivery === "ranged" || thrown ? "ranged" : "melee";
  return attackRollMode({
    attackerConditions: mover.conditions,
    targetConditions: target.conditions,
    delivery,
    // Prone asks whether the attacker is within 5 ft of the target; a ranged attack's close combat and long range are
    // their own facts (`attackFrom` worked them out for this square).
    withinFiveFeet: near,
    hostileWithinFiveFeetOfAttacker: facts.closeCombat === true,
    longRange: facts.longRange === true,
    ruleset,
  }).mode;
}

/** One attack's hit chance and the damage it adds (null when a damage part cannot be read). */
function oneAttack(attack: AttackStructure, facts: TurnOptionAttack, mover: RunCombatant, target: RunCombatant, ac: number, ruleset: RulesetKey, properties: readonly string[] = []): { hit: number; damage: number | null } {
  // Total cover cannot be targeted at all; no attack option is ever made from such a square, so this is only a guard.
  if (facts.cover === "total") return { hit: 0, damage: 0 };
  const mode = modeOf(attack, facts, mover, target, ruleset);
  // Cover adds to the target's AC (PHB 2014 ch. 9 "Cover"); the 2024 exhaustion penalty lowers the roll.
  // A boon (Bless) adds its mean to the roll; the target's boon (Shield of Faith) adds to its AC. Both weapon and spell attacks come through here.
  const bonus = attack.bonus + getExhaustionD20Penalty(mover.conditions, ruleset) + boonMean(mover.conditions, "attack");
  const hit = chanceToHit(bonus, ac + boonArmorClass(target.conditions) + coverBonus(facts.cover === null ? "none" : facts.cover).ac, mode);
  const avg = averageOf(attack.hit, target, properties);
  // A critical hit rolls the dice twice: the extra roll is the dice alone, on a natural 20 (ch. 9 "Critical Hits").
  const damage = avg === null ? null : hit * avg.all + chanceOfNatural20(mode) * avg.diceOnly;
  return { hit, damage };
}

function numbersFor(attack: TurnOptionAttack, mover: RunCombatant, target: RunCombatant, ac: number, ctx: NumbersContext): { hitChance: number; expectedDamage: number | null } | null {
  const named = (name: string) => ctx.attacks.find((a) => a.entry.name === name)?.entry.structured.attack;
  const steps = attack.steps ?? [{ action: attack.action, count: 1 }];
  let swings = 0;
  let hits = 0;
  let damage: number | null = 0;
  // Sneak Attack, once: the chance nothing eligible has hit yet, and what the dice add so far (null when a part cannot be read).
  let nothingYet = 1;
  let sneak: number | null = 0;
  const beside = ctx.sneakDiceOf === undefined ? false : enemyBesideTarget(ctx.combatants, mover.instance_id, target, ctx.factions === undefined ? [] : ctx.factions);
  for (const step of steps) {
    const structure = named(step.action);
    if (structure === undefined) return null;
    const one = oneAttack(structure, attack, mover, target, ac, ctx.ruleset);
    swings += step.count;
    hits += one.hit * step.count;
    damage = damage === null || one.damage === null ? null : damage + one.damage * step.count;
    const dice = ctx.sneakDiceOf === undefined ? null : ctx.sneakDiceOf(step.action);
    const mode = dice === null ? "normal" : modeOf(structure, attack, mover, target, ctx.ruleset);
    if (dice !== null && (mode === "advantage" || (mode === "normal" && beside))) {
      const type = structure.hit[0] === undefined ? null : structure.hit[0].type;
      const extra = oneAttack({ ...structure, hit: [{ dice, type }] }, attack, mover, target, ac, ctx.ruleset);
      for (let i = 0; i < step.count; i++) {
        sneak = sneak === null || extra.damage === null ? null : sneak + nothingYet * extra.damage;
        nothingYet *= 1 - one.hit;
      }
    }
  }
  if (sneak !== null && damage !== null) damage += sneak;
  // A Multiattack's hit chance is the mean over its attacks, each weighted by how many it makes.
  return swings === 0 ? null : { hitChance: hits / swings, expectedDamage: damage };
}

/** What a spell option's pass over the targets found: the numbers, and what each target's failed save would impose. */
interface SpellFound {
  hitChance: number;
  expectedDamage: number | null;
  /** Per target, in `targetIds` order: the chance it fails the spell's save (0 for an attack spell, which imposes nothing). */
  fails: number[];
  targets: RunCombatant[];
  conditions: readonly SaveCondition[];
  save: SaveStructure | undefined;
  stopsCasting: StopsCasting;
}

/** The chance `target` fails a save of `ability` against `dc`: auto-fail, else the roll, else `UNKNOWN_SAVE_FAIL_CHANCE` when its bonus is not known. */
function failChanceOf(target: RunCombatant, ability: SaveAbility, dc: number, ctx: NumbersContext): number {
  if (autoFailsSave(target.conditions, ability)) return 1;
  const bonus = ctx.saveBonusOf === undefined ? null : ctx.saveBonusOf(target, ability);
  if (bonus === null) return UNKNOWN_SAVE_FAIL_CHANCE;
  // Only a known bonus can take a boon's mean (Bless): an unknown one stays a coin flip above.
  return chanceToFail(bonus + boonMean(target.conditions, "save"), dc, saveRollMode({ conditions: target.conditions, ability, ruleset: ctx.ruleset }).mode);
}

/** A spell option's numbers, or null when a target's armor class or the damage cannot be read (the option stays unnumbered). */
function spellNumbers(spell: TurnOptionSpell, mover: RunCombatant, ctx: NumbersContext): SpellFound | null {
  const cast = ctx.spells?.find((s) => s.spell === spell.name && s.castLevel === spell.castLevel);
  if (cast === undefined) return null;
  const targets = spell.targetIds.flatMap((id) => ctx.combatants.find((c) => c.instance_id === id) ?? []);
  if (targets.length === 0 || targets.length !== spell.targetIds.length) return null;
  let chance = 0;
  let damage: number | null = 0;
  const fails: number[] = [];
  const attack = cast.entry.structured.attack;
  const save = cast.entry.structured.save;
  const effect = cast.record.condition_effect;
  const stopsCasting: StopsCasting = effect === null || effect === undefined ? null : effect.stops_casting;
  if (cast.kind === "attack" && attack !== undefined) {
    const facts: TurnOptionAttack = { list: "actions", action: spell.name, steps: null, distanceFeet: spell.distanceFeet, cover: null, longRange: null, closeCombat: null, hitChance: null, expectedDamage: null };
    for (const target of targets) {
      const ac = ctx.armorClassOf(target);
      if (ac === null) return null;
      const one = oneAttack(attack, facts, mover, target, ac, ctx.ruleset, SPELL_DAMAGE);
      chance += one.hit;
      fails.push(0);
      damage = damage === null || one.damage === null ? null : damage + one.damage;
    }
  } else if (cast.kind === "save" && save !== undefined) {
    for (const target of targets) {
      const avg = averageOf(save.fail, target, SPELL_DAMAGE);
      const fail = failChanceOf(target, save.ability, save.dc, ctx);
      chance += fail;
      fails.push(fail);
      damage = damage === null || avg === null ? null : damage + fail * avg.all + (1 - fail) * (save.success === "half" ? avg.all / 2 : 0);
    }
  } else {
    return null;
  }
  return { hitChance: chance / targets.length, expectedDamage: damage, fails, targets, conditions: save === undefined ? [] : save.conditions, save, stopsCasting };
}

/**
 * What the failed save of a spell is worth in hit points, summed over its targets (see the header). Each condition is
 * priced on its own, over how long it is expected to last on that target, and the largest counts; a spell that stops
 * casting adds that as one more candidate. A condition already on the target is worth nothing on it.
 */
function spellWorth(found: SpellFound, fallbackPerTurn: number, ctx: NumbersContext): number {
  const { save } = found;
  if (save === undefined || (found.conditions.length === 0 && found.stopsCasting === null)) return 0;
  let total = 0;
  found.targets.forEach((target, i) => {
    let best = 0;
    let longest = 0;
    for (const condition of found.conditions) {
      if (target.conditions.some((c) => c.name === condition.name)) continue;
      const ends = condition.ends;
      // A repeat save is made against the save's own DC, by the ability the prose names or else the spell's own.
      const repeatFails = ends !== undefined && ends.kind === "save" ? failChanceOf(target, ends.ability === undefined ? save.ability : ends.ability, ends.dc === undefined ? save.dc : ends.dc, ctx) : 0;
      const rounds = expectedRounds(ends, repeatFails);
      longest = Math.max(longest, rounds);
      best = Math.max(best, conditionWorth({ conditions: [condition.name], stopsCasting: null, rounds, target, fallbackPerTurn }));
    }
    if (found.stopsCasting !== null) {
      // It lasts as long as the longest condition it comes with, else for the assumed rest of the fight.
      best = Math.max(best, conditionWorth({ conditions: [], stopsCasting: found.stopsCasting, rounds: longest > 0 ? longest : ASSUMED_ROUNDS, target, fallbackPerTurn }));
    }
    total += found.fails[i] * best;
  });
  return total;
}

/** The mover's own best expected damage this turn over the options numbered so far: what it takes a foe to deal until it has seen otherwise. */
function ownBestDamage(damages: readonly (number | null)[]): number {
  return damages.reduce<number>((best, d) => (d === null ? best : Math.max(best, d)), 0);
}

/** The options with the numbers filled in on each attack and each spell. Other options pass through untouched. */
export function withNumbers(options: readonly TurnOption[], ctx: NumbersContext): TurnOption[] {
  const mover = ctx.combatants.find((c) => c.instance_id === ctx.moverId);
  const founds = new Map<TurnOption, SpellFound>();
  const numbered = options.map((option): TurnOption => {
    if (option.kind === "spell" && option.spell !== undefined && option.spell !== null && mover !== undefined) {
      const found = spellNumbers(option.spell, mover, ctx);
      if (found === null) return option;
      const out = { ...option, spell: { ...option.spell, hitChance: found.hitChance, expectedDamage: found.expectedDamage } };
      founds.set(out, found);
      return out;
    }
    if (option.kind !== "attack" || option.attack === null || mover === undefined) return option;
    const target = ctx.combatants.find((c) => c.instance_id === option.targetId);
    if (target === undefined) return option;
    const ac = ctx.armorClassOf(target);
    if (ac === null) return option;
    const found = numbersFor(option.attack, mover, target, ac, ctx);
    return found === null ? option : { ...option, attack: { ...option.attack, hitChance: found.hitChance, expectedDamage: found.expectedDamage } };
  });
  if (founds.size === 0) return numbered;
  // The worth of a condition needs what the mover would deal itself, so it comes once every damage is known.
  const fallbackPerTurn = ownBestDamage(numbered.map((o) => (o.kind === "spell" && o.spell ? o.spell.expectedDamage : o.attack === null ? null : o.attack.expectedDamage)));
  return numbered.map((option) => {
    const found = founds.get(option);
    if (found === undefined || option.spell === undefined || option.spell === null) return option;
    const imposes = [...new Set(found.conditions.map((c) => c.name))];
    return { ...option, spell: { ...option.spell, expectedWorth: spellWorth(found, fallbackPerTurn, ctx), ...(imposes.length > 0 ? { imposes } : {}) } };
  });
}
