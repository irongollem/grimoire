-- The cached-input price of gpt-5.6-luna (#1021).
--
-- `agent-turn` meters a conversation from measured tokens, and a conversation resends its history every turn, so
-- most of its input is served from the provider's prompt cache (about four fifths in the first live turns). Until a
-- cached rate is on file, `usdForUsage` charges cached input at the full input rate (a missing number never makes
-- play cheaper), so the player paid for a saving only we received. The figure is OpenAI's published price of
-- 16 Nov 2026: 0.02 USD per million cached input tokens, a tenth of the 0.20 input rate.
--
-- Only this model, only when the row exists and has no cached rate yet: an admin's own figure is not overwritten.
update public.ai_model_pricing
set cached_input_cost_per_million_tokens = 0.02
where model = 'gpt-5.6-luna'
  and cached_input_cost_per_million_tokens is null;
