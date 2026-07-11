-- Migration: review_fixes_de_level_authz_and_item_claim_guards
-- Corrective fixes from a code review of the player-journey batch:
--
-- 1. apply_de_level authorized on `user_id = auth.uid()` only — the exact narrow
--    guard that 20260711000007 widened for apply_level_up. De-leveling an assumed
--    character (user_id = DM, owner_user_id = player) or a DM de-leveling a
--    player-created character raised 42501. Widen to owner/DM to match the RLS.
--
-- 2. claim_item_drop / grab_item_drop set is_identified = (item_rarity = 'mundane'),
--    which is SQL NULL when item_rarity is absent (legacy drops) — a NOT NULL
--    violation that aborts the whole (now-atomic) claim and makes the drop
--    permanently unclaimable. coalesce(..., false) so an unknown-rarity item lands
--    unidentified (the safe default).
--
-- 3. grab_item_drop lacked the `type = 'item_drop'` guard claim_item_drop has, so
--    it could be invoked against any message (and now insert a bad party_inventory
--    row). Add the guard.
--
-- 4. The folded item inserts delivered to ANY p_party_member_id (only gated by
--    is_campaign_member), unlike the hardened claim_currency_drop. Add the same
--    "member you control" gate so a claim can only deliver to the caller's own
--    character (stash / NPC paths unaffected).
--
-- 5. grab_item_drop's auto-stack merged by item_id/carried_by/location without
--    matching is_identified/is_container, so grabbing an unidentified magic item
--    onto an existing identified stack silently identified it. Match both flags.

-- ── apply_de_level: widen the ownership guard (text[] overload) ──────────────────
create or replace function apply_de_level(
  p_member_id     uuid,
  p_member_update jsonb,
  p_class_op      jsonb   default null,
  p_spell_ids     text[]  default '{}'::text[]
)
returns void
language plpgsql
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Mirror the party_members UPDATE RLS: creator, owner, or campaign DM. The old
  -- `user_id = v_uid` alone rejected assumed / DM-managed characters.
  if not exists (
    select 1 from party_members
    where id = p_member_id
      and (
        user_id = v_uid
        or owner_user_id = v_uid
        or (campaign_id is not null and private.is_campaign_dm(campaign_id))
      )
  ) then
    raise exception 'apply_de_level: not authorized for member %', p_member_id
      using errcode = '42501';
  end if;

  update party_members set
    level              = case when p_member_update ? 'level'              then (p_member_update->>'level')::int              else level end,
    proficiency_bonus  = case when p_member_update ? 'proficiency_bonus'  then (p_member_update->>'proficiency_bonus')::int  else proficiency_bonus end,
    max_hp             = case when p_member_update ? 'max_hp'             then (p_member_update->>'max_hp')::int             else max_hp end,
    current_hp         = case when p_member_update ? 'current_hp'         then (p_member_update->>'current_hp')::int         else current_hp end,
    hit_dice_remaining = case when p_member_update ? 'hit_dice_remaining' then (p_member_update->>'hit_dice_remaining')::int else hit_dice_remaining end,
    str                = case when p_member_update ? 'str'                then (p_member_update->>'str')::int                else str end,
    dex                = case when p_member_update ? 'dex'                then (p_member_update->>'dex')::int                else dex end,
    con                = case when p_member_update ? 'con'                then (p_member_update->>'con')::int                else con end,
    "int"              = case when p_member_update ? 'int'                then (p_member_update->>'int')::int                else "int" end,
    wis                = case when p_member_update ? 'wis'                then (p_member_update->>'wis')::int                else wis end,
    cha                = case when p_member_update ? 'cha'                then (p_member_update->>'cha')::int                else cha end,
    class              = case when p_member_update ? 'class'              then p_member_update->>'class'                     else class end,
    subclass           = case when p_member_update ? 'subclass'           then p_member_update->>'subclass'                  else subclass end,
    spell_slots        = case when p_member_update ? 'spell_slots'        then p_member_update->'spell_slots'                else spell_slots end,
    class_resources    = case when p_member_update ? 'class_resources'    then p_member_update->'class_resources'            else class_resources end,
    level_choices      = case when p_member_update ? 'level_choices'      then p_member_update->'level_choices'              else level_choices end
  where id = p_member_id;

  if array_length(p_spell_ids, 1) is not null then
    delete from character_spells
    where party_member_id = p_member_id and spell_id = any(p_spell_ids);
  end if;

  if p_class_op is not null then
    if p_class_op->>'op' = 'delete' then
      delete from character_classes
      where id = (p_class_op->>'id')::uuid and party_member_id = p_member_id;
      if p_class_op ? 'promote_id' then
        update character_classes set is_primary = true
        where id = (p_class_op->>'promote_id')::uuid and party_member_id = p_member_id;
      end if;
    elsif p_class_op->>'op' = 'update' then
      update character_classes set
        levels        = (p_class_op->>'levels')::int,
        subclass_name = case when coalesce((p_class_op->>'clear_subclass')::boolean, false)
                             then null else subclass_name end
      where id = (p_class_op->>'id')::uuid and party_member_id = p_member_id;
    end if;
  end if;
end;
$$;

-- ── claim_item_drop: coalesce is_identified + member-you-control gate ────────────
create or replace function public.claim_item_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid, p_npc_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'claimed_by_user_id' is not null then
    raise exception 'Already claimed';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'claimed_by_user_id',      auth.uid()::text,
    'claimed_by_name',         p_claimer_name,
    'claimed_party_member_id', p_party_member_id,
    'npc_id',                  p_npc_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  if p_npc_id is not null then
    insert into public.npc_inventory (campaign_id, user_id, npc_id, item_id, name, quantity, notes)
    values (
      v_msg.campaign_id, auth.uid(), p_npc_id,
      nullif(v_meta->>'item_id', '')::uuid,
      v_meta->>'item_name',
      coalesce((v_meta->>'quantity')::int, 1),
      null
    );
  else
    -- Only deliver to the caller's OWN character (owned or linked); a null member
    -- is a stash claim (any campaign member may stash).
    if p_party_member_id is not null then
      if not exists (
        select 1 from public.party_members pm
        where pm.id = p_party_member_id
          and pm.campaign_id = v_msg.campaign_id
          and (
            pm.owner_user_id = auth.uid()
            or exists (
              select 1 from public.campaign_members cm
              where cm.campaign_id = v_msg.campaign_id
                and cm.user_id = auth.uid()
                and cm.party_member_id = p_party_member_id
            )
          )
      ) then
        raise exception 'Cannot claim an item to a member you do not control';
      end if;
    end if;

    insert into public.party_inventory
      (campaign_id, user_id, item_id, name, quantity, carried_by, location,
       is_container, is_identified)
    values (
      v_msg.campaign_id, auth.uid(),
      nullif(v_meta->>'item_id', '')::uuid,
      v_meta->>'item_name',
      coalesce((v_meta->>'quantity')::int, 1),
      p_party_member_id, 'backpack',
      coalesce((v_meta->>'is_container')::boolean, false),
      coalesce((v_meta->>'item_rarity') = 'mundane', false)
    );
  end if;

  return v_meta;
end;
$function$;

-- ── grab_item_drop: type guard + coalesce + gate + stack-flag match ─────────────
create or replace function public.grab_item_drop(p_message_id uuid, p_qty integer, p_claimer_user_id uuid, p_claimer_name text, p_party_member_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_meta        jsonb;
  v_campaign_id uuid;
  v_qty_orig    int;
  v_qty_rem     int;
  v_to_grab     int;
  v_new_claim   jsonb;
  v_new_meta    jsonb;
  v_item_id     uuid;
  v_identified  boolean;
  v_container   boolean;
  v_existing    uuid;
begin
  select metadata, campaign_id into v_meta, v_campaign_id
  from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_meta is null then raise exception 'message not found'; end if;
  if not private.is_campaign_member(v_campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  -- Only deliver to the caller's own character (null = stash).
  if p_party_member_id is not null then
    if not exists (
      select 1 from public.party_members pm
      where pm.id = p_party_member_id
        and pm.campaign_id = v_campaign_id
        and (
          pm.owner_user_id = auth.uid()
          or exists (
            select 1 from public.campaign_members cm
            where cm.campaign_id = v_campaign_id
              and cm.user_id = auth.uid()
              and cm.party_member_id = p_party_member_id
          )
        )
    ) then
      raise exception 'Cannot grab an item to a member you do not control';
    end if;
  end if;

  v_qty_orig := coalesce((v_meta->>'quantity')::int, 1);
  v_qty_rem  := coalesce((v_meta->>'quantity_remaining')::int, v_qty_orig);

  if v_qty_rem <= 0 then raise exception 'stack exhausted'; end if;

  if p_qty < 0 or p_qty >= v_qty_rem then
    v_to_grab := v_qty_rem;
  else
    v_to_grab := p_qty;
  end if;

  v_new_claim := jsonb_build_object(
    'user_id',          auth.uid(),
    'name',             p_claimer_name,
    'party_member_id',  p_party_member_id,
    'qty',              v_to_grab,
    'at',               to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_new_meta := v_meta
    || jsonb_build_object('quantity_remaining', v_qty_rem - v_to_grab)
    || jsonb_build_object(
         'claims',
         coalesce(v_meta->'claims', '[]'::jsonb) || jsonb_build_array(v_new_claim)
       );

  update public.campaign_messages set metadata = v_new_meta where id = p_message_id;

  v_item_id    := nullif(v_meta->>'item_id', '')::uuid;
  v_identified := coalesce((v_meta->>'item_rarity') = 'mundane', false);
  v_container  := coalesce((v_meta->>'is_container')::boolean, false);

  -- Auto-stack only onto a row that matches on the identification + container
  -- flags too — never merge an unidentified item into an identified stack.
  if v_item_id is not null then
    select id into v_existing from public.party_inventory
    where campaign_id = v_campaign_id
      and item_id = v_item_id
      and carried_by is not distinct from p_party_member_id
      and container_id is null
      and location in ('backpack', 'belt')
      and not is_ruined
      and not is_equipped
      and is_identified = v_identified
      and is_container = v_container
    limit 1;
  end if;

  if v_existing is not null then
    update public.party_inventory
    set quantity = quantity + v_to_grab
    where id = v_existing;
  else
    insert into public.party_inventory
      (campaign_id, user_id, item_id, name, quantity, carried_by, location,
       is_container, is_identified)
    values (
      v_campaign_id, auth.uid(), v_item_id,
      v_meta->>'item_name', v_to_grab, p_party_member_id, 'backpack',
      v_container, v_identified
    );
  end if;

  return jsonb_build_object(
    'qty_grabbed',        v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$function$;
