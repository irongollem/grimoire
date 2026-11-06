import type { CurrencyConfig } from "@/lib/currency/currency";

/** A Generic campaign starts with one coin; the DM renames it or adds more in Settings → Currency. */
export const GENERIC_CURRENCY: CurrencyConfig = {
  default_key: "coin",
  denominations: [{ key: "coin", name: "Coin", abbr: "c", value: 1, color: "#f59e0b", makes_change: true }],
};
