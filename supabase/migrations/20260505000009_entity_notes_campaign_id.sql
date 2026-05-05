-- Migration: entity_notes_campaign_id
-- Add campaign_id to entity_notes so notes can be scoped per campaign (required for backup export/import)

alter table entity_notes
  add column if not exists campaign_id uuid references campaigns on delete cascade;

create index if not exists entity_notes_campaign_id_idx on entity_notes (campaign_id);
