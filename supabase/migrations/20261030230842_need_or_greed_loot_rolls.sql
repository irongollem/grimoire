-- Need or Greed: the optional rule `need_or_greed` (src/rules/optionalRules.ts).
--
-- With the rule on, every item the DM drops in campaign chat opens a roll, as in
-- World of Warcraft. Each seated character picks Need, Greed or Pass once; Need and
-- Greed roll a d100 at the moment of choosing, in the open. When the window closes, or
-- once every seated character has picked, the drop resolves: Need beats Greed, the
-- highest roll wins, ties fall to chance, and a stack is dealt round-robin through the
-- winning tier in rank order (the stand-in for WoW rolling each item separately). If
-- nobody chose Need or Greed it becomes an ordinary first-come drop.
--
-- The roll lives in the drop's own metadata, `metadata.roll`:
--   { seconds, closes_at, entries: [{party_member_id, user_id, name, choice, roll, at}],
--     resolved_at, outcome: null | 'won' | 'unclaimed' }
-- Winners are appended to `claims` and `quantity_remaining` goes to 0, so everything
-- that already reads a claimed drop (chat, get_loot_placements, the Hearth) reads a won
-- roll without knowing about rolls.
--
-- Why these choices:
-- * The server decides which drops roll, at insert, not the client. Quest and encounter
--   loot is posted by dispatch_loot, a server function, so a client-side flag would miss
--   the loot the rule exists for. A drop rolls when its sender is a DM of the campaign;
--   a player's drop is a gift to the table, not loot, and never rolls. A thrown weapon
--   (`metadata.thrown`) never rolls either: the javelin belongs to whoever threw it.
-- * A client cannot write `roll`: the insert trigger strips it from a client insert and
--   stamps its own, with the deadline from the server clock. There is no client UPDATE
--   policy on campaign_messages (20260711000008), so after insert only the functions
--   below write it.
-- * Nothing on the server wakes at the deadline. Every open client calls
--   resolve_loot_roll when its countdown ends; the call is idempotent under the row lock,
--   so the first wins and the rest read the result. A drop nobody was watching at the
--   deadline resolves the next time anyone opens the chat. pg_cron for a 30-second timer
--   would be a scheduler to run and monitor for something every open tab already knows.
-- * Rolls are random() on the server, never sent by the client.

-- ── Delivering a dropped item into a character's pack ───────────────────────────
-- Lifted out of grab_item_drop so a grab and a won roll put the item in the same place
-- the same way: onto a matching loose stack in the backpack or belt, else a new row.
-- `p_user_id` is the receiving player, which for a roll is not the caller: whichever
-- client resolves the roll, the item is the winner's.
create function private.deliver_item_drop(
  p_campaign_id uuid, p_user_id uuid, p_meta jsonb, p_party_member_id uuid, p_qty integer
)
returns void
language plpgsql
set search_path to ''
as $$
declare
  v_item_id uuid := nullif(p_meta->>'item_id', '')::uuid;
  v_library_item_id text := nullif(p_meta->>'library_item_id', '');
  v_identified boolean := coalesce((p_meta->>'item_rarity') = 'mundane', false);
  v_container boolean := coalesce((p_meta->>'is_container')::boolean, false);
  -- An unknown word reads as standard rather than failing; the check constraint would
  -- refuse anything else anyway.
  v_quality text := case when p_meta->>'quality' in ('ruined', 'poor', 'standard', 'fine', 'masterwork')
                         then p_meta->>'quality' else 'standard' end;
  v_existing uuid;
begin
  if v_item_id is not null or v_library_item_id is not null then
    select id into v_existing from public.party_inventory
    where campaign_id = p_campaign_id
      and item_id is not distinct from v_item_id
      and library_item_id is not distinct from v_library_item_id
      and carried_by is not distinct from p_party_member_id
      and container_id is null
      and location in ('backpack', 'belt')
      and quality = v_quality
      and not is_equipped
      and is_identified = v_identified
      and is_container = v_container
    limit 1;
  end if;

  if v_existing is not null then
    update public.party_inventory
    set quantity = quantity + p_qty
    where id = v_existing;
  else
    insert into public.party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location,
       is_container, is_identified, quality)
    values (
      p_campaign_id, p_user_id, v_item_id, v_library_item_id,
      p_meta->>'item_name', p_qty, p_party_member_id, 'backpack',
      v_container, v_identified, v_quality
    );
  end if;
end;
$$;

revoke execute on function private.deliver_item_drop(uuid, uuid, jsonb, uuid, integer) from public, anon, authenticated;

-- ── Is a roll still open? ────────────────────────────────────────────────────
-- Total by construction: no roll, a resolved one, or one without a deadline is false.
-- The deadline matters because every caller compares now() with it, and a comparison
-- with NULL would let a choice in forever and a player close it early.
create function private.loot_roll_open(p_meta jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(
    jsonb_typeof(p_meta->'roll') = 'object'
      and (p_meta->'roll'->>'resolved_at') is null
      and (p_meta->'roll'->>'closes_at') is not null,
    false);
$$;

revoke execute on function private.loot_roll_open(jsonb) from public, anon, authenticated;

-- ── Opening a roll when the DM drops an item ────────────────────────────────
-- Invoker, on purpose: `current_user` is how it tells a client insert from a server
-- function's, and a definer would always see its owner. The reads below are the DM's
-- own campaign rows, which the inserting DM can see; for anyone else they come back
-- empty and the drop simply does not roll.
create function private.stamp_need_or_greed()
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

create trigger need_or_greed_stamp
  before insert on public.campaign_messages
  for each row execute procedure private.stamp_need_or_greed();

-- ── Resolving a roll (caller holds the row lock) ────────────────────────────
create function private.resolve_loot_roll_locked(p_message_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_campaign_id uuid;
  v_meta jsonb;
  v_roll jsonb;
  v_tier text;
  v_pool jsonb;
  v_n integer;
  v_qty integer;
  v_share integer;
  v_entry jsonb;
  v_claims jsonb;
  v_now text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select campaign_id, metadata into v_campaign_id, v_meta
  from public.campaign_messages where id = p_message_id;

  v_roll := v_meta->'roll';

  -- Only entries that can still receive the item. A character deleted or moved out of
  -- the campaign, or an account erased, while the window was open would otherwise make
  -- the delivery fail on its foreign keys, and keep failing, so the roll could never
  -- close and the drop could never be grabbed. Such an entry simply does not win.
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_pool
  from jsonb_array_elements(v_roll->'entries') e
  where exists (
      select 1 from public.party_members pm
      where pm.id = (e->>'party_member_id')::uuid and pm.campaign_id = v_campaign_id)
    and exists (select 1 from auth.users u where u.id = (e->>'user_id')::uuid);

  v_tier := case
    when exists (select 1 from jsonb_array_elements(v_pool) e where e->>'choice' = 'need') then 'need'
    when exists (select 1 from jsonb_array_elements(v_pool) e where e->>'choice' = 'greed') then 'greed'
  end;

  if v_tier is null then
    v_meta := jsonb_set(v_meta, '{roll}', v_roll || jsonb_build_object('resolved_at', v_now, 'outcome', 'unclaimed'));
    update public.campaign_messages set metadata = v_meta where id = p_message_id;
    return v_meta;
  end if;

  select jsonb_agg(e order by (e->>'roll')::integer desc, random())
    into v_pool
  from jsonb_array_elements(v_pool) e
  where e->>'choice' = v_tier;

  v_n := jsonb_array_length(v_pool);
  v_qty := coalesce((v_meta->>'quantity_remaining')::integer, (v_meta->>'quantity')::integer, 1);
  v_claims := coalesce(v_meta->'claims', '[]'::jsonb);

  -- Deal the stack round-robin in rank order: the first `v_qty % v_n` winners get one
  -- more than the rest, and nobody past the stack gets anything.
  for i in 0 .. least(v_n, v_qty) - 1 loop
    v_entry := v_pool->i;
    v_share := v_qty / v_n + case when i < v_qty % v_n then 1 else 0 end;
    perform private.deliver_item_drop(
      v_campaign_id, (v_entry->>'user_id')::uuid, v_meta,
      (v_entry->>'party_member_id')::uuid, v_share);
    v_claims := v_claims || jsonb_build_array(jsonb_build_object(
      'user_id', v_entry->>'user_id',
      'name', v_entry->>'name',
      'party_member_id', v_entry->>'party_member_id',
      'qty', v_share,
      'at', v_now));
  end loop;

  v_meta := v_meta
    || jsonb_build_object('claims', v_claims, 'quantity_remaining', 0)
    || jsonb_build_object('roll', v_roll || jsonb_build_object('resolved_at', v_now, 'outcome', 'won'));
  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$$;

revoke execute on function private.resolve_loot_roll_locked(uuid) from public, anon, authenticated;

-- ── Choosing Need, Greed or Pass ─────────────────────────────────────────────
create function public.choose_loot_roll(
  p_message_id uuid, p_party_member_id uuid, p_choice text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_campaign_id uuid;
  v_meta jsonb;
  v_roll jsonb;
  v_seated integer;
  v_chosen integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_choice is null or p_choice not in ('need', 'greed', 'pass') then
    raise exception 'Choose need, greed or pass';
  end if;

  select campaign_id, metadata into v_campaign_id, v_meta
  from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_campaign_id is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  -- The character must hold a player seat in this campaign, and the caller must be the
  -- one sitting in it or its owner (the same control test as a grab).
  if p_party_member_id is null or not exists (
    select 1
    from public.campaign_members seat
    join public.party_members pm on pm.id = seat.party_member_id
    where seat.campaign_id = v_campaign_id
      and seat.role = 'player'
      and seat.party_member_id = p_party_member_id
      and pm.campaign_id = v_campaign_id
      -- The owner, or whoever holds the seat (a minder, #1059). Never the creator.
      and (pm.owner_user_id = v_uid or seat.user_id = v_uid)
  ) then
    raise exception 'Cannot roll for a character you do not control';
  end if;

  if not private.loot_roll_open(v_meta) then
    raise exception 'This drop has no open roll';
  end if;
  v_roll := v_meta->'roll';
  if now() >= (v_roll->>'closes_at')::timestamptz then
    raise exception 'The roll has closed';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_roll->'entries') e
    where e->>'party_member_id' = p_party_member_id::text
  ) then
    raise exception 'This character has already chosen';
  end if;

  v_roll := jsonb_set(v_roll, '{entries}', (v_roll->'entries') || jsonb_build_array(jsonb_build_object(
    'party_member_id', p_party_member_id,
    'user_id', v_uid,
    -- The character's own name, never one the caller sends: an entry is shown to the
    -- whole table as that character's roll.
    'name', (select pm.name from public.party_members pm where pm.id = p_party_member_id),
    'choice', p_choice,
    'roll', case when p_choice = 'pass' then null else 1 + floor(random() * 100)::integer end,
    'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )));
  v_meta := jsonb_set(v_meta, '{roll}', v_roll);
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  -- Everyone seated has chosen: nothing left to wait for.
  select count(distinct seat.party_member_id) into v_seated
  from public.campaign_members seat
  where seat.campaign_id = v_campaign_id and seat.role = 'player' and seat.party_member_id is not null;
  select count(distinct e->>'party_member_id') into v_chosen
  from jsonb_array_elements(v_roll->'entries') e
  where (e->>'party_member_id')::uuid in (
    select seat.party_member_id from public.campaign_members seat
    where seat.campaign_id = v_campaign_id and seat.role = 'player');

  if v_chosen >= v_seated then
    return private.resolve_loot_roll_locked(p_message_id);
  end if;
  return v_meta;
end;
$$;

revoke execute on function public.choose_loot_roll(uuid, uuid, text) from public, anon;
grant execute on function public.choose_loot_roll(uuid, uuid, text) to authenticated, service_role;

-- ── Closing a roll ────────────────────────────────────────────────────────────
-- Any member may call it at or after the deadline; before it, only the DM, which ends
-- the roll early. Calling it on a resolved drop, or early as a player, changes nothing
-- and returns the drop as it stands, so every open client can call it at the deadline.
create function public.resolve_loot_roll(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_campaign_id uuid;
  v_meta jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  select campaign_id, metadata into v_campaign_id, v_meta
  from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_campaign_id is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  if not private.loot_roll_open(v_meta) then
    return v_meta;
  end if;
  if now() < (v_meta->'roll'->>'closes_at')::timestamptz
     and not private.is_campaign_dm(v_campaign_id) then
    return v_meta;
  end if;

  return private.resolve_loot_roll_locked(p_message_id);
end;
$$;

revoke execute on function public.resolve_loot_roll(uuid) from public, anon;
grant execute on function public.resolve_loot_roll(uuid) to authenticated, service_role;

-- ── A grab or claim waits for the roll ──────────────────────────────────────
-- Bodies otherwise unchanged from 20261025230846, except that grab_item_drop now
-- delivers through private.deliver_item_drop, and claim_item_drop hands over what is
-- left rather than the original quantity. It read only the legacy claimed_by_user_id,
-- which a grab never sets, so after a stack was grabbed empty (or a roll won) anyone
-- could still claim the whole original quantity again: the DM's "To NPC" did it to
-- partly grabbed stacks, and with rolls a loser could take a copy of the winner's item.
create or replace function public.grab_item_drop(p_message_id uuid, p_qty integer, p_claimer_user_id uuid, p_claimer_name text, p_party_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_meta jsonb;
  v_campaign_id uuid;
  v_qty_orig int;
  v_qty_rem int;
  v_to_grab int;
  v_new_claim jsonb;
  v_new_meta jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Retained because deployed clients still send it. It is deliberately ignored:
  -- the authenticated JWT remains the only source of claimant identity.
  perform p_claimer_user_id;

  select metadata, campaign_id into v_meta, v_campaign_id
  from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_meta is null then raise exception 'message not found'; end if;
  if not private.is_campaign_member(v_campaign_id) then
    raise exception 'Not a campaign member';
  end if;
  if private.loot_roll_open(v_meta) then
    raise exception 'This drop is being rolled for';
  end if;

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
  v_qty_rem := coalesce((v_meta->>'quantity_remaining')::int, v_qty_orig);

  if v_qty_rem <= 0 then raise exception 'stack exhausted'; end if;

  if p_qty < 0 or p_qty >= v_qty_rem then
    v_to_grab := v_qty_rem;
  else
    v_to_grab := p_qty;
  end if;

  v_new_claim := jsonb_build_object(
    'user_id', auth.uid(),
    'name', p_claimer_name,
    'party_member_id', p_party_member_id,
    'qty', v_to_grab,
    'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_new_meta := v_meta
    || jsonb_build_object('quantity_remaining', v_qty_rem - v_to_grab)
    || jsonb_build_object(
      'claims', coalesce(v_meta->'claims', '[]'::jsonb) || jsonb_build_array(v_new_claim)
    );

  update public.campaign_messages set metadata = v_new_meta where id = p_message_id;

  perform private.deliver_item_drop(v_campaign_id, auth.uid(), v_meta, p_party_member_id, v_to_grab);

  return jsonb_build_object(
    'qty_grabbed', v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$$;

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
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  if p_npc_id is not null then
    -- Giving a drop to an NPC is the DM's move: NPC inventory is the DM's to
    -- write (npc_inventory_insert), and a player who could do it here could
    -- also take a drop away from the party (found in #964's pre-push audit).
    if not private.is_campaign_dm(v_msg.campaign_id) then
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
