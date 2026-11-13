import { formatCoins, type Coins, type CurrencyConfig } from "@/lib/currency/currency";

/**
 * The arithmetic behind "Give coins…". Pure so the form's three verdicts (can it be
 * sent, what is left, what the button says) are tested apart from the component. The
 * server re-checks all of it; this only keeps the button honest.
 */

/** A negative entry, or any amount above what the purse holds of that coin, blocks the give. */
export function coinGiveBlocked(purse: Coins, coins: Coins): boolean {
  return Object.entries(coins).some(([key, n]) => n < 0 || n > (purse[key] ?? 0));
}

/** The purse after the give, per denomination; a negative entry takes nothing. */
export function coinsLeft(purse: Coins, coins: Coins): Coins {
  const out: Coins = {};
  for (const key of new Set([...Object.keys(purse), ...Object.keys(coins)])) {
    const n = (purse[key] ?? 0) - Math.max(0, coins[key] ?? 0);
    if (n !== 0) out[key] = n;
  }
  return out;
}

/**
 * "Leaves you 36 gp 12 sp 30 cp." on your own purse; "Leaves Dorn 36 gp…" on
 * anyone else's. The DM opens this form on a character's purse, and "you" there
 * read as the DM's own money, so a DM handing out coins moved the character's
 * coins to someone else without noticing.
 */
export function leavesLine(purse: Coins, coins: Coins, cfg: CurrencyConfig, giverName: string | null): string {
  const who = giverName ?? "you";
  const text = formatCoins(coinsLeft(purse, coins), cfg);
  return text ? `Leaves ${who} ${text}.` : `Leaves ${who} with nothing.`;
}

/** The button's label: the action with its amount and recipient. */
export function giveCoinsLabel(coins: Coins, recipientName: string | null, cfg: CurrencyConfig): string {
  const text = formatCoins(coins, cfg);
  if (!text) return "Give";
  return recipientName ? `Give ${text} to ${recipientName}` : `Give ${text}`;
}
