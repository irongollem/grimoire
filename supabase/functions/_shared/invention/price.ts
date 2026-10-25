import type { ItemRarity } from "./types.ts";

const COIN_CP: Record<string, number> = {
  pp: 1000,
  platinum: 1000,
  gp: 100,
  gold: 100,
  ep: 50,
  electrum: 50,
  sp: 10,
  silver: 10,
  cp: 1,
  copper: 1,
};

// What an item with no usable price is worth, by rarity (DMG 7-1 floor of the band).
const UNPRICED_CP: Record<ItemRarity, number> = {
  mundane: 100,
  common: 5000,
  uncommon: 10100,
  rare: 50100,
  very_rare: 500100,
  legendary: 5000100,
  artifact: 5000100,
};

const NUMBER = String.raw`(\d[\d,]*(?:\.\d+)?|\.\d+)`;
const COIN_RE = new RegExp(`${NUMBER}\\s*(pp|platinum|gp|gold|ep|electrum|sp|silver|cp|copper)\\b`, "gi");
const BARE_RE = new RegExp(`^${NUMBER}$`);

function toNumber(text: string): number {
  return Number(text.replace(/,/g, ""));
}

/** Copper value of a cost text, or null when blank, zero or unparseable. A bare number is gp. */
export function parseCostCp(cost: string | null): number | null {
  if (cost === null) return null;
  const text = cost.trim();
  if (text === "") return null;
  const bare = BARE_RE.exec(text);
  let total = 0;
  if (bare) {
    total = toNumber(bare[1]) * 100;
  } else {
    for (const m of text.matchAll(COIN_RE)) {
      total += toNumber(m[1]) * COIN_CP[m[2].toLowerCase()];
    }
  }
  const cp = Math.round(total);
  return Number.isFinite(cp) && cp > 0 ? cp : null;
}

/** Per-unit value in copper: the cost when it parses, else the rarity's unpriced value. */
export function unitValueCp(cost: string | null, rarity: ItemRarity): number {
  const parsed = parseCostCp(cost);
  return parsed === null ? UNPRICED_CP[rarity] : parsed;
}

/** "1,500 gp" when a whole number of gp, else sp, else cp. */
export function formatCostCp(cp: number): string {
  const n = Math.max(0, Math.round(cp));
  if (n > 0 && n % 100 === 0) return `${(n / 100).toLocaleString("en-US")} gp`;
  if (n > 0 && n % 10 === 0) return `${(n / 10).toLocaleString("en-US")} sp`;
  return `${n.toLocaleString("en-US")} cp`;
}
