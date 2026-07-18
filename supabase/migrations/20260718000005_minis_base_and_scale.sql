-- Migration: minis_base_and_scale
-- Phase 4.5 (#542): which curated 25mm base a mini is composed onto, and its
-- real-world scale. Base registry lives in code (_shared/mini-bases.ts) — adding
-- a base must be data, never a migration — so base_id is free text here.

alter table minis add column base_id text;
alter table minis add column scale_mm integer not null default 32 check (scale_mm in (28, 32));
