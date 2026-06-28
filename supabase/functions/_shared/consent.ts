// EU right-of-withdrawal consent version, shared by the checkout functions. The
// buyer ticks a timestamped checkbox in the app (recorded in purchase_consents
// with this version). The customer-facing restatement on invoices/receipts lives
// in the Stripe Dashboard "Default footer" (single source of truth), so it isn't
// duplicated here. Keep in step with src/lib/legal.ts::WITHDRAWAL_CONSENT_VERSION.
export const WITHDRAWAL_CONSENT_VERSION = "2026-06";
