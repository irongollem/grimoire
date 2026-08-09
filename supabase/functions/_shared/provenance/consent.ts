/**
 * Canonical EU AI Act Art 50(1) consent-notice versions (context/compliance/
 * provenance-architecture.md §3). Pure TS, no Deno/Node/browser APIs — this
 * file is imported both by edge functions (relative import) and by the
 * browser via the `@edge-shared` alias (`src/lib/legal.ts` re-exports these
 * two names), so a version bump can never drift between the two worlds.
 */

/**
 * Version of the AI-use notice shown before a campaign's `ai_enabled` toggle
 * is switched on. Recorded once per account in `ai_acknowledgements`
 * (kind: 'ai_use').
 *
 * Deliberately NOT bumped when #641 dropped fal.ai from the notice's list of
 * recipients. Re-acknowledgement exists so nobody's consent silently comes to
 * cover processing they never agreed to; striking a recipient narrows what was
 * already disclosed and cannot do that. Bump it when the disclosure WIDENS —
 * a new provider, a new data category, a new purpose.
 */
export const AI_USE_NOTICE_VERSION = "2026-08-04";

/**
 * Version of the likeness notice shown before a portrait is sent to an AI
 * provider (Simulacrum stylize/sculpt, chronicle reference images, group
 * portrait, NPC disguise). Recorded once per account in `ai_acknowledgements`
 * (kind: 'likeness'). Enforced server-side in `forge-mini` (stylize/sculpt)
 * and `generate-chronicle-image` (portrait-bearing requests) via
 * `hasLikenessAcknowledgement` (./likeness-gate.ts); pre-flighted client-side
 * via `useLikenessGate`.
 */
export const AI_LIKENESS_NOTICE_VERSION = "2026-08-04";

/**
 * Version of the one-time free->Pro AI re-offer, shown to a campaign owner
 * who previously declined AI (`ai_enabled = false`) once they're on Pro
 * (context/compliance/ai-act.md §4, owner decision 4 Aug 2026). Recorded
 * once per account in `ai_acknowledgements` (kind: 'ai_pro_reoffer'),
 * whichever way the owner answers — this is a UI courtesy re-ask, not a
 * security gate, so there is no server-side enforcement to keep in step.
 */
export const AI_PRO_REOFFER_NOTICE_VERSION = "2026-08-04";
