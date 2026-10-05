-- party_members.assumed_from_id (20261005084734) points at the DM's original a
-- player's copy was made from. Both rows are campaign-scoped, and every foreign
-- key between campaign-scoped tables is checked by zz_same_campaign_refs
-- (same_campaign_refs.test.sql holds that), so it joins the trigger.
--
-- A copy and its original share a campaign when the copy is made. The link only
-- means something there: it stops a second tap minting a second copy. A copy
-- that leaves the campaign (detach) or is cloned into the pool no longer needs
-- it, and keeping it would point across campaigns and make the trigger refuse
-- the move, the same trap the deity fell into (20261005013855). So detach and
-- clone clear it. Both functions are otherwise their current definitions.

drop trigger if exists zz_same_campaign_refs on public.party_members;
create trigger zz_same_campaign_refs
  before insert or update of current_location_id, deity_id, assumed_from_id, campaign_id on public.party_members
  for each row execute function private.enforce_same_campaign_refs(
    'current_location_id', 'locations', 'owned',
    'deity_id', 'deities', 'owned',
    'assumed_from_id', 'party_members', 'owned'
  );

CREATE OR REPLACE FUNCTION public.detach_party_member_from_campaign(p_party_member_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_pm public.party_members%rowtype;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found then
    raise exception 'Character not found';
  end if;

  if v_pm.campaign_id is null then
    return; -- already detached
  end if;

  -- Total predicate (see attach): the owner term is NULL for unclaimed rows,
  -- and NULL propagates through the ORs unless a later term is true.
  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null and v_pm.user_id = v_uid)
      or private.is_campaign_dm(v_pm.campaign_id),
    false
  ) then
    raise exception 'Only the character''s owner or the campaign DM can detach it';
  end if;

  update public.campaign_members
     set party_member_id = null
   where party_member_id = p_party_member_id;

  perform set_config('grimoire.pm_campaign_transition', 'on', true);
  update public.party_members
     set campaign_id = null,
         assumed_from_id = null,
         current_initiative = null,
         current_location_id = null
   where id = p_party_member_id;
  perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.clone_party_member(p_party_member_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_pm public.party_members%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found then
    raise exception 'Character not found';
  end if;

  -- Total predicate (see attach), and deliberately narrower than "owner or
  -- creator": once a player has claimed a character, nobody else — the
  -- creating DM included — may copy their sheet into another pool.
  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null and v_pm.user_id = v_uid),
    false
  ) then
    raise exception 'Only the character''s owner can clone it';
  end if;

  -- Into the caller's pool, unattached. Campaign-bound state does not travel.
  return private.copy_party_member(p_party_member_id, jsonb_build_object(
    'user_id', v_uid,
    'owner_user_id', v_uid,
    'is_dm_managed', false,
    'campaign_id', null,
    'name', v_pm.name || ' (copy)',
    'current_initiative', null,
    'current_location_id', null,
    'concentration', null,
    -- Every deity belongs to a campaign, and the copy belongs to none.
    'deity_id', null,
    -- A copy in the pool was not assumed from anything in its (absent) campaign.
    'assumed_from_id', null,
    'wildshape_state', null,
    'sort_order', 0
  ));
end;
$function$;
