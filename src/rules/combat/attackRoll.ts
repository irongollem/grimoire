import type { RollMode } from "../../systems/dnd5e/dice/rollMode.ts";
import { hasAttackDisadvantage, hasCondition, isIncapacitated } from "../conditions.ts";
import { isDodging, isHidden } from "../fight/stances.ts";
import { speedIsZero } from "../fight/terrain/movementBudget.ts";
import type { AppliedCondition } from "../../types/condition.types.ts";
import type { RulesetKey } from "../../types/ruleset.types.ts";

/** Target conditions that give attackers advantage (SRD: Blinded, Paralyzed, Petrified, Restrained, Stunned, Unconscious). */
export const ATTACK_ADV_TARGET_CONDITIONS = new Set<string>([
  "Blinded",
  "Paralyzed",
  "Petrified",
  "Restrained",
  "Stunned",
  "Unconscious",
]);

/** Target conditions where a hit from within 5 ft is automatically a critical (SRD: Paralyzed, Unconscious). */
export const AUTO_CRIT_TARGET_CONDITIONS = new Set<string>(["Paralyzed", "Unconscious"]);

export interface AttackRollModeInput {
  attackerConditions: readonly AppliedCondition[];
  targetConditions: readonly AppliedCondition[];
  delivery: "melee" | "ranged";
  /**
   * The attacker is within 5 feet of the TARGET (vs. Prone: advantage there, disadvantage beyond; the caller decides).
   * It is not the ranged close-combat fact, which is about a hostile next to the ATTACKER (`hostileWithinFiveFeetOfAttacker`).
   */
  withinFiveFeet: boolean;
  /**
   * A hostile creature that is not incapacitated stands within 5 feet of the ATTACKER, whoever it is, not only the
   * target. Ranged attacks only. Omitted means not known to be so. Worked out by `closeCombatThreat` in terrain/sight.ts.
   */
  hostileWithinFiveFeetOfAttacker?: boolean;
  /** The target is beyond the weapon's or spell's normal range (the "long range" band). Ranged attacks only. */
  longRange?: boolean;
  ruleset: RulesetKey;
  /** The DM's own override, combined like any other source. */
  dmMode?: RollMode;
}

/**
 * Advantage or disadvantage on an attack roll, with a human-readable reason per
 * source. RAW, any number of advantage sources and any number of disadvantage
 * sources cancel to a straight roll: the count of sources never matters.
 */
export function attackRollMode(input: AttackRollModeInput): { mode: RollMode; reasons: string[] } {
  const { attackerConditions, targetConditions, delivery, withinFiveFeet, ruleset, dmMode } = input;
  const hostileWithinFiveFeetOfAttacker = input.hostileWithinFiveFeetOfAttacker === true;
  const longRange = input.longRange === true;
  // Collect every source first and decide once: folding pairwise lets a later
  // source flip a roll that an earlier advantage and disadvantage had cancelled.
  let hasAdvantage = false;
  let hasDisadvantage = false;
  const reasons: string[] = [];
  const add = (m: RollMode, reason: string) => {
    if (m === "advantage") hasAdvantage = true;
    if (m === "disadvantage") hasDisadvantage = true;
    reasons.push(reason);
  };

  if (hasAttackDisadvantage(attackerConditions, ruleset)) add("disadvantage", "attacker's conditions impose disadvantage");
  if (hasCondition(attackerConditions, "Invisible")) add("advantage", "attacker Invisible");

  const advTarget = targetConditions.filter((c) => ATTACK_ADV_TARGET_CONDITIONS.has(c.name));
  if (advTarget.length > 0) add("advantage", `target ${advTarget.map((c) => c.name).join(", ")}`);
  if (hasCondition(targetConditions, "Invisible")) add("disadvantage", "target Invisible");
  // Hidden (PHB 2014 "Unseen Attackers and Targets"): an attacker its target cannot see has advantage, and an attack
  // on a target the attacker cannot see has disadvantage. Invisible already says the same; both together count once.
  if (isHidden(attackerConditions) && !hasCondition(attackerConditions, "Invisible")) add("advantage", "attacker is hidden");
  if (isHidden(targetConditions) && !hasCondition(targetConditions, "Invisible")) add("disadvantage", "target is hidden");

  // Dodge (PHB 2014 "Dodge", SRD 5.2 "Dodge [Action]"): disadvantage on attacks against the dodger, but only while it
  // can see the attacker and is able to act, and is lost when its Speed drops to 0 (PHB 2014 "Dodge"; SRD 5.2 "Dodge
  // [Action]"). A Blinded dodger sees nothing and an Invisible attacker is not seen.
  if (
    isDodging(targetConditions) &&
    !isIncapacitated(targetConditions) &&
    !speedIsZero(targetConditions, ruleset) &&
    !hasCondition(targetConditions, "Blinded") &&
    !hasCondition(attackerConditions, "Invisible")
  ) {
    add("disadvantage", "target is Dodging");
  }

  // Prone: melee within 5 ft is easy, anything from farther is hard (SRD Prone).
  // The SRD wording is "attacker is within 5 feet"; a ranged attack from there also counts.
  if (hasCondition(targetConditions, "Prone")) {
    if (withinFiveFeet) add("advantage", "target Prone within 5 ft");
    else add("disadvantage", "target Prone beyond 5 ft");
  }

  // PHB 2014 ch. 9 "Ranged Attacks in Close Combat"; SRD 5.2 "Ranged Attacks": disadvantage when a hostile creature
  // that can see you and is not Incapacitated is within 5 feet of the ATTACKER. Not the target-distance fact above.
  if (delivery === "ranged" && hostileWithinFiveFeetOfAttacker) add("disadvantage", "ranged attack with an enemy within 5 ft of the attacker");
  // PHB 2014 ch. 9 "Long Range"; SRD 5.2 "Long Range": disadvantage beyond the normal range.
  if (delivery === "ranged" && longRange) add("disadvantage", "ranged attack at long range");

  if (dmMode && dmMode !== "normal") add(dmMode, `DM sets ${dmMode}`);
  const mode: RollMode = hasAdvantage === hasDisadvantage ? "normal" : hasAdvantage ? "advantage" : "disadvantage";
  return { mode, reasons };
}

/** A hit on a Paralyzed or Unconscious target from within 5 ft is a critical hit (SRD conditions). */
export function autoCritOnHit(targetConditions: readonly AppliedCondition[], withinFiveFeet: boolean): boolean {
  return withinFiveFeet && targetConditions.some((c) => AUTO_CRIT_TARGET_CONDITIONS.has(c.name));
}

export interface AttackResolution {
  natural: number;
  total: number;
  hit: boolean;
  critical: boolean;
  fumble: boolean;
}

/**
 * Compare an attack roll to AC. `d20` is the kept die after advantage/disadvantage.
 * A natural 20 always hits and a natural 1 always misses whatever the numbers say
 * (SRD "Rolling 1 or 20"). `penalty` is the 2024 exhaustion penalty (<= 0).
 */
export function resolveAttack(input: {
  d20: number;
  bonus: number;
  targetAc: number;
  penalty?: number;
  autoCrit?: boolean;
  critOn?: number;
}): AttackResolution {
  const { d20, bonus, targetAc, autoCrit = false, critOn = 20 } = input;
  const total = d20 + bonus + (input.penalty ?? 0);
  const fumble = d20 === 1;
  const natCrit = d20 >= critOn;
  const hit = !fumble && (natCrit || total >= targetAc);
  return { natural: d20, total, hit, critical: hit && (natCrit || autoCrit), fumble };
}
