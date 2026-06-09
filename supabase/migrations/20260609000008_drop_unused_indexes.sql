-- Migration: drop_unused_indexes
-- Performance advisor lint 0005_unused_index flagged 14 never-scanned indexes.
-- 10 of those, despite zero scans, sit on foreign-key columns (notes.user_id,
-- entity_notes.campaign_id, roll_tables.campaign_id, etc.) — they back FK
-- integrity checks and cascade deletes, so they are KEPT (dropping them would
-- re-trigger lint 0001 and reintroduce the cost migration 20260609000007 just
-- removed). Only the 4 indexes that cover no foreign key are dropped here.

drop index if exists public.hall_of_heroes_setting_idx;   -- on hall_of_heroes(setting), no FK
drop index if exists public.notes_tags_idx;               -- GIN on notes(tags), no FK
drop index if exists public.session_proposals_date_idx;   -- on session_proposals(proposed_date), no FK
drop index if exists public.srd_rules_parent_slug_idx;    -- on srd_rules(parent_slug), no FK
