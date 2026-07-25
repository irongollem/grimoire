-- Migration: locations_era_bounds
-- Add optional era_start/era_end year bounds to locations, so out-of-era locations can be greyed out or hidden relative to campaigns.current_year

alter table public.locations
  add column if not exists era_start integer,
  add column if not exists era_end integer;
