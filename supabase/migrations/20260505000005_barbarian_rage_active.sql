-- Migration: barbarian_rage_active
-- Add rage_active boolean to track whether a Barbarian is currently raging

alter table party_members
  add column if not exists rage_active boolean not null default false;
