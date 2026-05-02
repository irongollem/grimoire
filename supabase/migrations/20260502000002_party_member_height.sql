-- Migration: party_member_height
-- Add height field to party_members for use in AI image generation prompts

alter table party_members add column if not exists height text;
