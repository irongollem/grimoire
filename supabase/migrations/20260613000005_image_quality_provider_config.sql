-- Migration: image_quality_provider_config
-- Add a per-provider image quality/resolution lever to provider_config so the
-- admin can trade visual fidelity against cost (and price accordingly).
--
-- Vocabulary is provider-specific and interpreted in _shared/imageGen.ts:
--   OpenAI (gpt-image):  'low' | 'medium' | 'high' | 'auto'  → sent as `quality`
--   Gemini (Nano Banana): '1K' | '2K' | '4K'                 → sent as imageConfig.imageSize
--   fal.ai:               n/a (flat-priced; resolution comes from the size string)
--
-- NOTE: higher quality raises the *real* token-based cost (ai_generation_costs
-- view) but NOT the flat credits charged to users — bump image_multiplier to
-- protect margin when raising quality.

alter table provider_config add column image_quality text;

-- Seed comparable-quality defaults so OpenAI and Gemini are a fair fight.
-- 'auto' already trends near 'high' for gpt-image; 'high' just makes it explicit.
update provider_config set image_quality = 'high' where provider = 'openai';
update provider_config set image_quality = '2K'   where provider = 'gemini';
-- anthropic (no image) and falai (flat-priced) keep image_quality = null.
