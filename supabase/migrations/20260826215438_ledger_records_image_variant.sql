-- Migration: ledger_records_image_variant
--
-- Two holes in the cost record that only became visible once a second
-- gpt-image-2 variant shipped. Both matter for the same reason: every price in
-- `ai_generation_credit_costs` is meant to be set from measured spend, and
-- `get_credit_calibration_hints` reads that measurement back to recommend one.
--
-- ── 1. One model, two prices, one row shape ─────────────────────────────────
--
-- `ai_generation_costs` joins `ai_model_pricing` on `model` alone, and there is
-- exactly one `gpt-image-2` row. That is correct for the RATES — they are
-- per-token, and low versus high differs in how many output tokens a render
-- produces, not in what a token costs — so a fully-reported row prices right
-- either way. What is missing is the ability to tell the variants APART: an
-- entity portrait at 1024x1536 high and a tile at 1024x1024 low both record as
-- plain `gpt-image-2`, so no report can show cost by variant, notice one
-- regressing, or explain why the average moved.
--
-- `quality` and `size` are already known at every call site and already stored
-- per attempt in `tile_pack_generation_jobs.attempts[].execution`. They were
-- simply never carried to the ledger, which is the table every cost report and
-- the calibration RPC actually read.
--
-- ── 2. A render with no usage metadata priced as free ───────────────────────
--
-- `openaiUsage` defaults absent token counts to 0, and the view's first branch
-- fires on `IS NOT NULL` — 0 is not null — so it computed a confident $0.0000
-- for a call that in fact cost us money. Not hypothetical for this provider:
-- the 25 Aug experiment recorded that the Images API did not expose usage
-- metadata for gpt-image-2 at all, which is why that measurement had to be
-- reconstructed from documented token counts by hand.
--
-- A zero that means "unknown" is the same defect as the NULL admin predicate in
-- CLAUDE.md, pointed the other way: it does not fail, it quietly votes. Those
-- rows were averaged into `get_credit_calibration_hints` as genuine zeros, and
-- since the RPC only skips rows where the cost `is null`, every missing-usage
-- render dragged the suggested price DOWN — the one direction that cannot be
-- recovered from, because it recommends underpricing a thing we are already
-- underpaid for. Unknown is now NULL, so it abstains instead.
--
-- Note the reporting consequence, which is intended: admin cost totals will no
-- longer count such rows as free. They will be absent, which is the truth.

alter table public.ai_credit_ledger
  add column quality text,
  add column size text;

comment on column public.ai_credit_ledger.quality is
  'Provider quality tier for an image render (low/medium/high/auto). One model can bill an order of magnitude apart across tiers, so cost reporting must group by model AND quality.';
comment on column public.ai_credit_ledger.size is
  'Requested render size, e.g. 1024x1024. Output tokens scale with area, and `sizeMultiplier` already charges for it — this records what was actually asked for.';

create or replace view public.ai_generation_costs as
  select
    l.id,
    l.user_id,
    l.delta,
    l.reason,
    l.model,
    l.provider,
    l.input_tokens,
    l.input_image_tokens,
    l.output_tokens,
    l.image_count,
    l.is_byok,
    l.created_at,
    case
      -- Token-priced models (every image model we use). Quality-agnostic on
      -- purpose: the tier changes the token COUNT, not the rate.
      when p.image_output_cost_per_million_tokens is not null then
        case
          when coalesce(l.input_tokens, 0) + coalesce(l.input_image_tokens, 0) + coalesce(l.output_tokens, 0) > 0
            then round(
              coalesce(l.input_tokens, 0)::numeric / 1000000 * coalesce(p.input_cost_per_million_tokens, 0) * 100 +
              coalesce(l.input_image_tokens, 0)::numeric / 1000000 * coalesce(p.image_input_cost_per_million_tokens, 0) * 100 +
              coalesce(l.output_tokens, 0)::numeric / 1000000 * p.image_output_cost_per_million_tokens * 100, 4)
          -- The provider reported nothing. The call was not free; we do not know
          -- what it cost, and saying zero is worse than saying nothing.
          else null
        end
      when p.cost_per_image_usd is not null then
        round(coalesce(l.image_count, 1)::numeric * p.cost_per_image_usd * 100, 4)
      when p.input_cost_per_million_tokens is not null then
        case
          when coalesce(l.input_tokens, 0) + coalesce(l.output_tokens, 0) > 0
            then round(
              coalesce(l.input_tokens, 0)::numeric / 1000000 * p.input_cost_per_million_tokens * 100 +
              coalesce(l.output_tokens, 0)::numeric / 1000000 * coalesce(p.output_cost_per_million_tokens, 0) * 100, 4)
          else null
        end
      else null
    end as estimated_cost_usd_cents,
    -- Appended rather than slotted in beside `provider`: `create or replace
    -- view` treats a positional insert as renaming every column after it and
    -- refuses. Dropping the view to reorder would take its grants with it.
    l.quality,
    l.size
  from public.ai_credit_ledger l
  left join public.ai_model_pricing p on l.model = p.model
  where l.delta <= 0 and not l.pending;
