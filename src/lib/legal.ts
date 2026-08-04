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

/**
 * AI-use, likeness, and Pro re-offer consent-notice versions (EU AI Act
 * Art 50(1) — see context/compliance/provenance-architecture.md §3).
 * Canonical source is `supabase/functions/_shared/provenance/consent.ts`,
 * re-exported here via the `@edge-shared` alias so the client and the
 * edge-function backstop (`forge-mini`, `generate-chronicle-image`) can
 * never drift on version. Bump the canonical constants to re-prompt everyone.
 */
export {
  AI_USE_NOTICE_VERSION,
  AI_LIKENESS_NOTICE_VERSION,
  AI_PRO_REOFFER_NOTICE_VERSION,
} from "@edge-shared/provenance/consent.ts";
