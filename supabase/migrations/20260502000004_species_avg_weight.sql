-- Migration: species_avg_weight
-- Add avg_weight to species table alongside avg_height

alter table species add column if not exists avg_weight text;
