/**
 * Neutral currency core (#934): a campaign defines its own denominations and
 * every coin-bearing place stores a `Coins` map keyed by denomination.
 */

export interface Denomination {
  key: string;
  name: string;
  abbr: string;
  /** Integer worth in the campaign's smallest unit (the smallest has value 1). */
  value: number;
  /** `#rrggbb`. */
  color: string;
  /** False for a coin never handed out as change (5e electrum). */
  makes_change: boolean;
}

/** Denominations are ordered highest value first. */
export interface CurrencyConfig {
  default_key: string;
  denominations: Denomination[];
}

/** Whole, non-negative counts per denomination key; an absent key is 0. */
export type Coins = Record<string, number>;

/** Total worth in the smallest unit; keys the config does not know contribute nothing. */
export function coinValue(coins: Coins, cfg: CurrencyConfig): number {
  return cfg.denominations.reduce((sum, d) => sum + (coins[d.key] ?? 0) * d.value, 0);
}

/** Per-key sum of two purses, dropping zero entries. */
export function addCoins(a: Coins, b: Coins): Coins {
  const out: Coins = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const n = (a[key] ?? 0) + (b[key] ?? 0);
    if (n !== 0) out[key] = n;
  }
  return out;
}

/** True when any denomination holds a positive count. */
export function hasCoins(coins: Coins): boolean {
  return Object.values(coins).some((n) => n > 0);
}

/** Whether the purse is worth at least the price (by value, not by coin). */
export function canAfford(purse: Coins, price: Coins, cfg: CurrencyConfig): boolean {
  return coinValue(purse, cfg) >= coinValue(price, cfg);
}

/** The non-zero coins in config order (highest first); unknown keys are skipped. */
export function coinParts(coins: Coins, cfg: CurrencyConfig): { denomination: Denomination; count: number }[] {
  return cfg.denominations.flatMap((denomination) => {
    const count = coins[denomination.key] ?? 0;
    return count > 0 ? [{ denomination, count }] : [];
  });
}

/** "5 gp 3 sp" using abbreviations; "" for an empty purse. */
export function formatCoins(coins: Coins, cfg: CurrencyConfig): string {
  return coinParts(coins, cfg)
    .map((p) => `${p.count} ${p.denomination.abbr}`)
    .join(" ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;

/**
 * Reads free-text prices ("1,500 gp", "1 gp 5 sp", "2 golds", "$5") using the
 * campaign's abbreviations and names, case-insensitively. A bare number is the
 * default denomination. A non-alphanumeric abbr (a symbol such as "$") may sit
 * before or after the number. Null when no amount is recognised.
 */
export function parsePrice(text: string, cfg: CurrencyConfig): Coins | null {
  const lower = text.toLowerCase();
  const words: { key: string; word: string }[] = cfg.denominations.flatMap((d) => [
    { key: d.key, word: d.abbr.toLowerCase() },
    { key: d.key, word: d.name.toLowerCase() },
  ]);
  words.sort((a, b) => b.word.length - a.word.length);

  const coins: Coins = {};
  let found = false;
  const add = (key: string, raw: string) => {
    const n = parseInt(raw.replace(/,/g, ""), 10);
    coins[key] = (coins[key] ?? 0) + n;
    found = true;
  };

  // Blank out each matched span so a shorter token never re-reads it.
  let rest = lower;
  const blank = (m: RegExpMatchArray) => {
    const at = m.index ?? 0;
    rest = rest.slice(0, at) + " ".repeat(m[0].length) + rest.slice(at + m[0].length);
  };

  for (const { key, word } of words) {
    const w = escapeRegex(word);
    const symbol = !/[a-z0-9]/i.test(word);
    // Letters must end at a word boundary; a name may carry a plural "s".
    const suffix = symbol ? "" : String.raw`(?:s)?(?![a-z0-9])`;
    const before = symbol ? String.raw`(?:${w}\s*${AMOUNT})` : null;
    const after = String.raw`(?:(?<![a-z0-9])${AMOUNT}\s*${w}${suffix})`;
    const re = new RegExp(before ? `${before}|${after}` : after, "g");
    for (const m of rest.matchAll(re)) {
      const raw = m[1] ?? m[2];
      if (raw === undefined) continue;
      add(key, raw);
      blank(m);
    }
  }
  if (found) return coins;

  const bare = rest.trim().match(new RegExp(`^${AMOUNT}$`));
  if (bare) return { [cfg.default_key]: parseInt(bare[1].replace(/,/g, ""), 10) };
  return null;
}

/**
 * Greedy change over the coins that make change (highest first). Whatever is
 * left below the smallest change coin goes into the value-1 denomination.
 */
export function makeChange(value: number, cfg: CurrencyConfig): Coins {
  const out: Coins = {};
  let left = Math.max(0, Math.floor(value));
  for (const d of cfg.denominations) {
    if (!d.makes_change || left <= 0) continue;
    const n = Math.floor(left / d.value);
    if (n > 0) {
      out[d.key] = n;
      left -= n * d.value;
    }
  }
  if (left > 0) {
    const unit = cfg.denominations.find((d) => d.value === 1);
    if (unit) out[unit.key] = (out[unit.key] ?? 0) + left;
  }
  return out;
}

/**
 * A value (in the smallest coin) written as a price: change in coins worth no
 * more than the default coin, so it reads the way a bare number would ("1500
 * gp", never "15 pp") and parses back to the same value. Zero reads as "0" of
 * the smallest coin. Mirrors `formatCost` in supabase/functions/_shared/invention/price.ts.
 */
export function formatPrice(value: number, cfg: CurrencyConfig): string {
  const top = cfg.denominations.find((d) => d.key === cfg.default_key)?.value ?? Infinity;
  const priced: CurrencyConfig = { ...cfg, denominations: cfg.denominations.filter((d) => d.value <= top) };
  const text = formatCoins(makeChange(Math.max(0, Math.round(value)), priced), priced);
  if (text) return text;
  const unit = cfg.denominations.find((d) => d.value === 1);
  return `0 ${unit?.abbr ?? cfg.default_key}`;
}

/**
 * Re-expresses the removed denomination's count, by value, in the coins that
 * make change; every other count stays. Pure: callers decide what to do with it.
 */
export function convertRemoved(coins: Coins, cfg: CurrencyConfig, removedKey: string): Coins {
  const removed = cfg.denominations.find((d) => d.key === removedKey);
  const { [removedKey]: count = 0, ...kept } = coins;
  if (!removed || count <= 0) return kept;
  return addCoins(kept, makeChange(count * removed.value, cfg));
}

const KEY_RE = /^[a-z][a-z0-9_]{0,15}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Human-readable problems with a currency config; empty when it is valid. */
export function validateCurrency(cfg: CurrencyConfig): string[] {
  const problems: string[] = [];
  const dens = cfg.denominations;
  if (dens.length === 0) problems.push("Add at least one denomination.");

  const keys = new Set<string>();
  const abbrs = new Set<string>();
  for (const d of dens) {
    const label = d.name.trim() || d.key || "A denomination";
    if (!KEY_RE.test(d.key)) problems.push(`${label}: the key must start with a letter and use only a-z, 0-9 and _ (16 characters at most).`);
    if (keys.has(d.key)) problems.push(`${label}: the key "${d.key}" is used twice.`);
    keys.add(d.key);
    if (!d.name.trim()) problems.push(`${label}: a name is required.`);
    if (!d.abbr.trim()) problems.push(`${label}: an abbreviation is required.`);
    const abbr = d.abbr.toLowerCase();
    if (d.abbr.trim() && abbrs.has(abbr)) problems.push(`${label}: the abbreviation "${d.abbr}" is used twice.`);
    abbrs.add(abbr);
    if (!Number.isInteger(d.value) || d.value < 1) problems.push(`${label}: the value must be a whole number of at least 1.`);
    if (!COLOR_RE.test(d.color)) problems.push(`${label}: the color must look like #rrggbb.`);
  }

  if (dens.length > 0 && dens.filter((d) => d.value === 1).length !== 1) {
    problems.push("Exactly one denomination must have value 1 (the smallest unit).");
  }
  if (!dens.some((d) => d.key === cfg.default_key)) problems.push("The default denomination must be one of the denominations.");
  for (let i = 1; i < dens.length; i++) {
    if (dens[i].value >= dens[i - 1].value) {
      problems.push("Denominations must be ordered from highest to lowest value, with no two of equal value.");
      break;
    }
  }
  return problems;
}
