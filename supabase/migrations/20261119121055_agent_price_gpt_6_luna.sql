-- The cached-input price of gpt-6-luna (#1021).
--
-- `20261116184759` moved the platform's text model to gpt-6-luna and priced its input and output. A conversation
-- resends its history every turn, so most of its input is served from the provider's prompt cache, and until a
-- cached rate is on file `usdForUsage` charges that input at the full rate (a missing number never makes play
-- cheaper). The figure is OpenAI's published price of 16 Nov 2026: 0.01 USD per million cached input tokens, a
-- tenth of the 0.10 input rate.
--
-- Only when no cached rate is on file: an admin's own figure is not overwritten.
update public.ai_model_pricing
set cached_input_cost_per_million_tokens = 0.01
where model = 'gpt-6-luna'
  and cached_input_cost_per_million_tokens is null;
