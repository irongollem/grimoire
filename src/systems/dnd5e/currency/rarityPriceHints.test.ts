import { describe, expect, it } from "vitest";
import type { CurrencyConfig } from "@/lib/currency/currency";
import { DND5E_CURRENCY } from "./dnd5eCurrency";
import { rarityPriceHint } from "./rarityPriceHints";

describe("rarityPriceHint", () => {
  it("gives the DMG gold guidance in a campaign that has gold", () => {
    expect(rarityPriceHint("rare", DND5E_CURRENCY)).toBe("Rare: ~501–5,000 gp");
  });

  it("says nothing in a campaign without a gold piece, where the table would quote coins it lacks", () => {
    const dollars: CurrencyConfig = {
      default_key: "dollar",
      denominations: [{ key: "dollar", name: "Dollar", abbr: "$", value: 1, color: "#00aa00", makes_change: true }],
    };
    expect(rarityPriceHint("rare", dollars)).toBe("");
  });

  it("says nothing for an unknown or missing rarity", () => {
    expect(rarityPriceHint(null, DND5E_CURRENCY)).toBe("");
  });
});
