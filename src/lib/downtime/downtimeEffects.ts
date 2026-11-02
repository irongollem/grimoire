import { EXHAUSTION, getExhaustionLevel, setExhaustionLevel } from "@/rules/conditions";
import type { AppliedCondition } from "@/types/condition.types";
import { addCoins, formatCoins, type Coins, type CurrencyConfig } from "@/lib/currency/currency";
import type { DowntimeEffect } from "@/types/downtime.types";

/**
 * One effect, in words. Shared by the DM's resolution board and the printed
 * outcome card, so a consequence reads identically on screen and on the table.
 */
export function describeEffect(effect: DowntimeEffect, currency: CurrencyConfig): string {
  switch (effect.kind) {
    case "gold": {
      const gain = formatCoins(effect.gain, currency);
      const spend = formatCoins(effect.spend, currency);
      const parts = [gain && `+${gain}`, spend && `-${spend}`].filter((p) => p !== "");
      return parts.length > 0 ? parts.join(", ") : "no coin";
    }
    case "item":
      return `${effect.qty}× item`;
    case "hp":
      return `${effect.delta > 0 ? "+" : ""}${effect.delta} HP`;
    case "condition":
      return effect.condition;
  }
}

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

/** Everything the ticked `gold` effects pay out, summed per denomination. */
export function coinGain(effects: readonly DowntimeEffect[]): Coins {
  return effects.reduce<Coins>(
    (sum, e) => (e.kind === "gold" && e.applied ? addCoins(sum, e.gain) : sum),
    {},
  );
}

/**
 * Everything the ticked `gold` effects cost, summed per denomination. This is a
 * price, not a purse change: the server pays it with change (`spend_coins`) and
 * refuses it when the purse cannot cover it, so a shortfall reaches the DM as an
 * error instead of being floored away.
 */
export function coinSpend(effects: readonly DowntimeEffect[]): Coins {
  return effects.reduce<Coins>(
    (sum, e) => (e.kind === "gold" && e.applied ? addCoins(sum, e.spend) : sum),
    {},
  );
}

/** Denominations the ticked `gold` effects name that the campaign's currency lacks. */
export function unknownCoinKeys(effects: readonly DowntimeEffect[], currency: CurrencyConfig): string[] {
  const known = new Set(currency.denominations.map((d) => d.key));
  const named = new Set([...Object.keys(coinGain(effects)), ...Object.keys(coinSpend(effects))]);
  return [...named].filter((k) => !known.has(k));
}

/**
 * A seed card's effects as this campaign can use them. The built-in seeds are
 * 5e content priced in 5e coins; in a campaign without those coins a gold
 * effect is dropped rather than offered, so ticking it can never fail on a coin
 * the campaign does not have. The card's story and other effects stand, and the
 * DM can still hand coins over from the purse.
 */
export function effectsForCurrency(effects: readonly DowntimeEffect[], currency: CurrencyConfig): DowntimeEffect[] {
  const known = new Set(currency.denominations.map((d) => d.key));
  return effects
    .filter((e) => e.kind !== "gold" || [...Object.keys(e.gain), ...Object.keys(e.spend)].every((k) => known.has(k)))
    .map((e) => ({ ...e }));
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
 *
 * Exhaustion is the exception to the de-dupe: it stacks, so each ticked
 * Exhaustion effect raises the level by one (capped at 6) instead of being
 * skipped as a duplicate.
 */
export function applyConditionEffects(
  conditions: readonly AppliedCondition[],
  effects: readonly DowntimeEffect[],
): AppliedCondition[] {
  let next = [...conditions];
  const seen = new Set(next.map((c) => c.name.toLowerCase()));
  for (const effect of effects) {
    if (effect.kind !== "condition" || !effect.applied) continue;
    const key = effect.condition.toLowerCase();
    if (key === "exhaustion" || key === "exhausted") {
      next = setExhaustionLevel(next, getExhaustionLevel(next) + 1);
      seen.add(EXHAUSTION.toLowerCase());
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ name: effect.condition });
  }
  return next;
}

/** True when at least one ticked effect writes to `party_members`. */
export function hasApplicableMemberEffect(effects: readonly DowntimeEffect[]): boolean {
  return effects.some(
    (e) => e.applied && (e.kind === "gold" || e.kind === "hp" || e.kind === "condition"),
  );
}
