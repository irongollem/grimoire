import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renewalDisclosure } from "./consent";

describe("renewalDisclosure", () => {
  it("names the period, the price, and how to stop it", () => {
    const text = renewalDisclosure("month", "€8");
    expect(text).toContain("renews automatically every month at €8");
    expect(text).toContain("until you cancel");
    expect(text).toContain("cancel anytime");
  });

  it("says year for the annual plan and omits the price when Stripe prints it", () => {
    const text = renewalDisclosure("year");
    expect(text).toContain("every year until you cancel");
    expect(text).not.toContain(" at ");
  });

  // The disclosure must sit above Stripe's Subscribe button, not only the app's.
  it("is passed to the subscription checkout as the submit-button text", () => {
    const src = readFileSync(join(__dirname, "..", "stripe-create-checkout", "index.ts"), "utf8");
    expect(src).toMatch(/submit:\s*\{\s*message:\s*renewalDisclosure\(interval\)/);
  });
});
