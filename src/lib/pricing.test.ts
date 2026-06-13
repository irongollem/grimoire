import { describe, it, expect } from "vitest";
import { resolveAmount, availableCurrencies, formatCents } from "./pricing";

describe("resolveAmount — Stripe-truth price resolution", () => {
  it("returns null when no base amount is configured (so the UI shows '—', never a fake price)", () => {
    expect(resolveAmount(null, "eur", null, "EUR")).toBeNull();
    expect(resolveAmount(undefined, "eur", null, "EUR")).toBeNull();
    expect(resolveAmount(0, "eur", null, "EUR")).toBeNull();
    expect(resolveAmount(1299, null, null, "EUR")).toBeNull();
  });

  it("returns the base amount when the selected currency matches the base", () => {
    expect(resolveAmount(1299, "EUR", null, "EUR")).toEqual({ amount: 1299, currency: "eur" });
  });

  it("is case-insensitive on currency codes", () => {
    expect(resolveAmount(1299, "eur", null, "eur")).toEqual({ amount: 1299, currency: "eur" });
  });

  it("uses the per-currency Stripe override when present for the selected currency", () => {
    const opts = { usd: { unit_amount: 1499 }, gbp: { unit_amount: 1099 } };
    expect(resolveAmount(1299, "eur", opts, "USD")).toEqual({ amount: 1499, currency: "usd" });
    expect(resolveAmount(1299, "eur", opts, "GBP")).toEqual({ amount: 1099, currency: "gbp" });
  });

  it("falls back to the base amount/currency when no override exists for the selected currency", () => {
    const opts = { usd: { unit_amount: 1499 } };
    expect(resolveAmount(1299, "eur", opts, "AUD")).toEqual({ amount: 1299, currency: "eur" });
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
