-- Migration: add_bundle_items_to_items
-- Adds bundle_items jsonb column to items for pack/bundle item type support
-- Each entry: { "name": string, "quantity"?: number }

alter table items
  add column if not exists bundle_items jsonb default null;
