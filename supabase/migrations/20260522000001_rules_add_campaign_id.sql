-- Migration: rules_add_campaign_id
-- Add campaign_id to rules table so custom rules are scoped per campaign, not per user

alter table rules
  add column campaign_id uuid references campaigns(id) on delete cascade;

create index rules_campaign_id_idx on rules (campaign_id);
