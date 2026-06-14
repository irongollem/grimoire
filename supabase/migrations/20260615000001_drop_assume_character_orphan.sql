-- Migration: drop_assume_character_orphan
-- Remove the unused, dangerous 2-arg overload of assume_character.
--
-- assume_character(p_source_member_id uuid, p_target_user_id uuid) was a
-- SECURITY DEFINER function with NO caller validation, created via
-- `create or replace` and never revoked — so EXECUTE defaulted to PUBLIC
-- (anon + authenticated). It blindly cloned ANY party_members row into ANY
-- target user_id, bypassing RLS. That let any caller read every character
-- sheet in the database and write party_members rows owned by arbitrary users.
--
-- It is dead code: the app only ever calls the safe 1-arg overload
-- assume_character(p_original_id uuid) (see src/composables/useParty.ts),
-- which validates campaign membership + DM-managed/unclaimed status.

drop function if exists public.assume_character(uuid, uuid);
