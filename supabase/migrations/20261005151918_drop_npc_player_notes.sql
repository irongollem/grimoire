-- Migration: drop_npc_player_notes
--
-- npc_player_notes is the third per-entity player-notes table that the generic
-- entity_notes superseded, and the one 20260730000006 missed when it moved the
-- other two (companion_player_notes, party_member_player_notes) and dropped
-- them. PlayerNotesWidget on an NPC reads and writes entity_notes with
-- entity_type = 'npc'; the only code that read this table was
-- useNpcPlayerNotes / useUpsertNpcPlayerNotes in useNpcs.ts, which nothing
-- called, and which go with it.
--
-- Nothing to move: production held 8 rows (5 Oct 2026), and none contained
-- any text. The one that looked non-blank was an empty Tiptap document, a
-- single paragraph with no content. Dropped on the maintainer's go-ahead.
--
-- Nothing else depends on the table: no function body names it, no view reads
-- it, it is in no publication; its updated_at trigger goes with it. Its
-- demo-copy registry row goes too, since the demo test holds the registry to
-- tables that exist.

delete from private.demo_campaign_tables where table_name = 'npc_player_notes';

drop table npc_player_notes;
