-- Epic #973 item 16: assuming a DM-offered character twice made a duplicate.
-- The original stays offered (it is the DM's template, one copy per player is
-- the intent) and nothing recorded which original a copy came from, so a second
-- tap, or a double tap on a slow phone, minted another copy and re-pointed the
-- player at it.
--
-- party_members.assumed_from_id records the origin; set null on delete so an
-- original the DM removes never takes the player's own copy with it.
-- assume_character now returns the caller's existing copy (and makes it their
-- active character again) instead of refusing: the second tap leaves the player
-- exactly where the first one did, with no error to read mid-game. A different
-- player still gets their own copy. Authorization stays first and unchanged.

alter table public.party_members
  add column if not exists assumed_from_id uuid references public.party_members(id) on delete set null;

create index if not exists party_members_assumed_from_idx
  on public.party_members (assumed_from_id) where assumed_from_id is not null;

create or replace function public.assume_character(p_original_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_caller        uuid := auth.uid();
  v_original      party_members%rowtype;
  v_membership    campaign_members%rowtype;
  v_new_id        uuid;
  v_item          record;
  v_new_item_id   uuid;
  v_item_map      jsonb := '{}'::jsonb;
begin
  -- Load the original character
  select * into v_original from party_members where id = p_original_id;
  if not found then
    raise exception 'Character not found';
  end if;

  -- Verify it is an unclaimed DM-managed character
  if not (v_original.is_dm_managed and v_original.owner_user_id is null) then
    raise exception 'Character is not available for assumption';
  end if;

  -- Verify the caller is a player in the same campaign
  select * into v_membership
  from campaign_members
  where campaign_id = v_original.campaign_id
    and user_id = v_caller
    and role = 'player'
  limit 1;
  if not found then
    raise exception 'Not a campaign player';
  end if;

  -- Already assumed by this player: hand back their copy, do not make another.
  select id into v_new_id
  from party_members
  where assumed_from_id = p_original_id
    and owner_user_id = v_caller
    and campaign_id = v_original.campaign_id
  order by created_at
  limit 1;
  if found then
    update campaign_members set party_member_id = v_new_id where id = v_membership.id;
    return v_new_id;
  end if;

  -- The whole sheet, owned by the player and no longer an offer.
  v_new_id := private.copy_party_member(p_original_id, jsonb_build_object(
    'owner_user_id', v_caller,
    'is_dm_managed', false,
    'assumed_from_id', p_original_id
  ));

  -- What it carries, with containers re-pointed at the copies. A container the
  -- original does not itself carry is not copied, so its contents come loose.
  for v_item in
    select * from party_inventory where carried_by = p_original_id
  loop
    v_new_item_id := gen_random_uuid();
    insert into party_inventory
    select (jsonb_populate_record(null::party_inventory,
              to_jsonb(v_item) || jsonb_build_object(
                'id', v_new_item_id, 'carried_by', v_new_id,
                'container_id', null, 'updated_at', now()))).*;
    v_item_map := v_item_map || jsonb_build_object(v_item.id::text, v_new_item_id::text);
  end loop;

  update party_inventory copy
     set container_id = (v_item_map ->> source.container_id::text)::uuid
    from party_inventory source
   where source.carried_by = p_original_id
     and source.container_id is not null
     and v_item_map ? source.container_id::text
     and copy.id = (v_item_map ->> source.id::text)::uuid;

  -- Set the new character as the player's active character
  update campaign_members
  set party_member_id = v_new_id
  where id = v_membership.id;

  return v_new_id;
end;
$function$;
