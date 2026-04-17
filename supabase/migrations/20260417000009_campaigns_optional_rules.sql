-- Migration: campaigns_optional_rules
-- Adds a jsonb bag for optional-rules toggles on a campaign. First inhabitant:
-- `ignore_multiclass_prereqs` for DMs running table house rules that bypass
-- the PHB ability-score prereqs for multiclassing. Shape:
--
--   {
--     "ignore_multiclass_prereqs": true
--   }

alter table campaigns
  add column if not exists optional_rules jsonb not null default '{}'::jsonb;
