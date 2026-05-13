-- Migration: freesound_attribution
-- Add attribution columns to sounds so Freesound-sourced SFX can credit the original creator + license.

alter table sounds
  add column attribution text,
  add column attribution_url text;
