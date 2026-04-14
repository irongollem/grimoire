-- Migration: disabled_class_names
-- Add disabled_class_names column to campaigns for per-campaign class filtering

alter table campaigns add column if not exists disabled_class_names text[] not null default '{}';
