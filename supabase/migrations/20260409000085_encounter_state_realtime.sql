-- Enable realtime for encounter_state so player browsers receive live updates
-- (HP changes, turn advances, visibility changes, conditions, etc.)
alter publication supabase_realtime add table public.encounter_state;

-- REPLICA IDENTITY FULL ensures the full row is included in WAL payloads
-- for UPDATE events, which is required for filtered realtime subscriptions.
alter table public.encounter_state replica identity full;
