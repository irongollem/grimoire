-- Migration: campaign_rules_config
-- Add an optional per-campaign config payload to campaign_rules so built-in
-- optional rules can carry tunable parameters (e.g. the turn timer's duration).
-- Existing RLS (is_campaign_dm on insert/update) already governs writes; adding
-- a nullable column introduces no new function or policy, so no advisor rerun.

alter table public.campaign_rules
  add column if not exists config jsonb;
