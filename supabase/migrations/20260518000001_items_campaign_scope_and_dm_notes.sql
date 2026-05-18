-- Migration: items_campaign_scope_and_dm_notes
-- Add per-campaign scoping (NULL = general / all campaigns) and a DM-only notes
-- field to the items table. Vault listing filters by campaign in the app layer.

alter table items
  add column campaign_id uuid references campaigns(id) on delete set null,
  add column dm_notes text;

create index items_campaign_id_idx on items (campaign_id);
