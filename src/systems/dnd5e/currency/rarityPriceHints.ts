import type { CurrencyConfig } from "@/lib/currency/currency";
import type { ItemRarity } from "@/types/item.types";

/**
 * DMG Table 7-1 price guidance, keyed by rarity. This is 5e data and it is
 * written in gold pieces, so it is text rather than a `Coins` map: it is
 * guidance for a DM to read, not a price anyone pays.
 */
export const DND5E_RARITY_PRICE_HINTS: Partial<Record<ItemRarity, string>> = {
  mundane:   "Mundane: market price",
  common:    "Common: ~50–100 gp",
  uncommon:  "Uncommon: ~101–500 gp",
  rare:      "Rare: ~501–5,000 gp",
  very_rare: "Very Rare: ~5,001–50,000 gp",
  legendary: "Legendary: 50,000+ gp",
  artifact:  "Artifact: priceless",
};

/**
 * The hint for a rarity, or "" when the campaign's currency has no gold piece:
 * a table of gp prices means nothing in coins the campaign does not use.
 */
export function rarityPriceHint(rarity: string | null | undefined, currency: CurrencyConfig): string {
  if (!currency.denominations.some((d) => d.key === "gp")) return "";
  return DND5E_RARITY_PRICE_HINTS[(rarity ?? "") as ItemRarity] ?? "";
}
