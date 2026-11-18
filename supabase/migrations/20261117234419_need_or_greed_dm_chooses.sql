-- Need or Greed: the DM chooses, per drop, whether it rolls.
--
-- 20261030230842 made every item the DM dropped in chat roll while the rule was on.
-- The maintainer's direction (13 Nov 2026): a DM handing loot to one character should
-- not see it rolled away, and every drop should ask. The client now asks the DM at each
-- drop: Roll Need or Greed, Free to grab, or Give to a named character. This migration
-- gives the server the three answers.
--
-- * `metadata.roll_mode` ('roll' | 'free' | 'give') on an item drop. 'free' and 'give'
--   never roll; 'roll' or no key keeps the old behaviour, so a drop from anywhere that
--   does not ask (a server function, an old client) still rolls as before.
-- * A DM may claim a drop for any character in the campaign. Until now a claim could
--   only deliver to the caller's own character, so a DM had no way to give a drop.
-- * `give_item_drop` posts a drop and claims it for one character in one transaction.
--   Posting and then claiming from the client would leave the drop open to a grab in
--   between; inside one transaction no other session ever sees it unclaimed.
-- * `dispatch_loot` takes the same choice for quest and room loot. A given item or
--   coin drop is claimed for the character inside the dispatch. A chest is opened at
--   the table, never given.
-- * A claim on a stacked drop now records itself in `claims`, so the card and
--   `get_loot_placements` name who got it ("All claimed by Bram"), as a grab does.

-- ── 1. The roll trigger honours the DM's choice ─────────────────────────────────
create or replace function private.stamp_need_or_greed()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_seconds integer;
begin
  if new.type <> 'item_drop' or new.metadata is null then
    return new;
  end if;

  -- A client never writes a roll. A server function inserting a message that already
  -- carries one (the demo copy) keeps it.
  if current_user in ('authenticated', 'anon') then
    new.metadata := new.metadata - 'roll';
  end if;
  if new.metadata ? 'roll' then
    return new;
  end if;

  if coalesce((new.metadata->>'thrown')::boolean, false) then
    return new;
  end if;

  -- The DM said this one does not roll: free to grab, or given to a character.
  if new.metadata->>'roll_mode' in ('free', 'give') then
    return new;
  end if;

  -- Only a fresh drop: one that has already been grabbed from is not a roll any more.
  if jsonb_array_length(coalesce(new.metadata->'claims', '[]'::jsonb)) > 0
     or new.metadata->>'claimed_by_user_id' is not null then
    return new;
  end if;

  if not exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = new.campaign_id and cm.user_id = new.user_id and cm.role = 'dm'
  ) then
    return new;
  end if;

  -- Clamped as numeric before the integer cast: a huge stored number would
  -- otherwise raise "integer out of range" here and fail every drop the DM posts.
  select coalesce(
           case when jsonb_typeof(cr.config->'seconds') = 'number'
                then round(least(300, greatest(10, (cr.config->>'seconds')::numeric)))::integer end,
           30)
    into v_seconds
  from public.campaign_rules cr
  where cr.campaign_id = new.campaign_id and cr.rule_key = 'need_or_greed' and cr.enabled;

  -- No row, or a row that is off: the rule is off (defaultEnabled false in the registry).
  if v_seconds is null then
    return new;
  end if;

  new.metadata := new.metadata || jsonb_build_object('roll', jsonb_build_object(
    'seconds', v_seconds,
    'closes_at', to_char((now() + make_interval(secs => v_seconds)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'entries', '[]'::jsonb,
    'resolved_at', null,
    'outcome', null
  ));
  return new;
end;
$$;

revoke execute on function private.stamp_need_or_greed() from public, anon, authenticated;

-- ── 2. A DM may claim a drop for any character in the campaign ──────────────────
create or replace function public.claim_item_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid, p_npc_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
  v_qty  integer;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if private.loot_roll_open(v_meta) then
    raise exception 'This drop is being rolled for';
  end if;
  v_qty := coalesce((v_meta->>'quantity_remaining')::int, (v_meta->>'quantity')::int, 1);
  if v_meta->>'claimed_by_user_id' is not null or v_qty <= 0 then
    raise exception 'Already claimed';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'claimed_by_user_id',      auth.uid()::text,
    'claimed_by_name',         p_claimer_name,
    'claimed_party_member_id', p_party_member_id,
    'npc_id',                  p_npc_id,
    'quantity_remaining',      0
  );
  -- A stacked drop names its takers in `claims`; a claim takes the rest, so it
  -- records itself there as a grab does.
  if v_meta ? 'claims' then
    v_meta := v_meta || jsonb_build_object('claims', coalesce(v_meta->'claims', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'user_id', auth.uid()::text,
        'name', p_claimer_name,
        'party_member_id', p_party_member_id,
        'qty', v_qty,
        'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )));
  end if;
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  if p_npc_id is not null then
    -- Giving a drop to an NPC is the DM's move: NPC inventory is the DM's to
    -- write (npc_inventory_insert), and a player who could do it here could
    -- also take a drop away from the party (found in #964's pre-push audit).
    if not coalesce(private.is_campaign_dm(v_msg.campaign_id), false) then
      raise exception 'Only the DM can give a drop to an NPC';
    end if;
    insert into public.npc_inventory (campaign_id, user_id, npc_id, item_id, library_item_id, name, quantity, notes)
    values (
      v_msg.campaign_id, auth.uid(), p_npc_id,
      nullif(v_meta->>'item_id', '')::uuid,
      nullif(v_meta->>'library_item_id', ''),
      v_meta->>'item_name',
      v_qty,
      null
    );
  else
    -- A player delivers only to their OWN character (owned or linked); the DM may
    -- give to any character of the campaign. A null member is a stash claim (any
    -- campaign member may stash).
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
            or coalesce(private.is_campaign_dm(v_msg.campaign_id), false)
          )
      ) then
        raise exception 'Cannot claim an item to a member you do not control';
      end if;
    end if;

    insert into public.party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location,
       is_container, is_identified, quality)
    values (
      v_msg.campaign_id, auth.uid(),
      nullif(v_meta->>'item_id', '')::uuid,
      nullif(v_meta->>'library_item_id', ''),
      v_meta->>'item_name',
      v_qty,
      p_party_member_id, 'backpack',
      coalesce((v_meta->>'is_container')::boolean, false),
      coalesce((v_meta->>'item_rarity') = 'mundane', false),
      -- The dropped row's quality travels with it (#1102); none, or an unknown word, is standard.
      case when v_meta->>'quality' in ('ruined', 'poor', 'standard', 'fine', 'masterwork')
           then v_meta->>'quality' else 'standard' end
    );
  end if;

  return v_meta;
end;
$function$;

create or replace function public.claim_currency_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid)
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
  where id = p_message_id and type = 'currency_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'claimed_by_user_id' is not null then
    raise exception 'Already claimed';
  end if;
  -- Drops are member-authored messages, so the coins are checked rather than
  -- trusted: whole and non-negative, so a claim can never debit a purse.
  -- Known keys too: a coin the campaign does not have is worthless today and
  -- would become real money the day the DM adds a coin by that key.
  if not private.valid_coins(coalesce(v_meta->'coins', '{}'::jsonb))
     or not private.coins_known(v_meta->'coins', private.campaign_currency(v_msg.campaign_id)) then
    raise exception 'Invalid drop';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'claimed_by_user_id',      auth.uid()::text,
    'claimed_by_name',         p_claimer_name,
    'claimed_party_member_id', p_party_member_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  -- Credit a player's own linked/owned member, or any member when the DM gives it,
  -- atomically. A null member is a DM claim: no purse to credit.
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
          or coalesce(private.is_campaign_dm(v_msg.campaign_id), false)
        )
    ) then
      raise exception 'Cannot claim currency to a member you do not control';
    end if;

    update public.party_members
       set coins = private.coins_add(coins, v_meta->'coins')
     where id = p_party_member_id;
  end if;

  return v_meta;
end;
$function$;

-- ── 3. Give a drop to one character, in one transaction ─────────────────────────
-- The client builds the drop's metadata exactly as it does for any drop
-- (`sendItemDrop`); this posts it as the DM and claims it for the character before
-- anyone else can see it.
create function public.give_item_drop(
  p_campaign_id uuid,
  p_party_member_id uuid,
  p_sender_name text,
  p_message text,
  p_metadata jsonb
)
returns public.campaign_messages
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_member public.party_members;
  v_qty integer;
  v_meta jsonb;
  v_row public.campaign_messages;
begin
  -- Giving is the DM's move. coalesce: a NULL here must refuse, never fall through.
  if not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Only the DM can give a drop' using errcode = '42501';
  end if;

  select * into v_member from public.party_members pm
  where pm.id = p_party_member_id and pm.campaign_id = p_campaign_id;
  if v_member is null then
    raise exception 'That character is not in this campaign' using errcode = '22023';
  end if;

  if jsonb_typeof(p_metadata) is distinct from 'object'
     or nullif(btrim(p_metadata->>'item_name'), '') is null then
    raise exception 'A drop needs an item name' using errcode = '22023';
  end if;
  v_qty := case when jsonb_typeof(p_metadata->'quantity') = 'number'
                then (p_metadata->>'quantity')::numeric::integer end;
  if v_qty is null or v_qty < 1 then
    raise exception 'Give at least one' using errcode = '22023';
  end if;

  -- Fresh and unclaimed whatever the client sent; never a roll (this is a definer, so
  -- the trigger does not strip one for us).
  v_meta := (p_metadata - 'roll' - 'thrown' - 'npc_id') || jsonb_build_object(
    'roll_mode', 'give',
    'quantity', v_qty,
    'quantity_remaining', v_qty,
    'claims', '[]'::jsonb,
    'claimed_by_user_id', null,
    'claimed_by_name', null,
    'claimed_party_member_id', null
  );

  insert into public.campaign_messages (campaign_id, user_id, recipient_user_id, sender_name, message, type, metadata)
  values (p_campaign_id, auth.uid(), null, coalesce(nullif(btrim(p_sender_name), ''), 'Dungeon Master'),
          coalesce(nullif(btrim(p_message), ''), 'dropped ' || (p_metadata->>'item_name')), 'item_drop', v_meta)
  returning * into v_row;

  perform public.claim_item_drop(v_row.id, v_member.name, v_member.id, null);

  select * into v_row from public.campaign_messages where id = v_row.id;
  return v_row;
end;
$function$;

revoke execute on function public.give_item_drop(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.give_item_drop(uuid, uuid, text, text, jsonb) to authenticated, service_role;

-- ── 4. Quest and room loot take the same choice ─────────────────────────────────
-- A new signature (two defaulted parameters), so the old one is dropped first: the
-- quest runtime's `perform public.dispatch_loot(ids)` calls resolve to this one and
-- keep rolling, as before, unless the DM chose otherwise.
drop function if exists public.dispatch_loot(uuid[]);

create function public.dispatch_loot(
  p_entry_ids uuid[],
  p_roll_mode text default 'roll',
  p_give_to uuid default null
)
 returns table(loot_entry_id uuid, message_id uuid, delivery_state text)
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare
  v_entry public.loot_placements;
  v_item public.items;
  v_lib public.library_items;
  v_item_name text;
  v_item_rarity text;
  v_image_url text;
  v_tags text[];
  v_message_id uuid;
  v_metadata jsonb;
  v_sender_name text;
  v_message text;
  v_member public.party_members;
begin
  if p_entry_ids is null or cardinality(p_entry_ids) = 0 then
    return;
  end if;

  -- One check, one message: see 20261003083553 (an existence oracle otherwise).
  if (
    select count(*) from public.loot_placements l
    where l.id = any(p_entry_ids) and private.is_campaign_dm(l.campaign_id)
  ) <> (
    select count(distinct e) from unnest(p_entry_ids) e where e is not null
  ) then
    raise exception 'One or more loot entries are not yours to drop';
  end if;

  if p_roll_mode is null or p_roll_mode not in ('roll', 'free', 'give') then
    raise exception 'Choose roll, free or give' using errcode = '22023';
  end if;
  if p_roll_mode = 'give' then
    -- Every entry is the DM's (checked above); the character must sit in the same
    -- campaign as every one of them.
    select * into v_member from public.party_members pm where pm.id = p_give_to;
    if v_member is null or exists (
      select 1 from public.loot_placements l
      where l.id = any(p_entry_ids) and l.campaign_id <> v_member.campaign_id
    ) then
      raise exception 'That character is not in this campaign' using errcode = '22023';
    end if;
  end if;

  for v_entry in
    select l.* from public.loot_placements l
    where l.id = any(p_entry_ids)
    order by l.sort_order, l.created_at, l.id
    for update
  loop
    select cm.display_name into v_sender_name
    from public.campaign_members cm
    where cm.campaign_id = v_entry.campaign_id and cm.user_id = auth.uid();
    v_sender_name := coalesce(nullif(btrim(v_sender_name), ''), 'Dungeon Master');

    if v_entry.dispatched_at is not null then
      loot_entry_id := v_entry.id;
      message_id := v_entry.dispatch_message_id;
      delivery_state := case when exists (
        select 1 from public.campaign_messages cm where cm.id = v_entry.dispatch_message_id
      ) then 'chat' else 'message_removed' end;
      return next;
      continue;
    end if;

    -- No location_id here: see 20261003083553 (players could resolve a room
    -- they were never shown).
    v_metadata := jsonb_build_object(
      'quest_id', v_entry.quest_id,
      'beat_id', v_entry.beat_id,
      'quest_loot_entry_id', v_entry.id,
      'source_type', v_entry.source_type,
      'source_id', v_entry.source_id
    );

    if v_entry.kind = 'item' then
      if v_entry.library_item_id is not null then
        select * into v_lib from public.library_items li where li.id = v_entry.library_item_id;
        if v_lib is null then
          raise exception 'Prepared item % no longer exists', v_entry.library_item_id;
        end if;
        v_item_name := v_lib.name;
        v_item_rarity := v_lib.rarity;
        v_image_url := case when v_lib.rarity = 'mundane' then v_lib.image_url else v_lib.mundane_image_url end;
        v_tags := v_lib.tags;
      else
        select * into v_item from public.items i where i.id = v_entry.item_id;
        if v_item is null then
          raise exception 'Prepared item % no longer exists', v_entry.item_id;
        end if;
        v_item_name := v_item.name;
        v_item_rarity := v_item.rarity;
        v_image_url := case when v_item.rarity = 'mundane' then v_item.image_url else v_item.mundane_image_url end;
        v_tags := v_item.tags;
      end if;
      v_metadata := v_metadata || jsonb_build_object(
        'item_id', v_entry.item_id,
        'library_item_id', v_entry.library_item_id,
        'item_name', v_item_name,
        'item_rarity', v_item_rarity,
        'quantity', v_entry.quantity,
        'quantity_remaining', v_entry.quantity,
        'claims', '[]'::jsonb,
        'image_url', v_image_url,
        'description', null,
        'is_container', 'container' = any(v_tags),
        'claimed_by_user_id', null,
        'claimed_by_name', null,
        'claimed_party_member_id', null,
        'roll_mode', p_roll_mode
      );
      v_message := 'dropped ' || case when v_entry.quantity > 1 then v_entry.quantity || 'x ' else '' end || v_item_name;
    elsif v_entry.kind = 'currency' then
      v_metadata := v_metadata || jsonb_build_object(
        'label', nullif(v_entry.label, ''),
        'coins', private.coins_add(v_entry.payload->'coins', '{}'::jsonb),
        'claimed_by_user_id', null,
        'claimed_by_name', null,
        'claimed_party_member_id', null
      );
      v_message := 'dropped '
        || case when v_entry.label <> '' then v_entry.label || ': ' else 'currency: ' end
        || private.coins_text(v_entry.payload->'coins', private.campaign_currency(v_entry.campaign_id));
    else
      v_metadata := v_entry.payload || v_metadata || jsonb_build_object('claims', '[]'::jsonb);
      v_message := 'dropped a chest from ' || coalesce(nullif(v_entry.payload->>'loot_table_name', ''), nullif(v_entry.label, ''), 'prepared loot');
    end if;

    insert into public.campaign_messages (
      campaign_id, user_id, recipient_user_id, sender_name, message, type, metadata
    ) values (
      v_entry.campaign_id, auth.uid(), null, v_sender_name, v_message,
      case v_entry.kind when 'item' then 'item_drop' when 'currency' then 'currency_drop' else 'loot_chest' end,
      v_metadata
    ) returning id into v_message_id;

    -- Given: claimed for the character in this same transaction, so nobody can
    -- grab it first. A chest is opened at the table and stays as it is.
    if p_roll_mode = 'give' then
      if v_entry.kind = 'item' then
        perform public.claim_item_drop(v_message_id, v_member.name, v_member.id, null);
      elsif v_entry.kind = 'currency' then
        perform public.claim_currency_drop(v_message_id, v_member.name, v_member.id);
      end if;
    end if;

    update public.loot_placements
    set dispatch_message_id = v_message_id, dispatched_at = now()
    where id = v_entry.id;

    -- #830: dropping a room's loot is looting the room. See 20261003083553 for
    -- why the insert is not wrapped in an insufficient_privilege handler.
    if v_entry.location_id is not null then
      if not exists (
        select 1 from public.location_state
        where location_id = v_entry.location_id and fact = 'looted' and value
      ) then
        insert into public.location_state_events (user_id, location_id, fact, value, note)
        values (auth.uid(), v_entry.location_id, 'looted', true, 'Loot was dropped from this room');
      end if;
    end if;

    loot_entry_id := v_entry.id;
    message_id := v_message_id;
    delivery_state := 'chat';
    return next;
  end loop;
end;
$function$;

revoke execute on function public.dispatch_loot(uuid[], text, uuid) from public, anon;
grant execute on function public.dispatch_loot(uuid[], text, uuid) to authenticated, service_role;
