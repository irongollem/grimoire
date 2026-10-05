-- A character's deity belongs to the campaign it was chosen in
-- (deities.campaign_id is not null), and zz_same_campaign_refs refuses any
-- party_members row that points at a deity outside its own campaign.
--
-- clone_party_member copied deity_id into the caller's pool, so cloning any
-- character with a DM's deity failed with "party_members.deity_id must point
-- at a row in the same campaign" (found in a player-portal audit: the player
-- saw only "Failed to clone the character"). attach had the same trap one
-- step later: a character detached from one table, still carrying that
-- table's deity, could not be attached to another.
--
-- Detach is left alone on purpose, so a character that leaves and rejoins the
-- same table keeps its deity. Both functions are otherwise unchanged from
-- their current definitions (verified identical in production).

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
    'wildshape_state', null,
    'sort_order', 0
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION public.attach_party_member_to_campaign(p_party_member_id uuid, p_campaign_id uuid, p_set_active boolean DEFAULT true)
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

  -- The owner attaches their character; a DM may attach an unclaimed
  -- character they created (DM-managed roster work). coalesce makes the
  -- predicate total (CLAUDE.md SECURITY DEFINER item 3): for an unclaimed row
  -- owner_user_id is NULL, `NULL = v_uid` is NULL, `NULL or false` is NULL,
  -- and `if not NULL` never raises — the exact case an attacker is in.
  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null and v_pm.user_id = v_uid),
    false
  ) then
    raise exception 'Only the character''s owner can attach it';
  end if;

  if v_pm.campaign_id is not null then
    raise exception 'Character is already in a campaign. Detach it first.';
  end if;

  if not private.is_campaign_member(p_campaign_id) then
    raise exception 'You are not a member of that campaign';
  end if;

  -- After the membership check, so a stranger learns nothing about a table's
  -- edition from the refusal.
  perform private.assert_ruleset_admissible(v_pm.ruleset, p_campaign_id);

  -- A player bringing a character they made, which nobody owns yet, is its
  -- owner from here on (the claim rule of 20261003105146: the member made the
  -- character themselves). It has to be settled before the review below, which
  -- treats a character nobody owns as having no content of its own. A DM
  -- attaching a roster character to their own table does not take it here; if
  -- the attach also fills the DM's own seat, the claim trigger makes them its
  -- owner, as it does for any member seated on a character they made.
  if v_pm.owner_user_id is null and not private.is_campaign_dm(p_campaign_id) then
    update public.party_members set owner_user_id = v_uid where id = p_party_member_id;
  end if;

  perform set_config('grimoire.pm_campaign_transition', 'on', true);
  -- A detached character keeps its deity, so rejoining the same table keeps
  -- it too. Joining another table drops it: that deity is the old campaign's,
  -- and zz_same_campaign_refs refuses the move while it is still set.
  update public.party_members
     set campaign_id = p_campaign_id,
         deity_id = case
           when exists (select 1 from public.deities d
                         where d.id = v_pm.deity_id and d.campaign_id = p_campaign_id)
           then v_pm.deity_id
         end
   where id = p_party_member_id;

  -- Benched while anything waits on the DM (#943 wave 4).
  if p_set_active and not exists (
    select 1 from public.character_content_reviews r
     where r.party_member_id = p_party_member_id and r.status = 'pending'
  ) then
    update public.campaign_members
       set party_member_id = p_party_member_id
     where campaign_id = p_campaign_id
       and user_id = v_uid
       and party_member_id is null;
  end if;
  perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
end;
$function$;
