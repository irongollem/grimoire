// Dying and death by the book (identical in the 2014 and 2024 rules for these points).
//
// `hitPoints.ts` owns the pool arithmetic (temp HP, beast form, own HP). This module
// composes it with the rules that only matter at 0 HP:
//
//  - Dropping to 0 HP makes you Unconscious; healing above 0 ends it and clears the saves.
//  - Instant death: damage left over after reaching 0 HP that is at least your HP maximum,
//    or any damage at 0 HP that is at least your HP maximum.
//  - Damage at 0 HP is a death save failure, two from a critical hit. Three successes make
//    you stable, three failures kill you. A stable creature that is hurt is dying again.
//  - Healing does not revive the dead. Only the DM can (`reviveOutcome`, as Revivify does).
//
// There is no dead/stable column: dead is 0 HP with 3 failures, stable is 0 HP with 3
// successes. `dyingStatus` is the ONE place that says so; every screen asks it.

import { applyDamage, applyHealing, type HpPools } from "@/rules/hitPoints";

export const UNCONSCIOUS = "Unconscious";

export interface DeathSaves {
  successes: number;
  failures: number;
}

export type DyingStatus = "alive" | "dying" | "stable" | "dead";

/** Who a character is right now, from their own HP and death saves. */
export function dyingStatus(currentHp: number, saves: DeathSaves): DyingStatus {
  if (currentHp > 0) return "alive";
  if (saves.failures >= 3) return "dead";
  if (saves.successes >= 3) return "stable";
  return "dying";
}

export type DyingOutcome =
  | "dropped"
  | "died"
  | "dying-worse"
  | "stabilised-broken"
  | "revived-by-healing"
  | "healing-refused-dead"
  | null;

export interface DyingInput {
  pools: HpPools;
  saves: DeathSaves;
  conditions: readonly string[];
}

export interface DyingResult {
  current_hp: number;
  temp_hp: number;
  /** Beast HP after the event; null when there is no form, or the form just ended. */
  beast_hp: number | null;
  /** The hit ended the Wild Shape form. */
  reverted: boolean;
  saves: DeathSaves;
  conditions: string[];
  outcome: DyingOutcome;
}

function withCondition(conditions: readonly string[], name: string): string[] {
  return conditions.includes(name) ? [...conditions] : [...conditions, name];
}

function withoutCondition(conditions: readonly string[], name: string): string[] {
  return conditions.filter((c) => c !== name);
}

/**
 * Damage across temp HP, beast form and own HP, then the dying rules on top.
 * `critical` only matters when the character is already at 0 HP.
 */
export function damageOutcome(
  input: DyingInput,
  event: { amount: number; critical?: boolean },
): DyingResult {
  const { pools, saves, conditions } = input;
  const unchanged: DyingResult = {
    current_hp: pools.current_hp,
    temp_hp: pools.temp_hp,
    beast_hp: pools.beast ? pools.beast.hp : null,
    reverted: false,
    saves: { ...saves },
    conditions: [...conditions],
    outcome: null,
  };
  // The dead take no further harm worth tracking.
  if (dyingStatus(pools.current_hp, saves) === "dead" && !pools.beast) return unchanged;

  const out = applyDamage(pools, event.amount, 0);
  const result: DyingResult = {
    current_hp: out.current_hp,
    temp_hp: out.temp_hp,
    beast_hp: out.beast_hp,
    reverted: out.reverted,
    saves: { ...saves },
    conditions: [...conditions],
    outcome: null,
  };

  const atZeroBefore = pools.current_hp <= 0 && !pools.beast;
  if (atZeroBefore) {
    // Damage that temp HP soaked up is not damage to a body already at 0 HP.
    if (out.hp_damage <= 0) return result;
    if (out.hp_damage >= pools.max_hp) {
      return { ...result, saves: { successes: 0, failures: 3 }, outcome: "died" };
    }
    const wasStable = saves.successes >= 3;
    // A stable creature that is hurt starts over: its counts were reset when it
    // became stable, so only this hit's failures stand.
    const base = wasStable ? { successes: 0, failures: 0 } : saves;
    const failures = Math.min(3, base.failures + (event.critical ? 2 : 1));
    const next = { successes: base.successes, failures };
    if (failures >= 3) return { ...result, saves: next, outcome: "died" };
    return { ...result, saves: next, outcome: wasStable ? "stabilised-broken" : "dying-worse" };
  }

  // Damage left over once the character's OWN HP reached 0. In a 2014 beast form
  // only what carries past the beast into the normal form counts.
  if (pools.beast && !out.reverted) return result;
  if (out.current_hp > 0 || pools.current_hp <= 0) return result;
  const carry = pools.beast ? out.hp_damage - pools.beast.hp : out.hp_damage;
  const excess = carry - pools.current_hp;
  if (excess >= pools.max_hp) {
    return { ...result, saves: { successes: 0, failures: 3 }, conditions: withCondition(conditions, UNCONSCIOUS), outcome: "died" };
  }
  return {
    ...result,
    saves: { successes: 0, failures: 0 },
    conditions: withCondition(conditions, UNCONSCIOUS),
    outcome: "dropped",
  };
}

/** Healing, with the rules that govern the dying: healing above 0 HP ends the
 *  Unconscious state and the saves, and never brings back the dead. */
export function healingOutcome(input: DyingInput, amount: number): DyingResult {
  const { pools, saves, conditions } = input;
  const base: DyingResult = {
    current_hp: pools.current_hp,
    temp_hp: pools.temp_hp,
    beast_hp: pools.beast ? pools.beast.hp : null,
    reverted: false,
    saves: { ...saves },
    conditions: [...conditions],
    outcome: null,
  };
  if (!pools.beast && dyingStatus(pools.current_hp, saves) === "dead") {
    return { ...base, outcome: "healing-refused-dead" };
  }
  const out = applyHealing(pools, amount);
  const result = { ...base, current_hp: out.current_hp, beast_hp: out.beast_hp };
  if (!pools.beast && pools.current_hp <= 0 && out.current_hp > 0) {
    return {
      ...result,
      saves: { successes: 0, failures: 0 },
      conditions: withoutCondition(conditions, UNCONSCIOUS),
      outcome: "revived-by-healing",
    };
  }
  return result;
}

/** The DM brings a dead character back: 1 HP, saves cleared, no longer Unconscious. */
export function reviveOutcome(conditions: readonly string[]): {
  current_hp: number;
  saves: DeathSaves;
  conditions: string[];
} {
  return { current_hp: 1, saves: { successes: 0, failures: 0 }, conditions: withoutCondition(conditions, UNCONSCIOUS) };
}

/** A death save roll. Nat 20 is back up at 1 HP; nat 1 is two failures; 10+ a success. */
export function deathSaveRollOutcome(
  saves: DeathSaves,
  conditions: readonly string[],
  d20: number,
): { saves: DeathSaves; conditions: string[]; current_hp: number | null; label: string } {
  if (d20 === 20) {
    return {
      saves: { successes: 0, failures: 0 },
      conditions: withoutCondition(conditions, UNCONSCIOUS),
      current_hp: 1,
      label: "Nat 20 · Back up at 1 HP",
    };
  }
  if (d20 === 1) {
    return { saves: { ...saves, failures: Math.min(3, saves.failures + 2) }, conditions: [...conditions], current_hp: null, label: "Nat 1 · 2 Failures" };
  }
  if (d20 >= 10) {
    return { saves: { ...saves, successes: Math.min(3, saves.successes + 1) }, conditions: [...conditions], current_hp: null, label: "Success" };
  }
  return { saves: { ...saves, failures: Math.min(3, saves.failures + 1) }, conditions: [...conditions], current_hp: null, label: "Failure" };
}

/** Plain-words line for the toast after a hit, or null when nothing notable happened. */
export function describeDamageOutcome(name: string, amount: number, outcome: DyingOutcome): string | null {
  switch (outcome) {
    case "died":
      return `${name} took ${amount} damage and died.`;
    case "dropped":
      return `${name} took ${amount} damage and dropped to 0 HP. They are unconscious.`;
    case "dying-worse":
      return `${name} took ${amount} damage at 0 HP and failed a death save.`;
    case "stabilised-broken":
      return `${name} took ${amount} damage and is no longer stable. They are dying again.`;
    default:
      return null;
  }
}

