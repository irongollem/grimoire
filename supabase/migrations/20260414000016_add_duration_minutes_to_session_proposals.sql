-- Migration: add_duration_minutes_to_session_proposals
-- Adds a duration_minutes column to session_proposals, defaulting to 240 (4 hours)

alter table public.session_proposals
  add column duration_minutes integer not null default 240;
