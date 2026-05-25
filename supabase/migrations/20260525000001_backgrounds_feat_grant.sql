-- Migration: backgrounds_feat_grant
-- Add feat_grant_name and feat_grant_description columns to backgrounds (2024 PHB feat-at-1st-level)

alter table backgrounds
  add column if not exists feat_grant_name        text,
  add column if not exists feat_grant_description text;
