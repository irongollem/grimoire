-- Migration: sound_artist
-- Add artist column to sounds table for Media Session / CarPlay display

alter table sounds add column artist text;
