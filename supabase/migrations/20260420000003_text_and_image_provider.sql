-- Migration: text_and_image_provider
-- Add per-provider API key columns + provider selectors; replace generic text_api_key with named keys

alter table campaigns
  drop column if exists text_api_key,
  add column text_provider     text,
  add column image_provider    text,
  add column anthropic_api_key text,
  add column gemini_api_key    text,
  add column falai_api_key     text;
