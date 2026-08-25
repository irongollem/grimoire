-- Migration: refresh_openai_models
--
-- Renamed forward from `20260825005907` on 25 Aug 2026. Nothing in the SQL
-- changed; only the version did.
--
-- It was stamped at 00:59 in a worktree for #770 and merged after three other
-- migrations had already been applied to production, the newest being
-- `20260825073922`. `supabase db push` then refused it — "Found local migration
-- files to be inserted before the last migration on remote database" — and the
-- whole production-release job failed with it, so the edge-function deploy that
-- runs afterwards never happened either.
--
-- This is failure mode 2 in CLAUDE.md's migration-version rules, and it is the
-- one with teeth: Vercel ships the frontend off the same push through a separate
-- pipeline, so for the time between that push and this one the app was live
-- against a database that never got the change. Harmless here only because this
-- migration is data-only — no DDL, so nothing referenced a column that did not
-- exist; production simply stayed on gpt-4o-mini / gpt-image-1.5.
--
-- The rule this is the reminder for: a migration that has sat on a branch or in
-- a worktree while other work merged must be renamed forward *before* it merges.
-- Run `npm run migrations:check` before opening the PR — it catches
-- exactly this, in a second, against origin/main.

-- Refresh the platform OpenAI defaults after access to the 5.6 line and
-- gpt-image-2 was enabled. Keep document_model independent: the importer has
-- its own measured Luna configuration from 20260825000600.
update public.provider_config
set
  text_model = 'gpt-5.6-luna',
  image_model = 'gpt-image-2'
where provider = 'openai';

-- 20260508000004 deliberately cleared the speculative pricing seed. Restore
-- verified pricing for both sides of this migration so the cost dashboard can
-- price historical 4o-mini/image-1.5 ledger rows as well as new generations.
-- Sources checked 2026-08-25:
--   https://developers.openai.com/api/docs/models/gpt-5.6-luna
--   https://developers.openai.com/api/docs/models/gpt-image-2
--   https://openai.com/api/pricing/
insert into public.ai_model_pricing (
  model,
  provider,
  model_type,
  input_cost_per_million_tokens,
  output_cost_per_million_tokens,
  image_input_cost_per_million_tokens,
  image_output_cost_per_million_tokens,
  cost_per_image_usd,
  notes,
  last_verified_at,
  updated_at
)
values
  ('gpt-4o-mini',   'openai', 'text',  0.15, 0.60, null, null, null, 'Previous platform text model; retained to price historical ledger rows', '2026-08-25T00:00:00Z', now()),
  ('gpt-5.6-luna',  'openai', 'text',  0.20, 1.20, null, null, null, 'Platform text model; low reasoning effort', '2026-08-25T00:00:00Z', now()),
  ('gpt-image-1.5', 'openai', 'image', 5.00, 10.00, 8.00, 32.00, null, 'Previous platform image model; retained to price historical ledger rows', '2026-08-25T00:00:00Z', now()),
  ('gpt-image-2',   'openai', 'image', 5.00, null, 8.00, 30.00, null, 'Platform image generation and editing model', '2026-08-25T00:00:00Z', now())
on conflict (model) do update set
  provider = excluded.provider,
  model_type = excluded.model_type,
  input_cost_per_million_tokens = excluded.input_cost_per_million_tokens,
  output_cost_per_million_tokens = excluded.output_cost_per_million_tokens,
  image_input_cost_per_million_tokens = excluded.image_input_cost_per_million_tokens,
  image_output_cost_per_million_tokens = excluded.image_output_cost_per_million_tokens,
  cost_per_image_usd = excluded.cost_per_image_usd,
  notes = excluded.notes,
  last_verified_at = excluded.last_verified_at,
  updated_at = excluded.updated_at;
