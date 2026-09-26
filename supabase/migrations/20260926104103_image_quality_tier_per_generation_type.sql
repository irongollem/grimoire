-- Image quality per generation type, set beside its price in Admin -> Pricing.
--
-- Until now image quality was one knob per provider (provider_config.image_quality:
-- "high" for OpenAI, "2K" for Gemini), and the only exception, tile packs at
-- "low", was pinned in code (tile-pack-generator's QUALITY constant). A portrait,
-- a map style and a tile are different jobs: a map played fullscreen on a table
-- TV earns "high", a 64px tile does not.
--
-- The tier is provider-neutral (low / standard / high) so a campaign switching
-- provider keeps the same intent; `_shared/imageQuality.ts` maps it to each
-- provider's own value (OpenAI low/medium/high, Gemini 1K/2K/4K). NULL means
-- "the provider's default" (provider_config.image_quality), which is what every
-- type got before this column existed, so nothing changes until an admin sets one.
--
-- Written by the existing admin update policy on this table
-- (`private.is_app_admin()`, 20260809222131); read by edge functions through
-- the service role. No new function, so the advisor baseline does not move.

alter table public.ai_generation_credit_costs
  add column image_quality_tier text
    constraint ai_generation_credit_costs_image_quality_tier_check
    check (image_quality_tier in ('low', 'standard', 'high'));

comment on column public.ai_generation_credit_costs.image_quality_tier is
  'Provider-neutral image quality for this generation type (low/standard/high); null = provider_config.image_quality. Mapped per provider in supabase/functions/_shared/imageQuality.ts.';

-- Tile packs keep the "low" they had in code: the generator makes up to four
-- attempts per tile and a tile renders at a few dozen pixels, so low is the
-- quality the tile credit cost was calibrated against.
update public.ai_generation_credit_costs
   set image_quality_tier = 'low'
 where generation_type = 'tile_pack_generation';
