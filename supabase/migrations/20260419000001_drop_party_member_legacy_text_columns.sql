-- Migration: drop_party_member_legacy_text_columns
-- Drop race, background (text), and card_art_url from party_members — superseded by species_id, background_id FKs

alter table party_members
  drop column if exists race,
  drop column if exists background,
  drop column if exists card_art_url;
