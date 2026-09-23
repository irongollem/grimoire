import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardrail for #905. Every Checkout Session here passes `customer` (so refunds
 * and receipts resolve to the user) together with `automatic_tax` and
 * `tax_id_collection`. Stripe refuses that combination unless
 * `customer_update` lets Checkout save the address and name it collects —
 * the customers are created with an email only. Leaving it out does not fail
 * a build or a test; it fails every real purchase at the moment of payment,
 * which is how the first paying customer met it.
 */
const CHECKOUTS = ["stripe-create-checkout", "stripe-create-credit-checkout"];

describe("checkout sessions for an existing customer", () => {
  it.each(CHECKOUTS)("%s lets Checkout update the customer's address and name", (fn) => {
    const src = readFileSync(join(__dirname, "..", fn, "index.ts"), "utf8");
    expect(src).toMatch(/customer:\s*customerId/);
    expect(src).toMatch(/customer_update:\s*\{\s*address:\s*"auto",\s*name:\s*"auto"\s*\}/);
  });
});
