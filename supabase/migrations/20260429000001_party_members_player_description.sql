-- Migration: party_members_player_description
-- Add nullable player_description column so players can describe themselves to others

alter table party_members add column if not exists player_description text;
