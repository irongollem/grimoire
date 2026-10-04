/**
 * The Terms of Service version and the EU right-of-withdrawal waiver version.
 * Canonical source is `supabase/functions/_shared/consent.ts` (see there for
 * how to bump the Terms version), re-exported here so the client, the edge
 * functions and the database cannot drift apart.
 */
export { TERMS_VERSION, TERMS_CHANGES, WITHDRAWAL_CONSENT_VERSION } from "@edge-shared/consent.ts";

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
