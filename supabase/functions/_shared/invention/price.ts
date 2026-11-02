import { coinValue, formatCoins, makeChange, parsePrice, type CurrencyConfig } from "../currency.ts";
import type { ItemRarity } from "./types.ts";

/**
 * Prices are whole numbers of the campaign's smallest coin (the denomination
 * worth 1). The stored fields keep their historical `value_cp` names, but the
 * unit is the campaign's, not copper.
 */

// What an item with no usable price is worth, by rarity (DMG 7-1 floor of the
// band), in 5e copper. This is genuinely 5e data: it only applies when the
// campaign uses the 5e coins (see usesDnd5eCoins). Any other currency has no
// agreed worth for a rarity, so an unpriced item there is worth 0 (unpriced)
// rather than a number we would have to invent.
const DND5E_UNPRICED: Record<ItemRarity, number> = {
  mundane: 100,
  common: 5000,
  uncommon: 10100,
  rare: 50100,
  very_rare: 500100,
  legendary: 5000100,
  artifact: 5000100,
};

/** True when the campaign's coins are the 5e set the rarity table is written in (gp = 100 and cp = 1 of the smallest coin). */
function usesDnd5eCoins(cfg: CurrencyConfig): boolean {
  const worth = (key: string) => cfg.denominations.find((d) => d.key === key)?.value;
  return worth("gp") === 100 && worth("sp") === 10 && worth("cp") === 1;
}

/** Value of a cost text in the smallest coin, or null when blank, zero or unparseable. A bare number is the campaign's default coin. */
export function parseCostValue(cost: string | null, cfg: CurrencyConfig): number | null {
  if (cost === null) return null;
  const text = cost.trim();
  if (text === "") return null;
  const coins = parsePrice(text, cfg);
  if (coins === null) return null;
  const value = coinValue(coins, cfg);
  return value > 0 ? value : null;
}

/** Per-unit value: the cost when it parses, else the 5e rarity value (5e coins only), else 0. */
export function unitValue(cost: string | null, rarity: ItemRarity, cfg: CurrencyConfig): number {
  const parsed = parseCostValue(cost, cfg);
  if (parsed !== null) return parsed;
  return usesDnd5eCoins(cfg) ? DND5E_UNPRICED[rarity] : 0;
}

/**
 * "1 gp 5 sp": the value as change in the campaign's coins. Coins worth more
 * than the default coin are not used, so a price reads in the coin a bare
 * number would ("1500 gp", never "15 pp") and parses back to the same value.
 */
export function formatCost(value: number, cfg: CurrencyConfig): string {
  const n = Math.max(0, Math.round(value));
  const top = cfg.denominations.find((d) => d.key === cfg.default_key)?.value ?? Infinity;
  const priced: CurrencyConfig = { ...cfg, denominations: cfg.denominations.filter((d) => d.value <= top) };
  const text = formatCoins(makeChange(n, priced), priced);
  return text === "" ? `0 ${cfg.denominations.find((d) => d.value === 1)?.abbr ?? cfg.default_key}` : text;
}
