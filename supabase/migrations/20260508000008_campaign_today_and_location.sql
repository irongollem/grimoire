-- Migration: campaign_today_and_location
-- Add current_month, current_day, and current_location_id to campaigns for dashboard quick-edit

alter table campaigns
  add column if not exists current_month integer not null default 1,
  add column if not exists current_day   integer not null default 1,
  add column if not exists current_location_id uuid references locations(id) on delete set null;
