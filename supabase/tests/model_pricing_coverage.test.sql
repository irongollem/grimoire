begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

-- Every model the platform can call has a price (#962).
--
-- `ai_generation_costs` prices a ledger row by joining on `model`. A model with
-- no ai_model_pricing row is not an error anywhere: the call succeeds, credits
-- are charged, and the admin cost views show it as NULL, which their totals
-- then count as free. That is how gpt-image-2.5-sunburst rendered maps for a
-- week uncosted (20261003151734): it was a constant in mapStylePrompt.ts, not a
-- provider_config value, so the admin pricing panel never listed it either.
-- (Since 20261004230642 it is provider_config.map_style_model.)
--
-- Two sources name a model:
--
--   code      a literal in supabase/functions (a default, a fallback, a fixed
--             model like the map styler's). The list below is held equal to
--             the literals actually there by
--             supabase/functions/_shared/pricedModels.test.ts, so a new
--             constant fails the suite until it is listed here, and then this
--             test until it is priced.
--   config    provider_config's model columns, as the migrations leave them.
--             An admin edit in production is covered by the admin pricing
--             panel, which shows a pricing row for every configured model.

create temporary table edge_function_models (model text primary key) on commit drop;
insert into edge_function_models (model) values
  ('claude-haiku-4-5'),
  ('claude-opus-5'),
  ('gemini-2.5-flash'),
  ('gemini-3.1-flash-image'),
  ('gpt-5.6-luna'),
  ('gpt-image-2.5-flare'),
  ('gpt-image-2.5-sunburst');

select is_empty(
  $$ select m.model from edge_function_models m
     where not exists (select 1 from public.ai_model_pricing p where p.model = m.model) $$,
  'every model the edge functions name has a pricing row');

select is_empty(
  $$ select c.provider || '.' || col.name || ' = ' || col.model
     from public.provider_config c
     cross join lateral (values
       ('text_model', c.text_model),
       ('fast_text_model', c.fast_text_model),
       ('image_model', c.image_model),
       ('map_style_model', c.map_style_model),
       ('chronicle_image_model', c.chronicle_image_model),
       ('document_model', c.document_model),
       ('audio_model', c.audio_model),
       ('embedding_model', c.embedding_model)
     ) as col(name, model)
     where col.model is not null
       and not exists (select 1 from public.ai_model_pricing p where p.model = col.model) $$,
  'every model provider_config selects has a pricing row');

select * from finish();
rollback;
