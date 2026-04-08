-- Enable realtime for party_members so the encounter runner can receive
-- player-initiated HP changes (from the player character sheet) in real-time
-- and sync them into encounter_state.combatants_live.
alter publication supabase_realtime add table public.party_members;

-- REPLICA IDENTITY FULL is required so the full row (including all columns)
-- is available in UPDATE payloads for filtered realtime subscriptions.
alter table public.party_members replica identity full;
