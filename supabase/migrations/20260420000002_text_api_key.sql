-- Migration: text_api_key
-- Add separate text_api_key column to campaigns for text-generation provider (distinct from image key)

alter table campaigns
  add column text_api_key text;
