-- Migration: campaign_ai_enabled
-- Per-campaign toggle to hide all AI generation UI

alter table campaigns
  add column if not exists ai_enabled boolean not null default true;
