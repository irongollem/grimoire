-- A token stays where it is while the person at the AI table decides a Reaction (#1021, review of PR #1261).
--
-- While `encounter_state.pending_reaction` is set, the paused creature turn is replayed from the fight as it stood
-- (20261123234844): `encounter-command` refuses every other command until it is answered. A token move did not go
-- through that path: `update_combatant_position` wrote `combatants_live` directly, so a drag during the wait changed
-- the fight the answer replays, and the replayed turn could come out other than the one the player was asked about.
-- The RPC now refuses while a Reaction waits, as the command path does. Its body is otherwise unchanged
-- (20261030104856); `create or replace` keeps its grants.

create or replace function public.update_combatant_position(p_encounter_state_id uuid, p_instance_id text, p_position jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_campaign_id uuid;
  v_party_member_id uuid;
  v_waiting boolean;
begin
  select campaign_id, pending_reaction is not null into v_campaign_id, v_waiting
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

  -- After the caller is authorized, so a stranger learns nothing about the fight from the message.
  if v_waiting then
    raise exception 'The fight is waiting for a reaction.' using errcode = 'P0001';
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
$function$;
