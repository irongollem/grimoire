/**
 * Edge copy of the campaign currency core (#934). Edge functions cannot import
 * from src/, so the type and the pure functions the server needs are mirrored
 * from src/lib/currency/currency.ts. currency.test.ts imports both and asserts
 * they agree, so the copies cannot drift.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

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

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
// A number never starts inside another one ("1.5" is not "5").
const NOT_IN_NUMBER = String.raw`(?<![a-z0-9])(?<!\d[.,])`;

/**
 * An amount of one denomination as coins. A decimal part must be a whole number
 * of smallest coins; it becomes change in coins worth less than the denomination
 * ("1.5 gp" is 1 gp 5 sp). Null when it falls between two smallest coins.
 */
function amountCoins(key: string, raw: string, cfg: CurrencyConfig): Coins | null {
  const [whole, frac = ""] = raw.replace(/,/g, "").split(".");
  const out: Coins = { [key]: parseInt(whole, 10) };
  if (!/[1-9]/.test(frac)) return out;
  const value = cfg.denominations.find((d) => d.key === key)?.value ?? 1;
  const units = (parseInt(frac, 10) * value) / 10 ** frac.length;
  if (Math.abs(units - Math.round(units)) > 1e-9) return null;
  const smaller: CurrencyConfig = { ...cfg, denominations: cfg.denominations.filter((d) => d.value < value) };
  for (const [k, n] of Object.entries(makeChange(Math.round(units), smaller))) out[k] = (out[k] ?? 0) + n;
  return out;
}

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
  let bad = false;
  const add = (key: string, raw: string) => {
    const part = amountCoins(key, raw, cfg);
    if (!part) {
      bad = true;
      return;
    }
    for (const [k, n] of Object.entries(part)) coins[k] = (coins[k] ?? 0) + n;
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
    const after = String.raw`(?:${NOT_IN_NUMBER}${AMOUNT}\s*${w}${suffix})`;
    const re = new RegExp(before ? `${before}|${after}` : after, "g");
    for (const m of rest.matchAll(re)) {
      const raw = m[1] ?? m[2];
      if (raw === undefined) continue;
      add(key, raw);
      blank(m);
    }
  }
  if (bad) return null;
  if (found) return coins;

  const bare = rest.trim().match(new RegExp(`^${AMOUNT}$`));
  if (bare) return amountCoins(cfg.default_key, bare[1], cfg);
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


type Row = { currency: unknown } | null;

function isConfig(v: unknown): v is CurrencyConfig {
  if (typeof v !== "object" || v === null) return false;
  const o = v as { default_key?: unknown; denominations?: unknown };
  return typeof o.default_key === "string" && Array.isArray(o.denominations) && o.denominations.length > 0;
}

/** The campaign's currency. Throws when the read fails or the stored config is unusable, so a request never prices in the wrong coins. */
export async function loadCampaignCurrency(client: SupabaseClient, campaignId: string): Promise<CurrencyConfig> {
  const { data, error } = await client.from("campaigns").select("currency").eq("id", campaignId).maybeSingle<NonNullable<Row>>();
  if (error) throw new Error(`Could not read the campaign currency: ${error.message}`);
  if (!data || !isConfig(data.currency)) throw new Error("The campaign has no usable currency.");
  return data.currency;
}

/** The currency as the model needs it: every denomination key with its worth, and the default coin. */
export function currencyPromptBlock(cfg: CurrencyConfig): string {
  const lines = cfg.denominations.map((d) => `- "${d.key}": ${d.name} (${d.abbr}), worth ${d.value} of the smallest coin`);
  return (
    "\n\nThe campaign's currency (use these denomination keys for every coin map):\n" +
    lines.join("\n") +
    `\nThe default coin, used when a price is a bare number, is "${cfg.default_key}".`
  );
}
