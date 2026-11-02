import { describe, it, expect } from "vitest";
import { DND5E_CURRENCY } from "../../../../src/systems/dnd5e/currency/dnd5eCurrency";
import { formatCost, parseCostValue, unitValue } from "./price.ts";

const DOLLARS = {
  default_key: "usd",
  denominations: [
    { key: "usd", name: "Dollar", abbr: "$", value: 100, color: "#00aa00", makes_change: true },
    { key: "cent", name: "Cent", abbr: "c", value: 1, color: "#aa5500", makes_change: true },
  ],
};

describe("parseCostValue", () => {
  it("reads 5e coins", () => {
    expect(parseCostValue("50 gp", DND5E_CURRENCY)).toBe(5000);
    expect(parseCostValue("1,500 gp", DND5E_CURRENCY)).toBe(150000);
    expect(parseCostValue("5 sp", DND5E_CURRENCY)).toBe(50);
    expect(parseCostValue("1 pp", DND5E_CURRENCY)).toBe(1000);
    expect(parseCostValue("3 ep", DND5E_CURRENCY)).toBe(150);
    expect(parseCostValue("1 gp 5 sp", DND5E_CURRENCY)).toBe(150);
  });
  // Bug it fails on: "0.5 gp" priced as 5 gp, "0.50" not parsed at all (rarity default instead).
  it("reads decimal prices", () => {
    expect(parseCostValue("0.5 gp", DND5E_CURRENCY)).toBe(50);
    expect(parseCostValue("1.5 gp", DND5E_CURRENCY)).toBe(150);
    expect(parseCostValue("0.50", DND5E_CURRENCY)).toBe(50);
    expect(parseCostValue("0.5 cp", DND5E_CURRENCY)).toBeNull();
  });
  // Bug it fails on: a bare number hard-wired to gold instead of the campaign's default coin.
  it("reads a bare number in the campaign's default coin", () => {
    expect(parseCostValue("12", DND5E_CURRENCY)).toBe(1200);
    expect(parseCostValue("12", DOLLARS)).toBe(1200);
    expect(parseCostValue("12", { ...DOLLARS, default_key: "cent" })).toBe(12);
  });
  it("does not know the 5e coins in a campaign without them", () => {
    expect(parseCostValue("50 gp", DOLLARS)).toBeNull();
    expect(parseCostValue("$5 7 c", DOLLARS)).toBe(507);
  });
  it("calls zero, blank and junk unpriced", () => {
    expect(parseCostValue("0", DND5E_CURRENCY)).toBeNull();
    expect(parseCostValue("0 gp", DND5E_CURRENCY)).toBeNull();
    expect(parseCostValue("  ", DND5E_CURRENCY)).toBeNull();
    expect(parseCostValue(null, DND5E_CURRENCY)).toBeNull();
    expect(parseCostValue("priceless", DND5E_CURRENCY)).toBeNull();
  });
});

describe("unitValue", () => {
  it("falls back to the 5e rarity table on the 5e coins", () => {
    expect(unitValue("0", "mundane", DND5E_CURRENCY)).toBe(100);
    expect(unitValue(null, "uncommon", DND5E_CURRENCY)).toBe(10100);
    expect(unitValue("", "artifact", DND5E_CURRENCY)).toBe(5000100);
    expect(unitValue("7 gp", "rare", DND5E_CURRENCY)).toBe(700);
  });
  // Bug it fails on: 5e copper prices applied to a currency whose smallest coin is a cent.
  it("leaves an unpriced item unpriced on any other coins", () => {
    expect(unitValue(null, "uncommon", DOLLARS)).toBe(0);
    expect(unitValue("$7", "rare", DOLLARS)).toBe(700);
  });
});

describe("formatCost", () => {
  it("writes change in the campaign's coins", () => {
    expect(formatCost(4000, DND5E_CURRENCY)).toBe("40 gp");
    expect(formatCost(150000, DND5E_CURRENCY)).toBe("1500 gp");
    expect(formatCost(155, DND5E_CURRENCY)).toBe("1 gp 5 sp 5 cp");
    expect(formatCost(0, DND5E_CURRENCY)).toBe("0 cp");
  });
  it("never names a coin the campaign lacks", () => {
    expect(formatCost(507, DOLLARS)).toBe("5 $ 7 c");
    expect(formatCost(0, DOLLARS)).toBe("0 c");
  });
});
