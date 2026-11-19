-- Experience for a won fight (#1021 row 27, levels proposal step 2).
--
-- In a campaign that uses the Experience Points rule, ending a fight gives every character of the party in it a share
-- of the XP of the foes defeated (DMG "Experience Points"; the sum is `src/rules/fight/fightXp.ts`, run by the fight's
-- server, `encounter-command`). Adding XP is not a value that can be written twice: the server replays its end-of-fight
-- writes when a retry finds the fight already ended, so the award is given at most once per fight, here.

-- When this fight's XP was given; null until then, and cleared when the encounter is fought again.
alter table public.encounter_state
  add column xp_awarded_at timestamptz;

comment on column public.encounter_state.xp_awarded_at is
  'When the XP for this fight was given (#1021 row 27); public.award_fight_xp gives it only while this is null. Reopening the encounter clears it.';

-- Gives each listed character `p_each` XP and tells the table, once per ended fight. Only the fight's server calls it
-- (service role); it trusts its arguments as that server computed them, and writes only characters of the fight's own
-- campaign. Returns whether it gave anything, which is false for a fight already rewarded or not yet ended.
create or replace function public.award_fight_xp(
  p_encounter_id uuid,
  p_member_ids uuid[],
  p_each integer,
  p_total integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_owner uuid;
begin
  if p_each is null or p_each <= 0 or coalesce(cardinality(p_member_ids), 0) = 0 then
    return false;
  end if;

  update public.encounter_state
     set xp_awarded_at = now()
   where encounter_id = p_encounter_id and ended_at is not null and xp_awarded_at is null
  returning campaign_id into v_campaign;
  if v_campaign is null then
    return false;
  end if;

  update public.party_members
     set experience_points = experience_points + p_each
   where id = any (p_member_ids) and campaign_id = v_campaign;

  select user_id into v_owner from public.campaigns where id = v_campaign;
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
  values (
    v_campaign, v_owner, 'Grimoire',
    '⭐ The fight is worth ' || p_total || ' XP: ' || p_each || ' each.',
    'system'
  );
  return true;
end;
$$;

revoke execute on function public.award_fight_xp(uuid, uuid[], integer, integer) from public, anon, authenticated;
grant execute on function public.award_fight_xp(uuid, uuid[], integer, integer) to service_role;
