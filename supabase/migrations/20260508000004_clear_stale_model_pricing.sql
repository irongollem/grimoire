-- Migration: clear_stale_model_pricing
-- Remove all seeded ai_model_pricing rows — admin re-enters via UI with correct model IDs from provider list API

delete from ai_model_pricing;
