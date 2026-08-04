-- Migration: ai_provenance_columns
-- Art 50(2) substrate (#606): nullable ai_provenance jsonb on every content table that receives generator output

-- Intended table list (context/compliance/provenance-architecture.md §2) vs. actual schema:
-- npcs, monsters, items, spells, factions, locations, quests, traps, roll_tables,
-- encounters, notes all exist under those exact names (confirmed against
-- supabase/migrations/20260426000099_initial_schema_squashed.sql).
-- "puzzles" does not exist under that name -- the table is `puzzle_rooms`
-- (src/types/puzzle.types.ts: PuzzleRoom); the column below is added there instead.
-- The downtime "outcome" table (the one holding generated vignette/title text,
-- as opposed to downtime_grants/downtime_draws/downtime_deck_backs which hold no
-- generated text) is `downtime_outcomes` (supabase/migrations/20260710000001).
-- All 13 intended tables are accounted for; none were skipped.

alter table npcs add column if not exists ai_provenance jsonb;
alter table monsters add column if not exists ai_provenance jsonb;
alter table items add column if not exists ai_provenance jsonb;
alter table spells add column if not exists ai_provenance jsonb;
alter table factions add column if not exists ai_provenance jsonb;
alter table locations add column if not exists ai_provenance jsonb;
alter table quests add column if not exists ai_provenance jsonb;
alter table traps add column if not exists ai_provenance jsonb;
alter table puzzle_rooms add column if not exists ai_provenance jsonb;
alter table roll_tables add column if not exists ai_provenance jsonb;
alter table encounters add column if not exists ai_provenance jsonb;
alter table notes add column if not exists ai_provenance jsonb;
alter table downtime_outcomes add column if not exists ai_provenance jsonb;

comment on column npcs.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column monsters.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column items.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column spells.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column factions.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column locations.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column quests.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column traps.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column puzzle_rooms.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column roll_tables.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column encounters.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column notes.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
comment on column downtime_outcomes.ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when this row (or its image) came from an AI generator. Null = no known AI involvement -- not backfilled for pre-existing rows (unknowable; see #606).';
