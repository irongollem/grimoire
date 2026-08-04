-- Migration: ai_pro_reoffer_kind
-- Extends ai_acknowledgements.kind with 'ai_pro_reoffer' (#600 follow-on, owner decision 4 Aug 2026)
--
-- When a user upgrades free -> Pro, campaigns where they (as owner) previously
-- declined AI (`ai_enabled = false`) get ONE re-ask: Pro is presumed to be
-- purchased partly for AI features, and the earlier "Not now" may predate
-- that intent. This is never an auto-flip of `ai_enabled` — it is a single
-- re-prompt of the same chooser used for `ai_enabled = null` (see
-- AiUseNoticeGate.vue), Pro-aware copy only.
--
-- One 'ai_pro_reoffer' row means the re-ask was answered, whichever way:
--   - Confirm ("Enable AI assistance") -> ai_enabled is set true, and BOTH
--     'ai_use' (if not already recorded) and 'ai_pro_reoffer' are recorded.
--   - "Not now" -> ai_enabled stays false, and ONLY 'ai_pro_reoffer' is
--     recorded. The reconsidered "no" is final: no future re-prompting on
--     any device, for any owned campaign, once this row exists.
--
-- Recording is user-level (not per-campaign), matching every other kind in
-- this table: the re-ask fires for whichever owned AI-off campaign the user
-- opens first after upgrading, and answering it there silences the re-ask
-- for all their other AI-off campaigns too. Intended — see the gate branch
-- comment in AiUseNoticeGate.vue for the full rationale.

alter table ai_acknowledgements drop constraint ai_acknowledgements_kind_check;
alter table ai_acknowledgements add constraint ai_acknowledgements_kind_check
  check (kind in ('ai_use', 'likeness', 'ai_pro_reoffer'));
