-- Migration: calendar_event_player_visible
-- Add player_visible flag to calendar_events so DMs can choose which events players see

alter table calendar_events add column if not exists player_visible boolean not null default false;
