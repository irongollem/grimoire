-- A room holds loot the way a beat does. Story #830.
--
-- A beat can drop loot: `quest_beat_loot` holds it, `dispatch_quest_beat_loot`
-- mints a chat message, the party claims from it. A site room could not. A room
-- reached loot only through `location_placements`, whose CHECK stores a
-- *reference* to a loot table — the DM navigates away to `/loot-tables/:id` and
-- rolls it there. Nothing drops, nothing is recorded, and #787 gave rooms a
-- durable `looted` fact with nothing to say what came out.
--
-- So the gap was never "rooms have no loot concept". It was that **a room's
-- loot was a bookmark and a beat's loot was an event**.
--
-- ── Why this is one table keyed by *where*, not a second room table ─────────
--
-- The placement is the *recipe*; the holding is the *dish*. `location_placements`
-- keeps pointing at a loot table (a room that can be re-rolled), and the rolled
-- result is held here exactly as a beat's is. One table, one dispatch verb, one
-- set of chat message types — because two mechanisms for one fact is what epic
-- #780 exists to undo, and a parallel `location_loot` would be one on day one.
--
-- ── Why loot did NOT become a consequence action ────────────────────────────
--
-- The obvious alternative was to fold loot into `quest_consequences` — one
-- engine for everything a beat does. Rejected on three measurable differences,
-- and it is worth recording so nobody "unifies" them later:
--
--   * **Who fires it.** A consequence fires from the engine on arrival, edge,
--     objective status or +N days. Loot fires from a *human*, at a moment the
--     graph cannot see: after the fight, after the search.
--   * **How often.** `apply_quest_consequences` guards on transition id, so a
--     rule fires once *per transition* — re-enter a beat by `jump` and it fires
--     again. Correct for "the cult notices", catastrophic for "drop the +1
--     sword", which must fire once *ever*.
--   * **Whether the runtime is needed.** `quest_consequence_events.transition_id`
--     is NOT NULL. `dispatch_quest_beat_loot` checks only `is_campaign_dm`, so a
--     DM can drop loot with no cursor at all.
--
-- The tell that the split is real rather than arbitrary: those three axes put a
-- *room's* loot on the loot side without being asked to — a human dispenses it,
-- once, with no quest cursor. A room has no `quest_id`, no quest-scoped RLS and
-- no visit stack, so routing it through the engine would have meant a nullable
-- `quest_id` there, `on_location_arrival` conditions and a second undo model.
--
-- The better verbs are **holds** and **does**. A beat *holds* loot the way a
-- chest does. A beat *does* consequences. Do not build a combined "Outcomes"
-- surface over the two: a single heading is exactly how the next reader notices
-- loot is missing from the action enum and adds `drop_loot` for consistency.

-- ── 1. The table becomes what it always was: a loot placement ───────────────
--
-- Rename rather than create-and-copy: the production rows keep their ids, their
-- dispatched provenance and their `campaign_messages` links untouched. Policies
-- and indexes follow the table by OID.

alter table public.quest_beat_loot rename to loot_placements;

alter index if exists quest_beat_loot_pkey rename to loot_placements_pkey;
alter index if exists quest_beat_loot_quest_idx rename to loot_placements_quest_idx;
alter index if exists quest_beat_loot_dispatch_message_key rename to loot_placements_dispatch_message_key;

alter policy quest_beat_loot_dm_select on public.loot_placements rename to loot_placements_dm_select;
alter policy quest_beat_loot_dm_insert on public.loot_placements rename to loot_placements_dm_insert;
alter policy quest_beat_loot_dm_update on public.loot_placements rename to loot_placements_dm_update;
alter policy quest_beat_loot_dm_delete_held on public.loot_placements rename to loot_placements_dm_delete_held;

-- Every policy is `private.is_campaign_dm(campaign_id)` and none mentions
-- `quest_id`, so a location-homed row with a null quest is already governed
-- correctly. That is why this story is a column change rather than an RLS
-- rewrite — verified before relying on it.

-- ── 2. A placement has exactly one home ─────────────────────────────────────

alter table public.loot_placements
  alter column beat_id drop not null,
  alter column quest_id drop not null,
  add column if not exists location_id uuid;

alter table public.loot_placements
  drop constraint if exists loot_placements_one_home,
  add constraint loot_placements_one_home check (num_nonnulls(beat_id, location_id) = 1),
  drop constraint if exists loot_placements_beat_pair,
  add constraint loot_placements_beat_pair check ((beat_id is null) = (quest_id is null));

-- The existing composite FK `(beat_id, quest_id, campaign_id)` → `quest_beats`
-- needs no change and is not dropped: MATCH SIMPLE leaves a row unchecked when
-- any of its columns is null, so a location home passes it trivially while a
-- beat home keeps the full three-column integrity guard it has today.
--
-- The location home gets the *same* strength rather than a check inside the
-- validator, and that is a correctness fix rather than symmetry for its own
-- sake. A trigger only fires when the loot row is written; the room can move out
-- from under it afterwards (`locations.campaign_id` is nullable and its owner
-- may legitimately clear it), and the mismatch would then surface at drop time
-- as "Location belongs to a different campaign" — naming a mismatch the DM
-- cannot see from the loot UI, for loot that was valid when they placed it.
--
-- As an FK the failure moves to the moment someone tries to move a room that
-- has loot on it, where it is legible. MATCH SIMPLE skips it for beat-homed
-- rows exactly as the beat FK is skipped for location-homed ones.

create unique index if not exists locations_id_campaign_key
  on public.locations (id, campaign_id);

alter table public.loot_placements
  drop constraint if exists loot_placements_location_fkey,
  add constraint loot_placements_location_fkey
    foreign key (location_id, campaign_id)
    references public.locations (id, campaign_id)
    on delete cascade;

create index if not exists loot_placements_location_idx
  on public.loot_placements (location_id, sort_order)
  where location_id is not null;

-- Note the cascade, which is accepted rather than overlooked: deleting a room
-- removes loot hanging on it, dispatched rows included, leaving a chat message
-- pointing at an entry id that no longer resolves. The beat FK has always
-- behaved this way, so this matches precedent — but rooms are deleted far more
-- casually than quest beats, so if this bites, the fix is to restrict the room
-- delete while dispatched loot hangs on it. `on delete set null` is not
-- available: the one-home CHECK forbids a row with neither home.

comment on column public.loot_placements.location_id is
  'The room that holds this loot (#830), exclusive with beat_id. A location '
  'home carries no quest: it is dispensed by a DM standing in a room, not by '
  'the quest runtime.';

-- A room's loot most often comes from rolling the table the room references
-- through `location_placements`, and that provenance is worth keeping.
alter table public.loot_placements
  drop constraint if exists quest_beat_loot_source_type_check,
  add constraint loot_placements_source_type_check check (
    source_type in ('prepared', 'quest_reward', 'encounter_loot', 'loot_table')
  );

-- ── 3. Validation learns about the second home ──────────────────────────────
--
-- Renamed with the table. The item/currency/chest shape rules and the
-- dispatched-provenance immutability guard are carried over verbatim; what is
-- new is the location campaign check and `location_id` joining the immutable
-- set.

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
  if new.kind = 'item'
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

revoke execute on function private.validate_loot_placement() from public, anon, authenticated;

drop trigger if exists validate_quest_beat_loot on public.loot_placements;
drop trigger if exists validate_loot_placement on public.loot_placements;
create trigger validate_loot_placement
  before insert or update on public.loot_placements
  for each row execute procedure private.validate_loot_placement();

drop function if exists private.validate_quest_beat_loot();

-- ── 4. One dispatch verb, whatever the home ────────────────────────────────
--
-- `dispatch_quest_beat_loot(p_beat_id, p_entry_id)` authorised through the
-- *beat*, which a room does not have. Taking entry ids instead makes the
-- function home-agnostic and authorises uniformly on each row's own
-- `campaign_id` — the column every RLS policy on this table already uses.
--
-- The message bodies and the three `campaign_messages` types are unchanged, so
-- `LOOT_MESSAGE_TYPES` / `isLootMessageEvent` (campaignRealtimeSystems.ts) keep
-- working untouched. A dispatched entry returns its existing message rather
-- than minting a second one — loot fires once ever.

create or replace function public.dispatch_loot(p_entry_ids uuid[])
returns table(loot_entry_id uuid, message_id uuid, delivery_state text)
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_entry public.loot_placements;
  v_item public.items;
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
      select * into v_item from public.items i where i.id = v_entry.item_id;
      if v_item is null then
        raise exception 'Prepared item % no longer exists', v_entry.item_id;
      end if;
      v_metadata := v_metadata || jsonb_build_object(
        'item_id', v_item.id,
        'item_name', v_item.name,
        'item_rarity', v_item.rarity,
        'quantity', v_entry.quantity,
        'quantity_remaining', v_entry.quantity,
        'claims', '[]'::jsonb,
        'image_url', case when v_item.rarity = 'mundane' then v_item.image_url else v_item.mundane_image_url end,
        'description', null,
        'is_container', 'container' = any(v_item.tags),
        'claimed_by_user_id', null,
        'claimed_by_name', null,
        'claimed_party_member_id', null
      );
      v_message := 'dropped ' || case when v_entry.quantity > 1 then v_entry.quantity || 'x ' else '' end || v_item.name;
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

revoke execute on function public.dispatch_loot(uuid[]) from public, anon;
grant execute on function public.dispatch_loot(uuid[]) to authenticated, service_role;

drop function if exists public.dispatch_quest_beat_loot(uuid, uuid);

-- ── 5. Reading placements, whichever home they hang on ─────────────────────
--
-- Same projection as `get_quest_beat_loot` — the delivery-state ladder, the
-- claim rollup and the this-session flag are unchanged — with `location_id`
-- added to the row and an optional location filter beside the quest one. Both
-- filters are `is null or =`, so a caller can ask for a quest's loot, a room's
-- loot, or the whole campaign's.

create or replace function public.get_loot_placements(
  p_campaign_id uuid,
  p_quest_id uuid default null,
  p_location_id uuid default null
)
returns table(
  id uuid, beat_id uuid, quest_id uuid, location_id uuid, campaign_id uuid, kind text,
  item_id uuid, quantity integer, label text, payload jsonb, source_type text, source_id uuid,
  sort_order integer, dispatch_message_id uuid, dispatched_at timestamp with time zone,
  delivery_state text, quantity_remaining integer, claimed_by_names text[], handed_out_this_session boolean
)
language sql
stable
security definer
set search_path to 'public', 'private'
as $function$
  with current_session as (
    select max(t.created_at) as started_at
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id and t.transition_kind = 'enter'
  )
  select
    l.id, l.beat_id, l.quest_id, l.location_id, l.campaign_id, l.kind, l.item_id,
    l.quantity, coalesce(nullif(l.label, ''), i.name, l.payload->>'loot_table_name', 'Loot'),
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
  left join public.campaign_messages m on m.id = l.dispatch_message_id
  cross join current_session
  where l.campaign_id = p_campaign_id
    and (p_quest_id is null or l.quest_id = p_quest_id)
    and (p_location_id is null or l.location_id = p_location_id)
    and private.is_campaign_dm(p_campaign_id)
  order by l.beat_id nulls last, l.location_id nulls last, l.sort_order, l.created_at, l.id;
$function$;

revoke execute on function public.get_loot_placements(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_loot_placements(uuid, uuid, uuid) to authenticated, service_role;

drop function if exists public.get_quest_beat_loot(uuid, uuid);

comment on table public.loot_placements is
  'Loot a beat or a room *holds*, until a DM drops it to chat (#830). Renamed '
  'from quest_beat_loot when rooms gained the same verb. Distinct from '
  'quest_consequences, which is what a beat *does*: a consequence fires from '
  'the engine once per transition and needs a runtime cursor; loot fires from a '
  'human once ever and needs none. Do not merge them.';

-- ── 6. A comment that would now mislead ────────────────────────────────────
--
-- `get_player_visible_quests` explains, correctly, that loot reaches players
-- through the beat that grants it rather than the quest header — and names the
-- table. After the rename that name is wrong, and a stale name inside a function
-- body is worse than none: the next reader greps for it and finds nothing.
-- Re-declared for one line of prose, which is cheap at 36 lines and is the
-- deletion-manifest discipline this epic keeps returning to.

CREATE OR REPLACE FUNCTION public.get_player_visible_quests(p_campaign_id uuid DEFAULT NULL::uuid, p_quest_id uuid DEFAULT NULL::uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF quests
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_preview_party_member_id is not null and not exists (
    select 1 from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then raise exception 'Preview audience is not available to this DM'; end if;

  -- Column list narrowed by #799. A SETOF quests projection cannot name a
  -- column that no longer exists, and the quest-level payout fields are dropped
  -- below: loot is an event, so it reaches players through the beat that grants
  -- it (loot_placements, renamed from quest_beat_loot by #830 when rooms
  -- gained the same verb), not through the quest header.
  return query select
    q.id, q.user_id, q.campaign_id, q.parent_quest_id, q.title, q.summary,
    q.status, q.giver_npc_id, q.location_id, q.tags,
    q.started_at, q.resolved_at, q.created_at, q.updated_at,
    q.player_visible_to, q.ai_provenance
  from public.quests q
  where q.campaign_id is not null
    and (p_campaign_id is null or q.campaign_id = p_campaign_id)
    and (p_quest_id is null or q.id = p_quest_id)
    and case
      when p_preview_party_member_id is null then private.is_quest_player_visible(q.id)
      else p_preview_party_member_id = any(q.player_visible_to)
        and coalesce(private.is_campaign_dm(q.campaign_id), false)
    end;
end;
$function$;
