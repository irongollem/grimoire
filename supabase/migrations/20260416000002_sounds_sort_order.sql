-- Migration: sounds_sort_order
-- Add sort_order column to sounds table to support drag-and-drop card ordering

alter table sounds add column sort_order integer not null default 0;
