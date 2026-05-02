-- Migration: party_group_portrait
-- Add group_portrait_url to campaigns for storing the party group shot

alter table campaigns add column if not exists group_portrait_url text;
