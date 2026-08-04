-- Migration: ai_enabled_explicit_choice
-- campaigns.ai_enabled becomes a tri-state explicit owner choice instead of
-- an opt-out default. Decision (Jeffrey, 4 Aug 2026): AI must be an explicit
-- choice, not on-by-default — see context/compliance/ai-act.md §4 for the
-- full consent-gateway design.
--
-- Dropping the default (rather than flipping it to false) means NEW rows get
-- NULL = "not chosen yet", not a silent opt-out on the owner's behalf. The
-- chooser (AiNoticeDialog 'choose' mode, offered to the campaign owner on
-- first open — see AiUseNoticeGate.vue) is what turns null into an explicit
-- true or false. EXISTING rows keep whatever true/false they already have —
-- this migration touches no data, only the constraint.

alter table campaigns
  alter column ai_enabled drop not null,
  alter column ai_enabled drop default;

comment on column campaigns.ai_enabled is
  'Tri-state AI consent, EU AI Act Art 50 gateway (context/compliance/ai-act.md §4): true = owner opted in, false = owner explicitly declined, null = not chosen yet (all new campaigns start here). Only the campaign owner may choose (client-enforced, see AiUseNoticeGate.vue); an unchosen (null) campaign behaves as AI-off everywhere (useCampaignStore().isAiEnabled and every edge-function gate check "=== true", never "!== false").';
