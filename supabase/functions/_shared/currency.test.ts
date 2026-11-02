import { describe, it, expect } from "vitest";
import * as edge from "./currency.ts";
import * as app from "../../../src/lib/currency/currency";
import { formatCost } from "./invention/price.ts";
import { DND5E_CURRENCY } from "../../../src/systems/dnd5e/currency/dnd5eCurrency";

const DOLLARS: edge.CurrencyConfig = {
  default_key: "usd",
  denominations: [
    { key: "usd", name: "Dollar", abbr: "$", value: 100, color: "#00aa00", makes_change: true },
    { key: "cent", name: "Cent", abbr: "c", value: 1, color: "#aa5500", makes_change: true },
  ],
};

describe("edge currency copy agrees with src/lib/currency", () => {
  // Bug it fails on: the edge copy of parsePrice/makeChange/formatCoins drifting from the client's.
  for (const [label, cfg] of [["5e", DND5E_CURRENCY], ["dollars", DOLLARS]] as const) {
    it(`prices, change and formatting match for ${label}`, () => {
      for (const text of ["12", "1,500 gp", "1 gp 5 sp", "$5", "7 c", "2 golds", "priceless"]) {
        expect(edge.parsePrice(text, cfg)).toEqual(app.parsePrice(text, cfg));
      }
      for (const value of [0, 1, 99, 100, 155, 150000]) {
        const change = edge.makeChange(value, cfg);
        expect(change).toEqual(app.makeChange(value, cfg));
        expect(edge.coinValue(change, cfg)).toBe(app.coinValue(change, cfg));
        expect(edge.formatCoins(change, cfg)).toBe(app.formatCoins(change, cfg));
        // The server writes an invention's cost; the client shows its value. One rule for both.
        expect(formatCost(value, cfg)).toBe(app.formatPrice(value, cfg));
      }
    });
  }
  it("reads a bare number in the campaign's default coin, not gold", () => {
    expect(edge.parsePrice("5", DOLLARS)).toEqual({ usd: 5 });
  });
});

describe("currencyPromptBlock", () => {
  it("lists every key with its worth and names the default coin", () => {
    const block = edge.currencyPromptBlock(DOLLARS);
    expect(block).toContain('"usd": Dollar ($), worth 100');
    expect(block).toContain('"cent": Cent (c), worth 1');
    expect(block).toContain('"usd"');
    expect(block).not.toContain("gp");
  });
});

describe("loadCampaignCurrency", () => {
  const client = (result: { data: unknown; error: { message: string } | null }) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) as never;
  it("returns the stored config", async () => {
    expect(await edge.loadCampaignCurrency(client({ data: { currency: DOLLARS }, error: null }), "c1")).toEqual(DOLLARS);
  });
  it("throws on a read error rather than pricing in the wrong coins", async () => {
    await expect(edge.loadCampaignCurrency(client({ data: null, error: { message: "boom" } }), "c1")).rejects.toThrow("boom");
  });
  it("throws on a missing or malformed config", async () => {
    await expect(edge.loadCampaignCurrency(client({ data: { currency: {} }, error: null }), "c1")).rejects.toThrow("no usable currency");
  });
});
