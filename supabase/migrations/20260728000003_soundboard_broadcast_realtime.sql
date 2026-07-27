-- Migration: soundboard_broadcast_realtime
-- Publish soundboard_broadcast so players actually receive the DM's changes.

-- A new table is NOT added to the realtime publication automatically. Without
-- this the player receiver subscribes successfully, sees the row it loaded on
-- mount, and then never hears about a track change again — a failure that looks
-- like nothing at all rather than like an error.
alter publication supabase_realtime add table public.soundboard_broadcast;

-- REPLICA IDENTITY FULL so an UPDATE payload carries every column, not just the
-- primary key. The receiver reads the whole row out of `payload.new`.
alter table public.soundboard_broadcast replica identity full;
