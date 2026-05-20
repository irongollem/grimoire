-- Migration: campaign_specific_spells
-- Adds campaign_id to spells (marks a spell as exclusive to one campaign).
-- Mirrors campaign_specific_species (20260513000001): null = universal/library
-- spell available to all of the DM's campaigns; set = exclusive to that campaign.

alter table spells
  add column campaign_id uuid references campaigns(id) on delete set null;
