-- Migration: vtt_update_combatant_position_rpc
-- RLS-safe RPC for players to update their own token's position on the
-- battle map without exposing direct write access to encounter_state.
--
-- The function:
--   1. Validates the caller is a campaign_member of the encounter's campaign.
--   2. Resolves the caller's linked party_member_id from campaign_members.
--   3. Computes the expected instance_id ("p-{party_member_id}") and rejects
--      anything else — players can only move their own combatant.
--   4. Updates only the matching combatant's `position` field within the
--      combatants_live jsonb array; other fields and other combatants are
--      untouched.

create or replace function public.update_combatant_position(
  p_encounter_state_id uuid,
  p_instance_id text,
  p_position jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_party_member_id uuid;
  v_expected_instance_id text;
begin
  select campaign_id into v_campaign_id
    from encounter_state
   where id = p_encounter_state_id;

  if v_campaign_id is null then
    raise exception 'encounter_state not found';
  end if;

  select party_member_id into v_party_member_id
    from campaign_members
   where campaign_id = v_campaign_id and user_id = auth.uid();

  if v_party_member_id is null then
    raise exception 'not a member of this campaign';
  end if;

  v_expected_instance_id := 'p-' || v_party_member_id::text;
  if p_instance_id <> v_expected_instance_id then
    raise exception 'can only update own combatant''s position';
  end if;

  update encounter_state
     set combatants_live = (
       select jsonb_agg(
         case
           when c->>'instance_id' = p_instance_id
             then jsonb_set(c, '{position}', p_position, true)
           else c
         end
       )
       from jsonb_array_elements(combatants_live) c
     )
   where id = p_encounter_state_id;
end;
$$;

grant execute on function public.update_combatant_position(uuid, text, jsonb) to authenticated;
