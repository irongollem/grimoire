-- Migration: campaign_specific_species
-- Adds campaign_id to species (marks a species as exclusive to one campaign) and disabled_species_ids to campaigns (per-campaign species blocklist)

alter table species
  add column campaign_id uuid references campaigns(id) on delete set null;

alter table campaigns
  add column disabled_species_ids uuid[] not null default '{}';
