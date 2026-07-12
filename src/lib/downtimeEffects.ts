import { COIN_KEYS, type CoinKey, type DowntimeEffect } from "@/types/downtime.types";

/**
 * Pure transforms for the effect kinds the app enacts automatically (#486,
 * Phase 2): coin, HP, and conditions — every kind that has real `party_members`
 * state to write and carries complete information in the effect itself.
 *
 * `item` is deliberately absent: it names an `item_id` + qty to drop into a
 * character's inventory, which needs an inventory insert (and an item-name
 * lookup the effect does not carry), so it stays a DM checklist rather than an
 * automatic mutation. Keeping these transforms pure means the resolution board's
 * "apply automatically" claim is unit-tested, not asserted by hand.
 *
 * Every helper considers only effects that are both the right kind AND ticked
 * (`applied === true`). An unticked effect is a proposal the DM declined; it
 * must never move a number.
 */

/** Which effect kinds move state without the DM performing anything by hand. */
export const AUTO_APPLIED_EFFECT_KINDS = ["gold", "hp", "condition"] as const;

export function isAutoAppliedKind(kind: DowntimeEffect["kind"]): boolean {
  return (AUTO_APPLIED_EFFECT_KINDS as readonly string[]).includes(kind);
}

/**
 * Fold every ticked `gold` effect into the character's purse. A purse cannot go
 * negative — the DM narrates a shortfall rather than the app inventing debt.
 */
export function applyCoinEffects(
  coins: Record<CoinKey, number>,
  effects: readonly DowntimeEffect[],
): Record<CoinKey, number> {
  const next: Record<CoinKey, number> = { ...coins };
  for (const effect of effects) {
    if (effect.kind !== "gold" || !effect.applied) continue;
    for (const key of COIN_KEYS) {
      next[key] = Math.max(0, next[key] + effect[key]);
    }
  }
  return next;
}

/**
 * Apply every ticked `hp` delta, clamped to [0, maxHp]. Downtime bruises and
 * mends; it never drops a character below 0 (that is combat's job) nor heals
 * past their maximum.
 */
export function applyHpEffects(
  currentHp: number,
  maxHp: number,
  effects: readonly DowntimeEffect[],
): number {
  let next = currentHp;
  for (const effect of effects) {
    if (effect.kind !== "hp" || !effect.applied) continue;
    next += effect.delta;
  }
  return Math.max(0, Math.min(maxHp, next));
}

/**
 * Add every ticked `condition` to the character's condition list, de-duplicated
 * case-insensitively so "Poisoned" never lands twice. Order is preserved:
 * existing conditions first, then newly-applied ones in effect order.
 */
export function applyConditionEffects(
  conditions: readonly string[],
  effects: readonly DowntimeEffect[],
): string[] {
  const next = [...conditions];
  const seen = new Set(next.map((c) => c.toLowerCase()));
  for (const effect of effects) {
    if (effect.kind !== "condition" || !effect.applied) continue;
    const key = effect.condition.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(effect.condition);
  }
  return next;
}

/** True when at least one ticked effect writes to `party_members`. */
export function hasApplicableMemberEffect(effects: readonly DowntimeEffect[]): boolean {
  return effects.some(
    (e) => e.applied && (e.kind === "gold" || e.kind === "hp" || e.kind === "condition"),
  );
}
