import { combineModes, type RollMode } from "@/lib/dice/dice";
import { hasAttackDisadvantage } from "@/rules/conditions";
import type { RulesetKey } from "@/types/ruleset.types";

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
  attackerConditions: string[];
  targetConditions: string[];
  delivery: "melee" | "ranged";
  /** An enemy of the attacker (ranged) or the attacker itself (vs. Prone) is within 5 feet; the caller decides. */
  withinFiveFeet: boolean;
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
  let mode: RollMode = "normal";
  const reasons: string[] = [];
  const add = (m: RollMode, reason: string) => {
    mode = combineModes(mode, m);
    reasons.push(reason);
  };

  if (hasAttackDisadvantage(attackerConditions, ruleset)) add("disadvantage", "attacker's conditions impose disadvantage");
  if (attackerConditions.includes("Invisible")) add("advantage", "attacker Invisible");

  const advTarget = targetConditions.filter((c) => ATTACK_ADV_TARGET_CONDITIONS.has(c));
  if (advTarget.length > 0) add("advantage", `target ${advTarget.join(", ")}`);
  if (targetConditions.includes("Invisible")) add("disadvantage", "target Invisible");

  // Prone: melee within 5 ft is easy, anything from farther is hard (SRD Prone).
  // The SRD wording is "attacker is within 5 feet"; a ranged attack from there also counts.
  if (targetConditions.includes("Prone")) {
    if (withinFiveFeet) add("advantage", "target Prone within 5 ft");
    else add("disadvantage", "target Prone beyond 5 ft");
  }

  // Ranged attacks have disadvantage when a hostile creature is within 5 ft (SRD "Ranged Attacks in Close Combat").
  if (delivery === "ranged" && withinFiveFeet) add("disadvantage", "ranged attack with an enemy within 5 ft");

  if (dmMode && dmMode !== "normal") add(dmMode, `DM sets ${dmMode}`);
  return { mode, reasons };
}

/** A hit on a Paralyzed or Unconscious target from within 5 ft is a critical hit (SRD conditions). */
export function autoCritOnHit(targetConditions: string[], withinFiveFeet: boolean): boolean {
  return withinFiveFeet && targetConditions.some((c) => AUTO_CRIT_TARGET_CONDITIONS.has(c));
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
