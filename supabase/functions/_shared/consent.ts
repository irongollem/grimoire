/**
 * Current version of the Terms of Service / Privacy Policy. The one copy:
 * the client re-exports it from `src/lib/legal.ts` (`@edge-shared`), and the
 * edge functions import it here, so the two can never disagree.
 *
 * Bump it whenever the legal documents change materially, in the same change
 * as a migration redefining `private.current_terms_version()` (which
 * `accept_terms` checks against; `consent.test.ts` fails until they match),
 * and keep it in step with the "Last updated" date in the marketing site's
 * terms.md. Signup and the Terms gate record the accepted version in
 * `user_subscriptions.terms_version`.
 */
export const TERMS_VERSION = "2026-09-28";

/**
 * What changed in TERMS_VERSION, one plain sentence per line. Shown by the
 * in-app Terms gate (TermsGate.vue) and by the admin's Terms notice email
 * (send-terms-notice), so the two always say the same thing. Rewrite it in the
 * same change as a TERMS_VERSION bump.
 */
export const TERMS_CHANGES: readonly string[] = [
  "Accounts for players under 16, set up and managed by a parent.",
  "How to report content that infringes copyright or breaks the law.",
];

// EU right-of-withdrawal consent version, shared by the checkout functions and
// re-exported to the client by src/lib/legal.ts. The buyer ticks a timestamped
// checkbox in the app (recorded in purchase_consents with this version). The
// customer-facing restatement on invoices/receipts lives in the Stripe
// Dashboard "Default footer" (single source of truth), so it isn't duplicated
// here.
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
