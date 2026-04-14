-- Migration: add_cantrips_known_to_classes
-- Add cantrips_known integer[] column to custom_classes and system_classes

alter table custom_classes
  add column if not exists cantrips_known integer[] default null;

alter table system_classes
  add column if not exists cantrips_known integer[] default null;
