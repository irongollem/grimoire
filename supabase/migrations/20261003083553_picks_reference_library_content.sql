-- #954: picking shared content references it instead of copying it.
--
-- Every place below could only point at a row in the DM's own `monsters` /
-- `items`, so the client cloned a library row into the vault before writing
-- (`useEnsureOwnedItem` / `useEnsureOwnedMonster`). That is where the duplicate
-- vault rows and the "(customized)" monsters kept coming from (#876 cleaned up
-- 591 of them on one account). After this migration each of them holds a
-- library id directly, and the client stops cloning.
--
--  1. Quest beat attachments of type monster / item accept a library id.
--  2. `loot_placements.library_item_id`, validated, immutable once dispatched,
--     read by `get_loot_placements`, `dispatch_loot` and the player projection.
--  3. `encounters.item_ids` becomes `text[]`: a list of either kind of id.
--  4. Downtime rewards: `reward_id` becomes `text` on deck backs and outcomes,
--     and `resolve_downtime_draw` takes it as text.
--
-- A library reference needs no ownership check: shared content is public read.
-- It resolves whether or not the campaign has that book enabled; enablement
-- governs what pickers offer, not whether something already chosen still
-- exists.

-- ── 1. Beat attachments ─────────────────────────────────────────────────────
-- Same function as 20260908210323 with the item and monster arms split on the
-- shape of the id: a uuid is a vault row (unchanged rules), anything else must
-- be a library row. Branching on shape before casting keeps a library id from
-- reaching `::uuid`, which would surface as the misleading "must be a valid
-- UUID" error below.
create or replace function private.validate_quest_beat_attachment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare
  v_valid boolean := false;
  v_is_uuid boolean := new.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  -- An `else` arm on purpose. Without one, an attachment_type the CHECK no
  -- longer admits — an old browser tab posting a type this epic deleted — fails
  -- with CASE_NOT_FOUND (SQLSTATE 20000), which PostgREST has no 4xx mapping
  -- for and returns as a 500. Fail closed either way, but say so in a class the
  -- client can read.
  case new.attachment_type
    when 'encounter' then
      select exists(select 1 from encounters e where e.id = new.ref_id::uuid and e.campaign_id = new.campaign_id) into v_valid;
    when 'npc' then
      select exists(select 1 from npcs n where n.id = new.ref_id::uuid and (n.campaign_id = new.campaign_id or (n.campaign_id is null and (n.user_id = auth.uid() or n.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'faction' then
      select exists(select 1 from factions f where f.id = new.ref_id::uuid and (f.campaign_id = new.campaign_id or (f.campaign_id is null and (f.user_id = auth.uid() or f.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
    when 'item' then
      if v_is_uuid then
        select exists(select 1 from items i where i.id = new.ref_id::uuid and (i.campaign_id = new.campaign_id or (i.campaign_id is null and (i.user_id = auth.uid() or i.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
      else
        select exists(select 1 from library_items li where li.id = new.ref_id) into v_valid;
      end if;
    when 'monster' then
      if v_is_uuid then
        select exists(select 1 from monsters m where m.id = new.ref_id::uuid and (m.campaign_id = new.campaign_id or (m.campaign_id is null and (m.user_id = auth.uid() or m.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))))) into v_valid;
      else
        select exists(select 1 from library_monsters lm where lm.id = new.ref_id) into v_valid;
      end if;
    when 'check' then
      -- A check carries its own data instead of pointing at a row: ref_id is
      -- the literal 'check', and the metadata must name a skill and a DC.
      -- Validated here rather than by casting, because the cast handler below
      -- says "must be a valid UUID", which would mislead for a DC.
      v_valid := new.ref_id = 'check'
        and coalesce(length(btrim(new.metadata ->> 'skill')), 0) > 0
        and coalesce(new.metadata ->> 'dc', '') ~ '^[0-9]+$';
    when 'sound' then
      select exists(select 1 from sounds s where s.id = new.ref_id::uuid and s.campaign_id = new.campaign_id) into v_valid;
    when 'audio_scene' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'ambient') into v_valid;
    when 'playlist' then
      select exists(select 1 from soundboard_playlists p where p.id = new.ref_id::uuid and p.campaign_id = new.campaign_id and p.playlist_type = 'music') into v_valid;
    when 'note' then
      select exists(select 1 from notes n where n.id = new.ref_id::uuid and n.campaign_id = new.campaign_id) into v_valid;
    when 'handout' then
      select exists(select 1 from scriptorium_documents d where d.id = new.ref_id::uuid and (d.user_id = auth.uid() or d.user_id = (select c.user_id from public.campaigns c where c.id = new.campaign_id))) into v_valid;
    else
      v_valid := false;
  end case;

  if not v_valid then
    raise exception 'Invalid % attachment % for quest % in campaign %',
      new.attachment_type, new.ref_id, new.quest_id, new.campaign_id
      using errcode = '23514';
  end if;
  return new;
exception when invalid_text_representation then
  raise exception 'Attachment reference must be a valid UUID for type %', new.attachment_type
    using errcode = '23514';
end;
$function$;

-- ── 2. Loot placements ──────────────────────────────────────────────────────
-- `on delete restrict`, unlike the inventory tables' set null / cascade: a
-- prepared reward that silently vanished (or became an item-kind row with no
-- item, which the shape check below forbids) is worse than a library reseed
-- failing loudly on a row someone still uses.
alter table public.loot_placements
  add column library_item_id text references public.library_items(id) on delete restrict;

create index loot_placements_library_item_id_idx
  on public.loot_placements (library_item_id) where library_item_id is not null;

alter table public.loot_placements drop constraint quest_beat_loot_item_shape;
alter table public.loot_placements add constraint quest_beat_loot_item_shape check (
  (kind = 'item' and num_nonnulls(item_id, library_item_id) = 1)
  or (kind <> 'item' and item_id is null and library_item_id is null)
);

create or replace function private.validate_loot_placement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare
  v_coin text;
begin
  -- Only when the answer could have changed. This clause is *caller-dependent*
  -- (`i.user_id = auth.uid()`), so re-running it on an unrelated UPDATE asks a
  -- different question than the INSERT did: a DM may legitimately place a
  -- personal item (campaign_id null, owned by them) as loot, and a **co-DM**
  -- dispatching it later would fail this check on a row nobody edited — the
  -- bookkeeping UPDATE inside `dispatch_loot` runs as them. The entry would be
  -- undispatchable by anyone but its placer, with an error about item
  -- availability that has nothing to do with dropping it.
  --
  -- Gating on an actual change keeps the guarantee that matters — nothing can
  -- be re-homed onto an item the campaign cannot use — without re-litigating a
  -- decision already made.
  --
  -- A library item (#954) needs no availability check: shared content is
  -- public, and the foreign key already guarantees it exists.
  if new.kind = 'item'
     and new.item_id is not null
     and (tg_op = 'INSERT'
          or new.item_id is distinct from old.item_id
          or new.campaign_id is distinct from old.campaign_id)
     and not exists (
    select 1 from public.items i
    where i.id = new.item_id
      and (i.user_id = auth.uid() or i.campaign_id = new.campaign_id)
  ) then
    raise exception 'Item is not available to this campaign' using errcode = '23514';
  end if;

  -- The room/campaign agreement that used to live here is now the composite FK
  -- `loot_placements_location_fkey`, which the beat home has always had. A
  -- constraint holds continuously; a trigger only fires when this row is
  -- written, and the room could move afterwards.

  if new.kind = 'currency' then
    foreach v_coin in array array['pp', 'gp', 'ep', 'sp', 'cp'] loop
      if new.payload ? v_coin and (
        jsonb_typeof(new.payload->v_coin) <> 'number'
        or (new.payload->>v_coin)::numeric < 0
        or floor((new.payload->>v_coin)::numeric) <> (new.payload->>v_coin)::numeric
      ) then
        raise exception 'Currency % must be a non-negative integer', v_coin using errcode = '23514';
      end if;
    end loop;
    if coalesce((new.payload->>'pp')::integer, 0)
      + coalesce((new.payload->>'gp')::integer, 0)
      + coalesce((new.payload->>'ep')::integer, 0)
      + coalesce((new.payload->>'sp')::integer, 0)
      + coalesce((new.payload->>'cp')::integer, 0) = 0 then
      raise exception 'Currency loot must contain at least one coin' using errcode = '23514';
    end if;
  end if;

  if new.kind = 'loot_chest' and (
    jsonb_typeof(new.payload->'rolled_atoms') is distinct from 'array'
    or jsonb_typeof(new.payload->'claims_total') is distinct from 'number'
    or (new.payload->>'claims_total')::integer < 1
  ) then
    raise exception 'Loot chest requires rolled_atoms and a positive claims_total' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.dispatched_at is not null and (
    new.beat_id is distinct from old.beat_id
    or new.quest_id is distinct from old.quest_id
    or new.location_id is distinct from old.location_id
    or new.campaign_id is distinct from old.campaign_id
    or new.kind is distinct from old.kind
    or new.item_id is distinct from old.item_id
    or new.library_item_id is distinct from old.library_item_id
    or new.quantity is distinct from old.quantity
    or new.payload is distinct from old.payload
    or new.source_type is distinct from old.source_type
    or new.source_id is distinct from old.source_id
    or new.dispatch_message_id is distinct from old.dispatch_message_id
    or new.dispatched_at is distinct from old.dispatched_at
  ) then
    raise exception 'Dispatched loot provenance is immutable' using errcode = '23514';
  end if;

  return new;
end;
$function$;

-- The return type gains a column, which `create or replace` cannot do.
drop function public.get_loot_placements(uuid, uuid, uuid);

create function public.get_loot_placements(p_campaign_id uuid, p_quest_id uuid default null::uuid, p_location_id uuid default null::uuid)
 returns table(id uuid, beat_id uuid, quest_id uuid, location_id uuid, campaign_id uuid, kind text, item_id uuid, library_item_id text, quantity integer, label text, payload jsonb, source_type text, source_id uuid, sort_order integer, dispatch_message_id uuid, dispatched_at timestamp with time zone, delivery_state text, quantity_remaining integer, claimed_by_names text[], handed_out_this_session boolean)
 language sql
 stable security definer
 set search_path to 'public', 'private'
as $function$
  with current_session as (
    select max(t.created_at) as started_at
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id and t.transition_kind = 'enter'
  )
  select
    l.id, l.beat_id, l.quest_id, l.location_id, l.campaign_id, l.kind, l.item_id, l.library_item_id,
    l.quantity, coalesce(nullif(l.label, ''), i.name, li.name, l.payload->>'loot_table_name', 'Loot'),
    l.payload, l.source_type, l.source_id, l.sort_order,
    l.dispatch_message_id, l.dispatched_at,
    case
      when l.dispatched_at is null then 'held'
      when m.id is null then 'message_removed'
      when l.kind = 'item' and coalesce((m.metadata->>'quantity_remaining')::integer, l.quantity) <= 0 then 'claimed'
      when l.kind = 'item' and jsonb_array_length(coalesce(m.metadata->'claims', '[]'::jsonb)) > 0 then 'partially_claimed'
      when l.kind = 'currency' and m.metadata->>'claimed_by_user_id' is not null then 'claimed'
      when l.kind = 'loot_chest' and jsonb_array_length(coalesce(m.metadata->'claims', '[]'::jsonb)) >= coalesce((m.metadata->>'claims_total')::integer, 0) then 'claimed'
      when l.kind = 'loot_chest' and jsonb_array_length(coalesce(m.metadata->'claims', '[]'::jsonb)) > 0 then 'partially_claimed'
      else 'chat'
    end,
    case
      when m.id is null then l.quantity
      when l.kind = 'item' then greatest(coalesce((m.metadata->>'quantity_remaining')::integer, l.quantity), 0)
      when l.kind = 'currency' then case when m.metadata->>'claimed_by_user_id' is null then 1 else 0 end
      else greatest(coalesce((m.metadata->>'claims_total')::integer, 0) - jsonb_array_length(coalesce(m.metadata->'claims', '[]'::jsonb)), 0)
    end,
    case
      when m.id is null then '{}'::text[]
      when l.kind = 'currency' then array_remove(array[m.metadata->>'claimed_by_name'], null)
      else coalesce((
        select array_agg(distinct coalesce(claim->>'name', claim->>'claimed_by_name') order by coalesce(claim->>'name', claim->>'claimed_by_name'))
        from jsonb_array_elements(coalesce(m.metadata->'claims', '[]'::jsonb)) claim
        where coalesce(claim->>'name', claim->>'claimed_by_name') is not null
      ), '{}'::text[])
    end,
    coalesce(m.created_at >= current_session.started_at, false)
  from public.loot_placements l
  left join public.items i on i.id = l.item_id
  left join public.library_items li on li.id = l.library_item_id
  left join public.campaign_messages m on m.id = l.dispatch_message_id
  cross join current_session
  where l.campaign_id = p_campaign_id
    and (p_quest_id is null or l.quest_id = p_quest_id)
    and (p_location_id is null or l.location_id = p_location_id)
    and private.is_campaign_dm(p_campaign_id)
  order by l.beat_id nulls last, l.location_id nulls last, l.sort_order, l.created_at, l.id;
$function$;

revoke all on function public.get_loot_placements(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_loot_placements(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.dispatch_loot(p_entry_ids uuid[])
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
  v_parts text[];
begin
  if p_entry_ids is null or cardinality(p_entry_ids) = 0 then
    return;
  end if;

  -- Authorise every entry before dispatching any of them: a partially-applied
  -- batch would mint chat messages for the rows that passed and leave the
  -- caller unsure which. This is the whole authorisation gate — the function is
  -- SECURITY DEFINER and bypasses RLS, so it must re-derive the caller's right
  -- to each row from `auth.uid()` rather than trusting the ids it was handed.
  --
  -- Counted in ONE check with ONE message, deliberately. Split into "you may
  -- not touch this" and "this does not exist", the pair is an existence oracle:
  -- because the function bypasses RLS, the authorisation `exists` silently
  -- skips ids that are not there, so the two errors distinguish *a stranger's
  -- loot* from *no loot at all* for any uuid in the system. Entry ids reach
  -- players in `campaign_messages.metadata`, so there is a real id source. One
  -- message answers neither question.
  --
  -- `count(distinct)` rather than `cardinality`: a "drop all" list plus a
  -- per-row button, or a double submit, legitimately produces a repeated id,
  -- and failing a valid drop over it would be a bug in the caller's favour
  -- reported as a missing row.
  if (
    select count(*) from public.loot_placements l
    where l.id = any(p_entry_ids) and private.is_campaign_dm(l.campaign_id)
  ) <> (
    select count(distinct e) from unnest(p_entry_ids) e where e is not null
  ) then
    raise exception 'One or more loot entries are not yours to drop';
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

    -- `location_id` is deliberately NOT here. `campaign_messages` is readable by
    -- every player in the campaign, and `get_player_visible_locations` has a
    -- single-id carve-out for `is_map_shared` rooms — so putting the room's uuid
    -- in drop metadata would hand players a key that resolves to a room they
    -- were never shown, name and map included. Beat drops have only ever
    -- carried `quest_id`/`beat_id`, and the DM surface can reach the room by
    -- joining the loot row, which is DM-only.
    v_metadata := jsonb_build_object(
      'quest_id', v_entry.quest_id,
      'beat_id', v_entry.beat_id,
      'quest_loot_entry_id', v_entry.id,
      'source_type', v_entry.source_type,
      'source_id', v_entry.source_id
    );

    if v_entry.kind = 'item' then
      -- Exactly one of the two references is set (quest_beat_loot_item_shape).
      -- The drop carries whichever it is; `claim_item_drop` / `grab_item_drop`
      -- already write either one into the claimant's inventory.
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
        'claimed_party_member_id', null
      );
      v_message := 'dropped ' || case when v_entry.quantity > 1 then v_entry.quantity || 'x ' else '' end || v_item_name;
    elsif v_entry.kind = 'currency' then
      v_parts := array_remove(array[
        case when coalesce((v_entry.payload->>'pp')::integer, 0) > 0 then (v_entry.payload->>'pp') || ' pp' end,
        case when coalesce((v_entry.payload->>'gp')::integer, 0) > 0 then (v_entry.payload->>'gp') || ' gp' end,
        case when coalesce((v_entry.payload->>'ep')::integer, 0) > 0 then (v_entry.payload->>'ep') || ' ep' end,
        case when coalesce((v_entry.payload->>'sp')::integer, 0) > 0 then (v_entry.payload->>'sp') || ' sp' end,
        case when coalesce((v_entry.payload->>'cp')::integer, 0) > 0 then (v_entry.payload->>'cp') || ' cp' end
      ], null);
      v_metadata := v_metadata || jsonb_build_object(
        'label', nullif(v_entry.label, ''),
        'pp', coalesce((v_entry.payload->>'pp')::integer, 0),
        'gp', coalesce((v_entry.payload->>'gp')::integer, 0),
        'ep', coalesce((v_entry.payload->>'ep')::integer, 0),
        'sp', coalesce((v_entry.payload->>'sp')::integer, 0),
        'cp', coalesce((v_entry.payload->>'cp')::integer, 0),
        'claimed_by_user_id', null,
        'claimed_by_name', null,
        'claimed_party_member_id', null
      );
      v_message := 'dropped ' || case when v_entry.label <> '' then v_entry.label || ': ' else 'currency: ' end || array_to_string(v_parts, ', ');
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

    update public.loot_placements
    set dispatch_message_id = v_message_id, dispatched_at = now()
    where id = v_entry.id;

    -- #830: dropping a room's loot IS looting the room, so the fact and the
    -- drop are one act. Direction matters and is deliberately one-way — a drop
    -- implies looted, never the reverse: a DM narrating an empty room may still
    -- mark it looted by hand, and that assertion must not invent a loot drop.
    --
    -- Reads the newest assertion rather than mere existence, the same shape
    -- `mark_arrival_explored` uses: a DM who explicitly un-looted a room has
    -- said something, and dropping again should record that it was looted
    -- again.
    --
    -- NOT wrapped in `exception when insufficient_privilege`, though that is
    -- what `mark_arrival_explored` does. That function is SECURITY **INVOKER**,
    -- so its insert really does run under `location_state_events_insert` and can
    -- really be refused. This one is SECURITY DEFINER owned by `postgres`, which
    -- has `rolbypassrls`, so the policy never applies and that handler could
    -- never fire — it would be a comment promising a safety it does not have.
    --
    -- What makes bypassing that policy sound is the composite FK above: the
    -- policy would require `is_campaign_dm(location.campaign_id)`, dispatch has
    -- established `is_campaign_dm(loot.campaign_id)`, and the FK is what holds
    -- those two equal. Weaken the FK and this bypass loses its justification.
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

-- The player's beat payoff names dispatched loot; a library item names itself
-- through the same coalesce. Same function as 20260908210322 otherwise.
create or replace function public.get_player_visible_quest_beats(p_campaign_id uuid, p_quest_id uuid default null::uuid, p_preview_party_member_id uuid default null::uuid)
 returns table(id uuid, quest_id uuid, campaign_id uuid, visibility text, kind text, presentation_hint text, player_text text, story_order integer, attachments jsonb, visits jsonb, updated_at timestamp with time zone, staged_at_location_id uuid, thread_id uuid, thread_label text, is_current boolean, payoff jsonb)
 language plpgsql
 stable security definer
 set search_path to 'public', 'private'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_preview_party_member_id is not null and not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Only a campaign DM can choose a preview audience';
  end if;
  if p_preview_party_member_id is not null and not exists (
    select 1 from public.party_members pm
    where pm.id = p_preview_party_member_id and pm.campaign_id = p_campaign_id
  ) then
    raise exception 'Preview audience is not in this campaign';
  end if;

  return query
  with recursive scoped as (
    select b.id, b.quest_id, b.is_improvised, b.kind
    from public.quest_beats b
    join public.quests q on q.id = b.quest_id and q.campaign_id = b.campaign_id
    where b.campaign_id = p_campaign_id
      and (p_quest_id is null or b.quest_id = p_quest_id)
      and case
        when p_preview_party_member_id is null then private.is_quest_player_visible(b.quest_id)
        else p_preview_party_member_id = any(q.player_visible_to)
      end
  ),
  roots as (
    select s.id
    from scoped s
    where not exists (
        select 1 from public.quest_beat_edges e where e.target_beat_id = s.id
      )
      and not s.is_improvised
      and s.kind is distinct from 'archived'
  ),
  walk as (
    select r.id as beat_id, 0 as depth, array[r.id] as seen
    from roots r
    union all
    select e.target_beat_id, w.depth + 1, w.seen || e.target_beat_id
    from walk w
    join public.quest_beat_edges e on e.source_beat_id = w.beat_id
    where not (e.target_beat_id = any(w.seen))
  ),
  depths as (
    select w.beat_id, max(w.depth) as depth
    from walk w
    group by w.beat_id
  ),

  -- ── Which thread a beat belongs to, on the player's side ─────────────────
  --
  -- Every quest has a "Main" thread from the day it is created (the
  -- create_quest_main_thread trigger), used both as the fallback and as the
  -- column a thread folds into until it has said something the party heard.
  main_threads as (
    select t.quest_id, t.id as main_thread_id
    from public.quest_threads t
    where t.campaign_id = p_campaign_id
      and (p_quest_id is null or t.quest_id = p_quest_id)
      and t.label = 'Main'
  ),
  -- The thread that actually walked into a beat, first. Asserts count — a
  -- beat recorded as already played is a real arrival. `seq`, not
  -- `created_at`: two transitions in one transaction share a timestamp.
  first_visit_thread as (
    select distinct on (tr.to_quest_id, tr.to_beat_id)
      tr.to_quest_id as quest_id, tr.to_beat_id as beat_id, tr.thread_id
    from public.quest_beat_transitions tr
    where tr.campaign_id = p_campaign_id
      and tr.thread_id is not null
      and tr.to_beat_id is not null
      and (p_quest_id is null or tr.to_quest_id = p_quest_id)
    order by tr.to_quest_id, tr.to_beat_id, tr.seq asc
  ),
  -- For a beat nobody has visited yet (revealed early, or rumoured ahead of
  -- the party), whichever live cursor can still reach it forward claims it.
  -- A waiting thread can still reach beyond its converge point; a closed or
  -- merged one reaches nowhere new.
  live_cursors as (
    select s.quest_id, s.thread_id, s.current_beat_id
    from public.quest_runtime_state s
    join public.quest_threads t on t.id = s.thread_id
    where s.campaign_id = p_campaign_id
      and (p_quest_id is null or s.quest_id = p_quest_id)
      and s.current_beat_id is not null
      and t.status in ('live', 'waiting')
  ),
  reach as (
    select lc.quest_id, lc.thread_id, lc.current_beat_id as beat_id, array[lc.current_beat_id] as seen
    from live_cursors lc
    union all
    select r.quest_id, r.thread_id, e.target_beat_id, r.seen || e.target_beat_id
    from reach r
    join public.quest_beat_edges e
      on e.source_beat_id = r.beat_id and e.quest_id = r.quest_id
    where not (e.target_beat_id = any(r.seen))
  ),
  -- Two live threads reaching the same beat: the senior one (oldest, Main
  -- when it qualifies) wins — deterministic, and keeps a foreshadowed beat
  -- out of a thread that only glimpses it from a spur.
  forward_thread as (
    select distinct on (r.quest_id, r.beat_id)
      r.quest_id, r.beat_id, r.thread_id
    from reach r
    join public.quest_threads t on t.id = r.thread_id
    order by r.quest_id, r.beat_id, t.created_at asc, t.id asc
  ),
  raw_assign as (
    select
      b.id as beat_id, b.quest_id,
      coalesce(fv.thread_id, ft.thread_id, mt.main_thread_id) as raw_thread_id
    from public.quest_beats b
    join scoped s on s.id = b.id
    left join first_visit_thread fv on fv.quest_id = b.quest_id and fv.beat_id = b.id
    left join forward_thread ft on ft.quest_id = b.quest_id and ft.beat_id = b.id
    left join main_threads mt on mt.quest_id = b.quest_id
    where b.visibility in ('rumored', 'revealed')
  ),
  -- A thread earns its own column once at least one beat assigned to it is
  -- revealed. All rumour or hidden means a layer opened in secret: it stays
  -- folded into Main until it says something the party has heard.
  earned_threads as (
    select distinct ra.quest_id, ra.raw_thread_id
    from raw_assign ra
    join public.quest_beats b on b.id = ra.beat_id
    where b.visibility = 'revealed' and ra.raw_thread_id is not null
  ),
  assign as (
    select
      ra.beat_id,
      case when et.raw_thread_id is not null then ra.raw_thread_id else mt.main_thread_id end as thread_id
    from raw_assign ra
    left join earned_threads et on et.quest_id = ra.quest_id and et.raw_thread_id = ra.raw_thread_id
    left join main_threads mt on mt.quest_id = ra.quest_id
  )

  select
    b.id,
    b.quest_id,
    b.campaign_id,
    b.visibility,
    b.kind,
    b.presentation_hint,
    case b.visibility when 'rumored' then b.rumor_text when 'revealed' then b.reveal_text end,
    coalesce(d.depth, 1000000)::integer,
    case when b.visibility = 'revealed' then coalesce((
      select jsonb_agg(safe.summary order by safe.sort_order, safe.created_at, safe.attachment_id)
      from (
        select a.id attachment_id, a.sort_order, a.created_at,
          jsonb_strip_nulls(jsonb_build_object(
            'attachment_id', a.id, 'type', qr.ref_type, 'ref_id', qr.ref_id,
            'role', nullif(a.role, '')
          )) summary
        from public.quest_beat_attachments a
        join public.quest_refs qr on qr.quest_id = a.quest_id and qr.is_player_visible and (
          (a.attachment_type = 'quest_ref' and qr.id::text = a.ref_id)
          or (a.attachment_type in ('encounter', 'npc', 'faction', 'item', 'monster')
            and qr.ref_type = a.attachment_type
            and qr.ref_id::text = a.ref_id)
        )
        where a.beat_id = b.id
      ) safe
    ), '[]'::jsonb) else '[]'::jsonb end,
    coalesce((
      select jsonb_agg(jsonb_build_object('visit_id', t.id, 'visited_at', t.created_at) order by t.created_at, t.id)
      from public.quest_beat_transitions t
      where t.campaign_id = b.campaign_id and t.to_quest_id = b.quest_id and t.to_beat_id = b.id
    ), '[]'::jsonb),
    b.updated_at,
    case when b.visibility = 'revealed' then b.staged_at_location_id end,
    a.thread_id,
    th.label,
    exists (
      select 1
      from public.quest_runtime_state s2
      join public.quest_threads t2 on t2.id = s2.thread_id
      where s2.campaign_id = b.campaign_id
        and s2.quest_id = b.quest_id
        and s2.current_beat_id = b.id
        and t2.status in ('live', 'waiting')
    ),
    case when b.visibility = 'revealed' then coalesce((
      select jsonb_agg(entry.item order by entry.item_group, entry.sort_at, entry.tiebreak)
      from (
        -- Knowledge the party learned here: journal entries a grant_knowledge
        -- rule wrote from an event on one of this beat's arrival transitions.
        select 1 as item_group, ev.created_at as sort_at, ev.id as tiebreak,
          jsonb_build_object('kind', 'knowledge', 'text', pje.content) as item
        from public.quest_consequence_events ev
        join public.quest_beat_transitions trx on trx.id = ev.transition_id
        join public.player_journal_entries pje on pje.id = ev.journal_entry_id
        where trx.campaign_id = b.campaign_id
          and trx.to_quest_id = b.quest_id
          and trx.to_beat_id = b.id
          and ev.journal_entry_id is not null

        union all

        -- Loot dispatched from this beat. Only dispatched rows: loot still
        -- held is DM prep, not yet part of the party's story. The delivery
        -- ladder collapses to the two states a player acts on.
        select 2, l.dispatched_at, l.id,
          jsonb_build_object(
            'kind', 'loot',
            'label', coalesce(nullif(l.label, ''), i.name, li.name, l.payload ->> 'loot_table_name', 'Loot'),
            'state', computed.state,
            'claimed_by', case when computed.state = 'claimed' then computed.claimed_by else null end,
            'message_id', l.dispatch_message_id
          )
        from public.loot_placements l
        left join public.items i on i.id = l.item_id
        left join public.library_items li on li.id = l.library_item_id
        left join public.campaign_messages m on m.id = l.dispatch_message_id
        cross join lateral (
          select
            case
              when m.id is null then 'claimed'
              when l.kind = 'item' and coalesce((m.metadata ->> 'quantity_remaining')::integer, l.quantity) <= 0 then 'claimed'
              when l.kind = 'currency' and m.metadata ->> 'claimed_by_user_id' is not null then 'claimed'
              when l.kind = 'loot_chest' and jsonb_array_length(coalesce(m.metadata -> 'claims', '[]'::jsonb)) >= coalesce((m.metadata ->> 'claims_total')::integer, 0) then 'claimed'
              else 'claimable'
            end as state,
            case
              when l.kind = 'currency' then m.metadata ->> 'claimed_by_name'
              else (
                select string_agg(distinct coalesce(claim ->> 'name', claim ->> 'claimed_by_name'), ', ')
                from jsonb_array_elements(coalesce(m.metadata -> 'claims', '[]'::jsonb)) claim
              )
            end as claimed_by
        ) computed
        where l.beat_id = b.id and l.dispatched_at is not null
      ) entry
    ), '[]'::jsonb) else '[]'::jsonb end
  from public.quest_beats b
  join scoped s on s.id = b.id
  left join depths d on d.beat_id = b.id
  left join assign a on a.beat_id = b.id
  left join public.quest_threads th on th.id = a.thread_id
  where b.visibility in ('rumored', 'revealed')
  order by 8, b.canvas_x, b.created_at, b.id;
end;
$function$;

-- ── 3. Encounter loot ───────────────────────────────────────────────────────
-- A list of item ids with no foreign key behind it, so the honest type for "a
-- vault uuid or a library id" is text. Nothing in SQL reads this column.
alter table public.encounters alter column item_ids drop default;
alter table public.encounters alter column item_ids type text[] using item_ids::text[];
alter table public.encounters alter column item_ids set default '{}'::text[];

-- ── 4. Downtime rewards ─────────────────────────────────────────────────────
-- `reward_id` was already polymorphic (npc, item, spell, quest, note, faction)
-- with no foreign key, so it widens to text rather than growing a parallel
-- library column per kind. Library spells benefit the same way items do.
alter table public.downtime_deck_backs alter column reward_id type text using reward_id::text;
alter table public.downtime_outcomes alter column reward_id type text using reward_id::text;

drop function public.resolve_downtime_draw(uuid, text, text, text, uuid, jsonb, uuid, jsonb);

create function public.resolve_downtime_draw(p_draw_id uuid, p_title text, p_vignette text, p_reward_type text, p_reward_id text, p_effects jsonb, p_back_id uuid, p_ai_provenance jsonb default null::jsonb)
 returns downtime_outcomes
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_draw downtime_draws;
  v_outcome downtime_outcomes;
begin
  select * into v_draw from downtime_draws where id = p_draw_id for update;
  if not found then
    raise exception 'Draw not found' using errcode = 'no_data_found';
  end if;

  -- Authorize against the draw's own campaign, not a caller-supplied one.
  if not private.is_campaign_dm(v_draw.campaign_id) then
    raise exception 'Only the DM may resolve a downtime draw'
      using errcode = 'insufficient_privilege';
  end if;

  if v_draw.status <> 'pending' then
    raise exception 'This draw is already %', v_draw.status
      using errcode = 'check_violation';
  end if;

  insert into downtime_outcomes (
    campaign_id, draw_id, title, vignette, reward_type, reward_id, proposed_effects, ai_provenance
  )
  values (
    v_draw.campaign_id, v_draw.id, p_title, p_vignette,
    p_reward_type, p_reward_id, coalesce(p_effects, '[]'::jsonb), p_ai_provenance
  )
  returning * into v_outcome;

  update downtime_draws
     set status = 'resolved', resolved_at = now()
   where id = v_draw.id;

  -- Recurring backs are never consumed; one-shots are stamped once.
  if p_back_id is not null then
    update downtime_deck_backs
       set consumed_at = now()
     where id = p_back_id
       and campaign_id = v_draw.campaign_id
       and is_recurring = false
       and consumed_at is null;
  end if;

  return v_outcome;
end;
$function$;

revoke all on function public.resolve_downtime_draw(uuid, text, text, text, text, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.resolve_downtime_draw(uuid, text, text, text, text, jsonb, uuid, jsonb) to authenticated, service_role;
