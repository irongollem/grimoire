// EU right-of-withdrawal consent version, shared by the checkout functions. The
// buyer ticks a timestamped checkbox in the app (recorded in purchase_consents
// with this version). The customer-facing restatement on invoices/receipts lives
// in the Stripe Dashboard "Default footer" (single source of truth), so it isn't
// duplicated here. Keep in step with src/lib/legal.ts::WITHDRAWAL_CONSENT_VERSION.
export const WITHDRAWAL_CONSENT_VERSION = "2026-06";

/**
 * Automatic-renewal disclosure for the Pro subscription, shown twice: beside
 * the app's Upgrade button (BillingView, via `@edge-shared`) and as Stripe
 * Checkout's `custom_text.submit` — the text directly above Stripe's own
 * Subscribe button, which is the button that actually takes the money.
 *
 * California's Automatic Renewal Law (Bus. & Prof. Code §17602) wants the
 * renewal terms "in visual proximity" to the consent request, before the buyer
 * commits; goods sent without that are treated as an unconditional gift. The
 * EU consumer rules and the FTC's ROSCA ask for the same things: that it
 * renews, how often, at what price, until when, and how to stop it. A "cancel
 * anytime" footnote below the button said only the last of those.
 *
 * `price` should carry its own tax note ("€8 incl. VAT") where the app knows
 * one; it is omitted on Stripe's page, which prints the amount and tax itself.
 */
export function renewalDisclosure(interval: "month" | "year", price?: string): string {
  const period = interval === "year" ? "year" : "month";
  const charge = price ? ` at ${price}` : "";
  return (
    `Your Pro subscription renews automatically every ${period}${charge} until you cancel. ` +
    "You can cancel anytime from Billing in Grimoire; cancelling stops the next renewal charge."
  );
}
