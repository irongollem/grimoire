import { COINS } from "@/rules/currency";
import type { CoinKey } from "@/types/downtime.types";

/**
 * The arithmetic behind "Give coins…". Pure so the form's three verdicts (can it be
 * sent, what is left, what the button says) are tested apart from the component. The
 * server re-checks all of it; this only keeps the button honest.
 */

export type Coins = Record<CoinKey, number>;

/** Whole, non-negative coins; a cleared or fractional field counts as what it plainly means. */
export function wholeCoins(coins: Coins): Coins {
  const w = (n: number) => (Number.isFinite(n) ? Math.floor(n) : 0);
  return { pp: w(coins.pp), gp: w(coins.gp), ep: w(coins.ep), sp: w(coins.sp), cp: w(coins.cp) };
}

export function hasCoins(coins: Coins): boolean {
  return COINS.some((c) => coins[c.key] > 0);
}

/** A negative field, or any amount above what the purse holds, blocks the give. */
export function coinGiveBlocked(purse: Coins, coins: Coins): boolean {
  return COINS.some((c) => coins[c.key] < 0 || coins[c.key] > purse[c.key]);
}

export function coinsLeft(purse: Coins, coins: Coins): Coins {
  const left = (k: CoinKey) => purse[k] - Math.max(0, coins[k]);
  return { pp: left("pp"), gp: left("gp"), ep: left("ep"), sp: left("sp"), cp: left("cp") };
}

/** "5 gp, 3 sp", the non-zero coins in purse order; empty when there are none. */
export function coinText(coins: Coins): string {
  return COINS.filter((c) => coins[c.key] > 0)
    .map((c) => `${coins[c.key]} ${c.key}`)
    .join(", ");
}

/** "Leaves you 36 gp, 12 sp, 30 cp." or "Leaves you with nothing." */
export function leavesYouLine(purse: Coins, coins: Coins): string {
  const text = coinText(coinsLeft(purse, coins));
  return text ? `Leaves you ${text}.` : "Leaves you with nothing.";
}

/** The button's label: the action with its amount and recipient. */
export function giveCoinsLabel(coins: Coins, recipientName: string | null): string {
  const text = coinText(coins);
  if (!text) return "Give";
  return recipientName ? `Give ${text} to ${recipientName}` : `Give ${text}`;
}
