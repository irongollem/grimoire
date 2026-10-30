-- The DM moves any token on the battle map through the same atomic write a
-- player uses for their own (#1120).
--
-- Until now the DM's map pushed the whole roster (`combatants_live`) through
-- the runner's push, which since #532 lets the position already in the row win
-- over the one being pushed, so that a runner push cannot revert a token a
-- player moved. That rule also swallowed every move the DM made once a token
-- had been placed: the DM saw the token move on their own screen and the
-- players never did. And a second map window, which follows the runner rather
-- than owning the run, must not push the roster at all. So every position now
-- goes through this function, which changes one combatant's `position` in place
-- and nothing else.
--
-- A campaign's DM (`private.is_campaign_dm`, an `exists`, so never NULL) may
-- move any combatant; anyone else must be a member and may move only the token
-- of the character they play, as before. The `coalesce` keeps an empty roster
-- an empty array: `jsonb_agg` over no rows is NULL, which wrote NULL into a
-- not-yet-populated row.

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
begin
  select campaign_id into v_campaign_id
    from encounter_state
   where id = p_encounter_state_id;

  if v_campaign_id is null then
    raise exception 'encounter_state not found';
  end if;

  if not private.is_campaign_dm(v_campaign_id) then
    select party_member_id into v_party_member_id
      from campaign_members
     where campaign_id = v_campaign_id and user_id = auth.uid();

    if v_party_member_id is null then
      raise exception 'not a member of this campaign';
    end if;

    if p_instance_id <> 'p-' || v_party_member_id::text then
      raise exception 'can only update own combatant''s position';
    end if;
  end if;

  update encounter_state
     set combatants_live = coalesce((
       select jsonb_agg(
         case
           when c->>'instance_id' = p_instance_id
             then jsonb_set(c, '{position}', p_position, true)
           else c
         end
       )
       from jsonb_array_elements(combatants_live) c
     ), '[]'::jsonb)
   where id = p_encounter_state_id;
end;
$$;
