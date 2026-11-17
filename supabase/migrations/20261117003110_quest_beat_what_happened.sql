-- What happened at a beat (#1021).
--
-- A beat says what is planned: its read-aloud, how it plays, what the DM needs to know. Nothing on it said what
-- the table actually did there, so "what did we agree with the guildmaster" lived in a dramatised session note or
-- in nobody's memory. The maintainer, 16 Nov 2026: "writing data into quest beats is still useful also for table
-- DM's but needs a new field on the beat model". This is that field: plain prose, typed by a DM who runs the
-- table in person, never required.
--
-- DM-side only. The whole-row readers of quest_beats (get_quest_runtime_context, transfer_campaign_ownership) are
-- DM-gated, and the player projection (get_player_visible_quest_beats) names its columns, so the column reaches
-- no player. What a player may read of the story is the record (story_facts), which has its own visibility.

alter table public.quest_beats add column what_happened text;

comment on column public.quest_beats.what_happened is
  'What the table actually did at this beat, in the DM''s words. Rich text; null until someone writes it.';
