-- NPC sharing moved to per-party-member visibility and the player-safe NPC
-- projection. This unused legacy RPC referenced two columns that no longer
-- exist (`shared_with_players` and `party_notes`) and could never execute.
drop function if exists public.update_npc_party_notes(uuid, text);
