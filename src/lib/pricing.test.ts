import { afterEach, describe, it, expect, vi } from "vitest";
import { resolveAmount, availableCurrencies, detectCurrency, formatCents, formatPackPrice, taxNote } from "@/lib/pricing";

describe("resolveAmount — Stripe-truth price resolution", () => {
  it("returns null when no base amount is configured (so the UI shows '—', never a fake price)", () => {
    expect(resolveAmount(null, "eur", null, "EUR")).toBeNull();
    expect(resolveAmount(undefined, "eur", null, "EUR")).toBeNull();
    expect(resolveAmount(0, "eur", null, "EUR")).toBeNull();
    expect(resolveAmount(1299, null, null, "EUR")).toBeNull();
  });

  it("returns the base amount when the selected currency matches the base", () => {
    expect(resolveAmount(1299, "EUR", null, "EUR")).toEqual({ amount: 1299, currency: "eur", taxBehavior: null });
  });

  it("is case-insensitive on currency codes", () => {
    expect(resolveAmount(1299, "eur", null, "eur")).toEqual({ amount: 1299, currency: "eur", taxBehavior: null });
  });

  it("uses the per-currency Stripe override when present for the selected currency", () => {
    const opts = { usd: { unit_amount: 1499 }, gbp: { unit_amount: 1099 } };
    expect(resolveAmount(1299, "eur", opts, "USD")).toEqual({ amount: 1499, currency: "usd", taxBehavior: null });
    expect(resolveAmount(1299, "eur", opts, "GBP")).toEqual({ amount: 1099, currency: "gbp", taxBehavior: null });
  });

  it("falls back to the base amount/currency when no override exists for the selected currency", () => {
    const opts = { usd: { unit_amount: 1499 } };
    expect(resolveAmount(1299, "eur", opts, "AUD")).toEqual({ amount: 1299, currency: "eur", taxBehavior: null });
  });

  it("surfaces tax_behavior for the selected currency (and the base currency)", () => {
    const opts = {
      eur: { unit_amount: 1299, tax_behavior: "inclusive" as const },
      usd: { unit_amount: 1299, tax_behavior: "exclusive" as const },
    };
    expect(resolveAmount(1299, "eur", opts, "EUR")).toEqual({ amount: 1299, currency: "eur", taxBehavior: "inclusive" });
    expect(resolveAmount(1299, "eur", opts, "USD")).toEqual({ amount: 1299, currency: "usd", taxBehavior: "exclusive" });
  });
});

describe("taxNote — qualitative tax hint only (never a computed amount)", () => {
  it("labels inclusive prices as VAT-included and exclusive as tax-added", () => {
    expect(taxNote("inclusive")).toBe("incl. VAT");
    expect(taxNote("exclusive")).toBe("+ tax");
  });
  it("shows nothing when tax behavior is unknown/unspecified", () => {
    expect(taxNote("unspecified")).toBeNull();
    expect(taxNote(null)).toBeNull();
    expect(taxNote(undefined)).toBeNull();
  });
});

describe("availableCurrencies", () => {
  it("collects the base plus all override currencies, upper-cased and sorted, de-duped", () => {
    expect(
      availableCurrencies("eur", { usd: { unit_amount: 1 } }, { eur: { unit_amount: 1 }, gbp: { unit_amount: 1 } }),
    ).toEqual(["EUR", "GBP", "USD"]);
  });
  it("tolerates null/undefined maps", () => {
    expect(availableCurrencies("eur", null, undefined)).toEqual(["EUR"]);
  });
  it("returns empty when nothing is configured", () => {
    expect(availableCurrencies(null)).toEqual([]);
  });
});

describe("formatCents", () => {
  it("renders cents as a currency string", () => {
    // exact symbol/format is locale-dependent in happy-dom; assert the number lands
    expect(formatCents(1299, "EUR")).toContain("12.99");
    expect(formatCents(2000, "USD")).toContain("20");
  });
});

describe("detectCurrency", () => {
  afterEach(() => vi.unstubAllGlobals());
  const inLocale = (language: string) => vi.stubGlobal("navigator", { language });

  it.each([
    ["de-DE", "EUR"],
    ["nl-NL", "EUR"],
    ["hr-HR", "EUR"], // euro since 1 Jan 2023
    ["bg-BG", "EUR"], // euro since 1 Jan 2026
    ["en-GB", "GBP"],
    ["sv-SE", "SEK"],
    ["en-US", "USD"],
    ["ja-JP", "USD"],
  ])("prices %s in %s", (language, currency) => {
    inLocale(language);
    expect(detectCurrency()).toBe(currency);
  });

  it("falls back to USD for a locale with no region", () => {
    inLocale("en");
    expect(detectCurrency()).toBe("USD");
  });

  it("falls back to USD for a locale string the browser cannot parse", () => {
    inLocale("not a locale");
    expect(detectCurrency()).toBe("USD");
  });
});

describe("formatPackPrice", () => {
  const pack = {
    stripe_unit_amount: 500,
    stripe_currency: "eur",
    stripe_currency_options: { usd: { unit_amount: 600 } },
  };

  it("prices a pack in the shopper's currency when it has one, and in its own otherwise", () => {
    expect(formatPackPrice(pack, "USD")).toContain("6");
    expect(formatPackPrice(pack, "USD")).not.toContain("5");
    expect(formatPackPrice(pack, "GBP")).toContain("5");
  });

  it("is blank for a pack with no price rather than showing 0", () => {
    expect(formatPackPrice({ ...pack, stripe_unit_amount: null }, "EUR")).toBe("");
    expect(formatPackPrice({ ...pack, stripe_currency: null }, "EUR")).toBe("");
  });
});
