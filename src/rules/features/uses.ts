import type { UsesCost } from "./mechanics.types";
import type { ResourcePool, StoredClassResources } from "./characterFeatures";

/**
 * Spending and restoring a feature's uses (#976). Pure: the sheet, the Actions
 * list and the encounter runner all write through these, so "Cutting Words
 * needs a Bardic Inspiration left" is decided in one place.
 *
 * An unlimited pool (2014 Rage at 20) is never stored, so a cost against it is
 * always payable and changes nothing. A cost against a pool the character does
 * not have is never payable: a feature that spends Ki is unusable without Ki,
 * not free.
 */

export type Remaining = number | "unlimited" | null;

/** What is left of a pool: a number, "unlimited", or null when the character has no such pool. */
export function remainingUses(stored: StoredClassResources, pools: readonly ResourcePool[], key: string): Remaining {
  const pool = pools.find(p => p.key === key);
  if (!pool) return null;
  if (pool.max === "unlimited") return "unlimited";
  const entry = stored[key];
  return entry ? entry.current : pool.max;
}

export function canPay(stored: StoredClassResources, pools: readonly ResourcePool[], cost: UsesCost): boolean {
  const left = remainingUses(stored, pools, cost.key);
  if (left === null) return false;
  return left === "unlimited" || left >= cost.amount;
}

/** The stored resources after paying `cost`. Throws when it cannot be paid, so a caller cannot spend into the negative. */
export function payCost(stored: StoredClassResources, pools: readonly ResourcePool[], cost: UsesCost): StoredClassResources {
  if (!canPay(stored, pools, cost)) {
    throw new Error(`Not enough ${pools.find(p => p.key === cost.key)?.label ?? cost.key} left`);
  }
  const pool = pools.find(p => p.key === cost.key);
  if (!pool || pool.max === "unlimited") return stored;
  const entry = stored[cost.key];
  const current = entry ? entry.current : pool.max;
  return {
    ...stored,
    [cost.key]: {
      current: current - cost.amount,
      max: pool.max,
      rest: entry ? entry.rest : pool.recharge === "short" || pool.recharge === "turn" ? "short" : "long",
      ...(pool.shortRestRegain !== null ? { short_rest_regain: pool.shortRestRegain } : {}),
    },
  };
}

/** Gives back `amount` uses, never above the pool's max. A pool the character lacks is left alone. */
export function restoreUses(
  stored: StoredClassResources,
  pools: readonly ResourcePool[],
  key: string,
  amount: number,
): StoredClassResources {
  const pool = pools.find(p => p.key === key);
  const entry = stored[key];
  if (!pool || pool.max === "unlimited" || !entry) return stored;
  return { ...stored, [key]: { ...entry, current: Math.min(pool.max, entry.current + amount) } };
}

/** The class choices with a toggle switched. The rest RPC switches every `<key>_active` off. */
export function withToggle(classChoices: Record<string, unknown>, key: string, on: boolean): Record<string, unknown> {
  return { ...classChoices, [`${key}_active`]: on };
}
