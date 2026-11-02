import type { CurrencyConfig } from "@/lib/currency/currency";

/** D&D 5e's five coins; electrum is never handed out as change. */
export const DND5E_CURRENCY: CurrencyConfig = {
  default_key: "gp",
  denominations: [
    { key: "pp", name: "Platinum", abbr: "pp", value: 1000, color: "#a855f7", makes_change: true },
    { key: "gp", name: "Gold", abbr: "gp", value: 100, color: "#f59e0b", makes_change: true },
    { key: "ep", name: "Electrum", abbr: "ep", value: 50, color: "#60a5fa", makes_change: false },
    { key: "sp", name: "Silver", abbr: "sp", value: 10, color: "#9ca3af", makes_change: true },
    { key: "cp", name: "Copper", abbr: "cp", value: 1, color: "#b45309", makes_change: true },
  ],
};
