import { describe, expect, it } from "vitest";
import { DND5E_CURRENCY as FIVE } from "@/systems/dnd5e/currency/dnd5eCurrency";
import {
  addCoins,
  canAfford,
  coinParts,
  coinValue,
  formatCoins,
  formatPrice,
  hasCoins,
  makeChange,
  parsePrice,
  validateCurrency,
  type CurrencyConfig,
} from "./currency";

const USD: CurrencyConfig = {
  default_key: "usd",
  denominations: [
    { key: "usd", name: "Dollar", abbr: "$", value: 100, color: "#22c55e", makes_change: true },
    { key: "cent", name: "Cent", abbr: "¢", value: 1, color: "#b45309", makes_change: true },
  ],
};

describe("coinValue / canAfford", () => {
  it("sums by value and ignores unknown keys (a removed coin inflating a total)", () => {
    expect(coinValue({ gp: 2, sp: 3, zz: 99 }, FIVE)).toBe(230);
  });
  it("compares by value, not by coin count (3 sp cannot buy 1 gp, 11 sp can)", () => {
    expect(canAfford({ sp: 3 }, { gp: 1 }, FIVE)).toBe(false);
    expect(canAfford({ sp: 11 }, { gp: 1 }, FIVE)).toBe(true);
  });
});

describe("addCoins / hasCoins", () => {
  it("sums per key and drops zeros (a zero entry keeping an empty purse truthy)", () => {
    expect(addCoins({ gp: 2, sp: 1 }, { gp: 3, sp: -1 })).toEqual({ gp: 5 });
    expect(hasCoins(addCoins({ gp: 1 }, { gp: -1 }))).toBe(false);
  });
});

describe("coinParts / formatCoins", () => {
  it("lists highest first and skips unknown keys (display order following insertion order)", () => {
    const parts = coinParts({ sp: 3, gp: 5, zz: 2 }, FIVE);
    expect(parts.map((p) => [p.denomination.key, p.count])).toEqual([["gp", 5], ["sp", 3]]);
  });
  it("formats with abbreviations and empty as empty string", () => {
    expect(formatCoins({ sp: 3, gp: 5 }, FIVE)).toBe("5 gp 3 sp");
    expect(formatCoins({}, FIVE)).toBe("");
  });
});

describe("parsePrice", () => {
  it("reads a bare number as the default denomination (a price '50' read as 50 cp)", () => {
    expect(parsePrice("50", FIVE)).toEqual({ gp: 50 });
    expect(parsePrice("50", USD)).toEqual({ usd: 50 });
  });
  it("reads thousands separators (1,500 gp read as 1 gp)", () => {
    expect(parsePrice("1,500 gp", FIVE)).toEqual({ gp: 1500 });
  });
  // Bug it fails on: "1.5 gp" read as 5 gp (the number match started after the dot), 10x too high.
  it("reads decimal amounts as whole coins of change", () => {
    expect(parsePrice("1.5 gp", FIVE)).toEqual({ gp: 1, sp: 5 });
    expect(parsePrice("0.5 gp", FIVE)).toEqual({ gp: 0, sp: 5 });
    expect(parsePrice("0.50", FIVE)).toEqual({ gp: 0, sp: 5 });
    expect(parsePrice("1,500.25 gp", FIVE)).toEqual({ gp: 1500, sp: 2, cp: 5 });
    expect(parsePrice("12.25 $", USD)).toEqual({ usd: 12, cent: 25 });
  });
  it("is unparseable when a decimal falls between two smallest coins (0.5 cp)", () => {
    expect(parsePrice("0.5 cp", FIVE)).toBeNull();
    expect(parsePrice("1 gp 0.5 cp", FIVE)).toBeNull();
  });
  it("never starts a number inside another (1.5 gp is not 5 gp, 1,5 sp is not 5 sp)", () => {
    expect(parsePrice("1.5 gp", FIVE)).not.toEqual({ gp: 5 });
    expect(parsePrice("1,5 sp", FIVE)).toBeNull();
  });
  it("reads several parts", () => {
    expect(parsePrice("1 gp 5 sp", FIVE)).toEqual({ gp: 1, sp: 5 });
  });
  it("reads names, case-insensitively, with a plural s", () => {
    expect(parsePrice("2 Golds", FIVE)).toEqual({ gp: 2 });
    expect(parsePrice("3 silver", FIVE)).toEqual({ sp: 3 });
    expect(parsePrice("5 GP", FIVE)).toEqual({ gp: 5 });
  });
  it("does not read an abbreviation inside a longer word (the 'sp' of 'spells')", () => {
    expect(parsePrice("3 spells", FIVE)).toBeNull();
  });
  it("returns null when no amount is recognised", () => {
    expect(parsePrice("—", FIVE)).toBeNull();
    expect(parsePrice("", FIVE)).toBeNull();
    expect(parsePrice("priceless", FIVE)).toBeNull();
    expect(parsePrice("gp", FIVE)).toBeNull();
  });
  it("supports a symbol abbr before or after the number, escaped (regex '$' or '¢' mishandled)", () => {
    expect(parsePrice("$5", USD)).toEqual({ usd: 5 });
    expect(parsePrice("5 $", USD)).toEqual({ usd: 5 });
    expect(parsePrice("$5 50¢", USD)).toEqual({ usd: 5, cent: 50 });
    expect(parsePrice("5 dollars", USD)).toEqual({ usd: 5 });
  });
  it("lets a longer token win (an 'sp' abbr stealing from 'sp' inside another denomination's name)", () => {
    const cfg: CurrencyConfig = {
      default_key: "g",
      denominations: [
        { key: "g", name: "Gem", abbr: "g", value: 10, color: "#111111", makes_change: true },
        { key: "gp", name: "Gold piece", abbr: "gp", value: 1, color: "#222222", makes_change: true },
      ],
    };
    expect(parsePrice("5 gp", cfg)).toEqual({ gp: 5 });
  });
});

describe("makeChange", () => {
  it("never hands out electrum as change (makes_change ignored)", () => {
    expect(makeChange(50, FIVE)).toEqual({ sp: 5 });
    expect(makeChange(1234, FIVE)).toEqual({ pp: 1, gp: 2, sp: 3, cp: 4 });
  });
  it("puts a remainder below the smallest change coin into the value-1 coin", () => {
    const cfg: CurrencyConfig = {
      default_key: "a",
      denominations: [
        { key: "a", name: "A", abbr: "a", value: 10, color: "#111111", makes_change: true },
        { key: "b", name: "B", abbr: "b", value: 3, color: "#222222", makes_change: false },
        { key: "c", name: "C", abbr: "c", value: 1, color: "#333333", makes_change: false },
      ],
    };
    expect(makeChange(27, cfg)).toEqual({ a: 2, c: 7 });
  });
});

describe("validateCurrency", () => {
  const ok = () => structuredClone(FIVE);
  it("accepts 5e and dollars", () => {
    expect(validateCurrency(FIVE)).toEqual([]);
    expect(validateCurrency(USD)).toEqual([]);
  });
  const cases: [string, (c: CurrencyConfig) => void][] = [
    ["no denominations", (c) => { c.denominations = []; }],
    ["bad key shape", (c) => { c.denominations[1].key = "Gold!"; c.default_key = "Gold!"; }],
    ["empty key", (c) => { c.denominations[1].key = ""; }],
    ["duplicate key", (c) => { c.denominations[1].key = "pp"; }],
    ["empty abbr", (c) => { c.denominations[1].abbr = " "; }],
    ["duplicate abbr case-insensitively", (c) => { c.denominations[1].abbr = "PP"; }],
    ["empty name", (c) => { c.denominations[1].name = ""; }],
    ["fractional value", (c) => { c.denominations[1].value = 99.5; }],
    ["zero value", (c) => { c.denominations[4].value = 0; }],
    ["no value-1 coin", (c) => { c.denominations[4].value = 5; }],
    ["two value-1 coins", (c) => { c.denominations[3].value = 1; }],
    ["unknown default", (c) => { c.default_key = "zz"; }],
    ["unsorted", (c) => { [c.denominations[0], c.denominations[1]] = [c.denominations[1], c.denominations[0]]; }],
    ["tied values", (c) => { c.denominations[2].value = 100; }],
    ["bad color", (c) => { c.denominations[1].color = "gold"; }],
  ];
  it.each(cases)("rejects %s", (_name, mutate) => {
    const cfg = ok();
    mutate(cfg);
    expect(validateCurrency(cfg).length).toBeGreaterThan(0);
  });
});

describe("formatPrice", () => {
  it("writes a price in the default coin and below, so it reads back as the same price (bug: 4000 cp shown as 4 pp)", () => {
    expect(formatPrice(4000, FIVE)).toBe("40 gp");
    expect(parsePrice(formatPrice(150055, FIVE), FIVE)).toEqual({ gp: 1500, sp: 5, cp: 5 });
  });
  it("writes nothing as zero of the smallest coin", () => {
    expect(formatPrice(0, FIVE)).toBe("0 cp");
  });
});
