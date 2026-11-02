import { describe, expect, it } from "vitest";
import { validateCurrency } from "@/lib/currency/currency";
import { DND5E_CURRENCY } from "./dnd5eCurrency";

describe("DND5E_CURRENCY", () => {
  it("is a valid currency (a typo in the default set would ship every campaign an invalid one)", () => {
    expect(validateCurrency(DND5E_CURRENCY)).toEqual([]);
  });
});
