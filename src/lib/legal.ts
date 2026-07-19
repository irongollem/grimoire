/**
 * Current version of the Terms of Service / Privacy Policy.
 *
 * Bump this whenever the legal documents change materially. Signup records the
 * accepted version (`user_subscriptions.terms_version`) so we can prove what a
 * user agreed to and re-prompt on a future change. Keep in step with the
 * "Last updated" date in the marketing site's terms.md
 * (grimoire-marketing/src/pages/terms.md).
 */
export const TERMS_VERSION = "2026-07-20";

/**
 * Version of the EU right-of-withdrawal waiver wording shown as its own checkbox
 * at checkout. Recorded per purchase in `purchase_consents`. Keep in step with
 * `supabase/functions/_shared/consent.ts::WITHDRAWAL_CONSENT_VERSION`.
 */
export const WITHDRAWAL_CONSENT_VERSION = "2026-06";
