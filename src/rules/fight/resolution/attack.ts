/** An attack: the roll to hit, the DM's override of it, and the one-call version that runs it through to the damage taken off (#1201 stage 3). See `context.ts` for how a resolution is driven. */
import type { RollResult } from "../../../lib/dice/dice.ts";
import type { RollMode } from "../../../systems/dnd5e/dice/rollMode.ts";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { DamagePart, StatBlockEntry } from "../../../types/statBlock.types.ts";
import { attackRollMode, autoCritOnHit, resolveAttack as resolveAttackRoll } from "../../combat/attackRoll.ts";
import { getExhaustionD20Penalty } from "../../conditions.ts";
import type { ResolvedAction } from "../fightState.ts";
import { coverBonus, type Cover } from "../terrain/sight.ts";
import { boonArmorClass } from "../boons.ts";
import { rollBoons } from "./boonRolls.ts";
import { ActionRefused, keptD20, rollD20, tracked, type ResolutionCommand, type ResolutionContext, type RollOptions } from "./context.ts";
import { appliedDamage, applyDamage, rollDamageParts, type DamageAmount, type DamageApplied } from "./damage.ts";
import { resolveSaveOn, type SaveResolved } from "./saves.ts";

export interface AttackOutcome {
  attacker: RunCombatant;
  target: RunCombatant;
  entry: StatBlockEntry;
  delivery: "melee" | "ranged";
  mode: RollMode;
  /** Why the mode is not normal, one reason per source. */
  reasons: string[];
  /** The kept d20. */
  natural: number;
  /** d20 + attack bonus + 2024 exhaustion penalty. */
  total: number;
  /** The AC the roll was compared against: the target's own plus `coverAc`; null when its printed AC has none, so the DM rules. */
  targetAc: number | null;
  /** The cover the target had against the attacker, null when none was known (the browser never supplies it). Total cover refuses before the roll, so it is never "total" here. */
  cover: Cover | null;
  /** The part of `targetAc` that is cover: +2 for half, +5 for three-quarters, else 0. */
  coverAc: 0 | 2 | 5;
  /** Null only when AC is unreadable and the die alone does not decide (not a natural 1 or 20). */
  hit: boolean | null;
  critical: boolean;
  fumble: boolean;
  /** True when the critical comes from the target's state (Paralyzed or Unconscious within 5 ft), not the die. */
  autoCrit: boolean;
  /** What to pass to `rollDamageParts` (with `critical`); null on a miss or an undecided hit. */
  damageParts: DamagePart[] | null;
  roll: RollResult;
}

export interface AttackInput extends RollOptions {
  attacker: RunCombatant;
  entry: StatBlockEntry;
  target: RunCombatant;
  dmMode?: RollMode;
  /** The attacker is within 5 feet of the target: Prone's advantage and the critical on a Paralyzed or Unconscious target. */
  withinFiveFeet: boolean;
  /** A hostile that is not incapacitated stands within 5 feet of the ATTACKER (`rangedAttackFacts`): a ranged attack then has disadvantage. */
  hostileWithinFiveFeetOfAttacker?: boolean;
  /** The target is beyond the normal range (`rangedAttackFacts`): a ranged attack then has disadvantage. */
  longRange?: boolean;
  delivery?: "melee" | "ranged";
  /** A further penalty on the roll to hit, 0 or less, added to the exhaustion penalty (app convention: the caller's own, e.g. a called shot). */
  extraPenalty?: number;
}

/**
 * Roll an attack at a target. Null when nobody makes the roll. `delivery` only
 * matters for a melee-or-ranged attack; it defaults to melee within 5 feet and
 * ranged beyond.
 */
export async function rollToHit(ctx: ResolutionContext, input: AttackInput): Promise<AttackOutcome | null> {
  const { attacker, entry, target } = input;
  const attack = entry.structured.attack;
  if (!attack) throw new ActionRefused(`"${entry.name}" has no structured attack to roll`);
  const delivery =
    attack.delivery === "melee_or_ranged" ? (input.delivery ?? (input.withinFiveFeet ? "melee" : "ranged")) : attack.delivery;

  const { mode, reasons } = attackRollMode({
    attackerConditions: attacker.conditions,
    targetConditions: target.conditions,
    delivery,
    withinFiveFeet: input.withinFiveFeet,
    hostileWithinFiveFeetOfAttacker: input.hostileWithinFiveFeetOfAttacker,
    longRange: input.longRange,
    ruleset: ctx.ruleset,
    dmMode: input.dmMode,
  });
  const penalty = getExhaustionD20Penalty(attacker.conditions, ctx.ruleset) + (input.extraPenalty ?? 0);
  // Looked up before the die is thrown: a lookup that refuses (the server cannot know a player's sheet AC) should not cost a roll.
  const printedAc = ctx.armorClassFor(target);
  // Cover likewise: PHB 2014 ch. 9, a target with total cover cannot be targeted directly by an attack.
  const cover = ctx.coverFor ? ctx.coverFor(attacker, target) : null;
  if (cover === "total") throw new ActionRefused(`${target.name} has total cover from ${attacker.name}, so it cannot be targeted by "${entry.name}".`);
  const coverAc = cover === null ? 0 : coverBonus(cover).ac;
  // RULE shield-of-faith (PHB "Shield of Faith"): +2 AC, on top of the armour and of cover. Read live: a boon that just ended is gone.
  const targetAc = printedAc === null ? null : printedAc + coverAc + boonArmorClass(ctx.live(target).conditions);
  const roll = await rollD20(ctx, `${entry.name} attack vs ${target.name}`, attack.bonus + penalty, mode, attacker, input);
  if (!roll) return null;
  // An attack made is an attack seen, hit or miss, and of the delivery it was made with (#1021).
  ctx.apply({ type: "show_deed", instanceId: attacker.instance_id, deed: delivery === "ranged" ? { ranged: 1 } : { melee: 1 } });

  const natural = keptD20(roll);
  const autoCrit = autoCritOnHit(target.conditions, input.withinFiveFeet);
  const fumble = natural === 1;
  // RULE bless (PHB "Bless"): the d4 is added to the attack roll after the d20, so the natural 1 and 20 are still read on the d20 alone.
  const boons = await rollBoons(ctx, attacker, "attack", input);
  const bonus = attack.bonus + boons.total;
  const total = natural + bonus + penalty;
  // The rules decide whenever there is an AC to compare against. An unreadable
  // AC leaves everything but a natural 1 or 20 to the DM.
  const ruled = targetAc === null ? null : resolveAttackRoll({ d20: natural, bonus, targetAc, penalty, autoCrit });
  const hit = ruled ? ruled.hit : fumble ? false : natural === 20 ? true : null;
  const critical = ruled ? ruled.critical : hit === true;
  return {
    attacker,
    target,
    entry,
    delivery,
    mode,
    reasons,
    natural,
    total,
    targetAc,
    cover,
    coverAc,
    hit,
    critical,
    fumble,
    autoCrit,
    damageParts: hit === true ? attack.hit : null,
    roll,
  };
}

/**
 * The outcome after the DM overrides `hit` or `critical`: a hit the dice
 * missed still has damage to roll, and a critical is only ever a hit.
 */
export function overrideAttack(outcome: AttackOutcome, over: { hit?: boolean; critical?: boolean }): AttackOutcome {
  const attack = outcome.entry.structured.attack;
  if (!attack) throw new Error(`"${outcome.entry.name}" has no structured attack`);
  const hit = over.hit !== undefined ? over.hit : outcome.hit;
  const critical = hit === true && (over.critical !== undefined ? over.critical : outcome.critical);
  return { ...outcome, hit, critical, damageParts: hit === true ? attack.hit : null };
}

export interface AttackResolved {
  outcome: AttackOutcome;
  /** The damage rolled on a hit; null on a miss. */
  amounts: DamageAmount[] | null;
  damage: DamageApplied | null;
  /** The save a hit forces ("...or be paralyzed"), made by the creature that was hit. */
  rider: SaveResolved | null;
  commands: ResolutionCommand[];
  summary: Extract<ResolvedAction, { kind: "attack" }>;
}

/**
 * An attack from the roll to hit to the damage taken off, without a pause for a ruling. The target's armour class
 * must be a number (a printed AC with none leaves a hit to the DM). When the attack's hit also forces a save, the
 * creature that was hit makes it after the damage.
 */
export async function resolveAttackOn(
  base: ResolutionContext,
  input: AttackInput & { magical?: boolean },
): Promise<AttackResolved> {
  const { ctx, issued } = tracked(base);
  const { attacker, entry, target } = input;
  const outcome = await rollToHit(ctx, input);
  if (!outcome) throw new ActionRefused(`The attack of "${entry.name}" was not rolled.`);
  if (outcome.targetAc === null) throw new ActionRefused(`${target.name}'s armour class has no number in it, so there is nothing to roll against.`);

  let amounts: DamageAmount[] | null = null;
  let damage: DamageApplied | null = null;
  if (outcome.hit === true && outcome.damageParts) {
    amounts = await rollDamageParts(ctx, {
      parts: outcome.damageParts,
      critical: outcome.critical,
      label: `${entry.name} damage vs ${target.name}`,
      senderName: attacker.name,
      silent: input.silent,
    });
    if (!amounts) throw new ActionRefused(`The damage of "${entry.name}" was not rolled.`);
    damage = applyDamage(ctx, { target, parts: amounts, defenses: ctx.defensesFor(target), magical: input.magical, critical: outcome.critical, attacker });
  }

  const rider =
    outcome.hit === true && entry.structured.save
      ? await resolveSaveOn(ctx, { attacker, entry, targets: [ctx.live(target)], magical: input.magical, silent: input.silent })
      : null;

  return {
    outcome,
    amounts,
    damage,
    rider,
    commands: issued,
    summary: {
      kind: "attack",
      attackerId: attacker.instance_id,
      targetId: target.instance_id,
      action: entry.name,
      natural: outcome.natural,
      total: outcome.total,
      targetAc: outcome.targetAc,
      cover: outcome.cover,
      coverAc: outcome.coverAc,
      mode: outcome.mode,
      hit: outcome.hit === true,
      critical: outcome.critical,
      fumble: outcome.fumble,
      damage: appliedDamage(damage),
      damageTotal: damage ? damage.total : 0,
      dying: damage ? damage.dying : null,
      save: rider ? rider.summary.targets[0] ?? null : null,
    },
  };
}
