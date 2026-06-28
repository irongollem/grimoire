// EU right-of-withdrawal consent text + version, shared by the checkout
// functions. The buyer ticks a timestamped checkbox in the app (recorded in
// purchase_consents); this same waiver rides on the Stripe invoice footer so the
// confirmation email carries it. Keep WITHDRAWAL_CONSENT_VERSION in step with
// src/lib/legal.ts.
export const WITHDRAWAL_CONSENT_VERSION = "2026-06";

export const WITHDRAWAL_CONSENT_FOOTER =
  "By completing this purchase you expressly requested immediate provision of the digital service and acknowledged that you thereby lose your 14-day right of withdrawal once it has been supplied (for a subscription: for each billing period once supplied; for AI credits: once they are used). Full terms: https://dungeongrimoire.com/refunds";
