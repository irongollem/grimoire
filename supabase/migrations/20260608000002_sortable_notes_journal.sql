-- Migration: sortable_notes_journal
-- Add a nullable manual-ordering column to notes and player_journal_entries so
-- DMs and players can drag-reorder their notes/journal entries (Manual sort).

alter table notes                  add column if not exists sort_order integer;
alter table player_journal_entries add column if not exists sort_order integer;
