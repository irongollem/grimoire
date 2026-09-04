-- Sites and rooms, part one: manual sibling order, and a floor under what a
-- room may sit in. Story #783, epic #780.
--
-- A dungeon (or any site-tier place) gets a rooms panel, the way a store gets
-- an inventory panel. The rooms are ordinary `room`-typed child locations —
-- there is no new membership table, because `parent_id` already owns that fact
-- and a second writer for it is exactly the shape this epic exists to remove.
-- What rooms lacked was an *order*, and any guarantee at all about where they
-- may live.
--
-- This replaces the only prior notion of "a dungeon and its rooms":
-- `quest_beat_attachments.metadata.room_ids`, a flat jsonb id list with no
-- ordering, no state, and a validator that checked only that each id existed —
-- never that it was inside the root. That attachment is deleted by #797; this
-- migration deliberately does not reference it, because Phase 1 ships with no
-- quest-table references at all.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Manual sibling order
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.locations add column sort_order integer;

comment on column public.locations.sort_order is
  'Manual order among siblings. NULL means "no order claimed" and sorts last, '
  'so the whole Atlas keeps its existing name ordering until a DM arranges '
  'something. Siblings sort by tier, then sort_order (nulls last), then name. '
  'Deliberately not a display "number": a room shows its ordinal from its '
  'position, because a stored label sorts "10" before "2".';

-- Rearranging is not editing. `locations_updated_at` fires on a WHEN list of
-- content columns (20260529000002) and sort_order is deliberately absent from
-- it: reordering rooms must not bump "last edited", and must not invalidate the
-- location's embedding source hash.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. What may hold a room
-- ─────────────────────────────────────────────────────────────────────────────

-- Site tier (district, building, dungeon, wilderness) plus venue tier (store,
-- tavern, inn). The rooms *panel* is site-tier only — an inn does not need a
-- numbered map — but the *constraint* is wider on purpose: renting a room above
-- a tavern is an ordinary thing to model, and a check that rejects it would be
-- hit by a real DM at a real table. Where a panel appears and what the data
-- permits are different questions and must not share one predicate.
--
-- What this does forbid is the genuinely broken: a room inside another room, a
-- top-level room, and a room under any type not listed above — world, plane,
-- continent, region, country, city, town, village and `other`. Note `other`
-- specifically: it is the catch-all type, so a room may not sit under one, and
-- an existing row in that shape would become uneditable rather than merely
-- uncreatable. Production has none — 17 rooms, every one under a site — so
-- nothing is stranded, which is why this is the cheap moment to assert it.
--
-- Deliberately no NOT VALID and no backfill: existing rows are tested on their
-- next parent_id or location_type edit, which is the right trade when the table
-- already satisfies the rule.
create function private.location_can_hold_rooms(p_type public.location_type_enum)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- coalesce at the SOURCE, not at each call site. `select x in (...)` returns
  -- NULL for a NULL input, and this helper is consumed NEGATED below
  -- (`and not private.location_can_hold_rooms(...)`): `not NULL` is NULL, the
  -- `and` chain is NULL, the `if` never fires, and the guard is skipped. That
  -- is exactly the `is_app_admin()` shape CLAUDE.md item 3 describes, and it
  -- would be safe here only by accident, because `locations.location_type`
  -- happens to be NOT NULL — a guarantee living in a different object. Note the
  -- asymmetry that hides this class of bug: the affirmative call site inside
  -- the EXISTS below is safe either way.
  select coalesce(p_type in (
    'district', 'building', 'dungeon', 'wilderness',  -- site tier
    'store', 'tavern', 'inn'                          -- venue tier
  ), false);
$$;

comment on function private.location_can_hold_rooms(public.location_type_enum) is
  'Whether a location of this type may be a room''s parent. Lives in private '
  'so PostgREST cannot publish it as an RPC.';

create function public.guard_location_room_parent()
returns trigger
language plpgsql
set search_path = public, private
as $$
begin
  -- A room needs a parent that can hold it.
  if new.location_type = 'room' then
    if new.parent_id is null then
      raise exception 'A room must sit inside a place that can hold rooms; % has no parent', new.name
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.locations p
      where p.id = new.parent_id
        and private.location_can_hold_rooms(p.location_type)
    ) then
      raise exception 'A room must sit inside a district, building, dungeon, wilderness, store, tavern or inn'
        using errcode = '23514';
    end if;
  end if;

  -- And a place that already holds rooms may not become something that cannot.
  if tg_op = 'UPDATE'
     and old.location_type is distinct from new.location_type
     and not private.location_can_hold_rooms(new.location_type)
     and exists (
       select 1 from public.locations c
       where c.parent_id = new.id and c.location_type = 'room'
     )
  then
    raise exception '% holds rooms, so it cannot become a %', new.name, new.location_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Trigger functions are invoked by the trigger system, which bypasses the
-- EXECUTE check, so this never needs a grant — and keeping it ungranted keeps
-- it off the PostgREST RPC surface.
revoke execute on function public.guard_location_room_parent() from public, anon, authenticated;

create trigger locations_room_parent_guard
  before insert or update of parent_id, location_type
  on public.locations
  for each row execute procedure public.guard_location_room_parent();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Reordering
-- ─────────────────────────────────────────────────────────────────────────────

-- SECURITY INVOKER on purpose, following create_quest_beat_with_route: the
-- caller's own UPDATE policy on `locations` (owner AND campaign-DM, since
-- 20260828201935) is the authorization, so this adds nothing to the security
-- advisor's definer count and cannot drift away from the table's own rules.
--
-- RLS skips rows silently rather than raising, so a caller naming a location
-- they may not write would otherwise get a cheerful no-op. The row-count check
-- turns that into a rollback.
create function public.reorder_locations(p_ids uuid[], p_orders integer[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n      integer := coalesce(array_length(p_ids, 1), 0);
  v_done   integer;
  v_parent uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_n = 0 then
    return;
  end if;
  if array_length(p_orders, 1) is distinct from v_n then
    raise exception 'reorder_locations: ids and orders must be the same length';
  end if;

  -- One sibling set at a time, named IN FULL. Both halves are load-bearing, and
  -- the obvious spelling of each is wrong:
  --
  --   * `count(distinct parent_id) <> 1` ignores NULLs, so a set of top-level
  --     locations yields 0 and the call is refused — the Atlas root would be
  --     permanently unorderable. Hence the coalesce to a sentinel.
  --   * `count(*) <> v_n` only proves every named id exists and is visible. It
  --     says nothing about completeness, so naming 2 of 3 siblings passed both
  --     checks and produced exactly the duplicate positions the old comment
  --     claimed to prevent.
  select coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
    into v_parent
    from public.locations where id = p_ids[1];

  if v_parent is null then
    raise exception 'reorder_locations: no such location, or it is not yours';
  end if;

  if (select count(distinct coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
        from public.locations where id = any(p_ids)) <> 1
     or (select count(*) from public.locations where id = any(p_ids)) <> v_n
  then
    raise exception 'reorder_locations: every id must belong to one sibling set';
  end if;

  if (select count(*) from public.locations
       where coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_parent) <> v_n
  then
    raise exception 'reorder_locations: must name every sibling, not a subset';
  end if;

  update public.locations t
     set sort_order = d.ord
    from unnest(p_ids, p_orders) as d(id, ord)
   where t.id = d.id;

  get diagnostics v_done = row_count;
  if v_done <> v_n then
    raise exception 'Not authorized to reorder one or more of these locations'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.reorder_locations(uuid[], integer[]) from public, anon;
grant  execute on function public.reorder_locations(uuid[], integer[]) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Recreate the player projection
-- ─────────────────────────────────────────────────────────────────────────────

-- `get_player_visible_locations` returns `setof locations` and lists every
-- column positionally so it can null the DM-only ones, so widening the table
-- makes its list one short and it fails at call time with a return type
-- mismatch — in the player atlas, not the DM's. 20260818081308 says so in its
-- own header, having been the migration that learned it. This is the fifth
-- recreation; copied from that version with `sort_order` appended last, matching
-- the column order `alter table add column` just produced.
--
-- sort_order passes straight through rather than being nulled: it is the order
-- the DM arranged, and the player atlas should show a dungeon's rooms in the
-- same order the DM sees them. It leaks nothing — a player already sees which
-- rooms are shared with them.
create or replace function public.get_player_visible_locations(
  p_campaign_id uuid default null,
  p_location_id uuid default null
)
returns setof locations
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.user_id,
    l.campaign_id,
    l.parent_id,
    l.name,
    l.location_type,
    case when l.is_description_shared then l.description else null::text end,  -- full description (player_summary is the always-shown one)
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,             -- map_url gated by is_map_shared
    -- map_pins: keep only pins the DM marked visible_to_players
    coalesce((
      select jsonb_agg(pin)
      from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
      where coalesce((pin->>'visible_to_players')::boolean, false)
    ), '[]'::jsonb),
    l.is_map_shared,
    l.player_summary,
    l.is_description_shared,
    l.is_npcs_shared,
    l.player_visible_to,
    l.is_inventory_shared,
    l.npc_owner_id,
    l.related_location_ids,
    l.source_map_id,
    l.grid_calibration,
    l.is_battle_map,
    l.era_start,
    l.era_end,
    null::text,                                                               -- audio_theme (DM-only)
    l.ai_provenance,
    l.setting_source,
    l.sort_order
  from locations l
  where l.campaign_id is not null
    and (p_campaign_id is null or l.campaign_id = p_campaign_id)
    and (p_location_id is null or l.id = p_location_id)
    -- must be a member of the campaign …
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = l.campaign_id
    )
    -- … and either shared with this player, or (single-id mode) a shared map.
    and (
      exists (
        select 1 from campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = l.campaign_id
          and cm.party_member_id = any (l.player_visible_to)
      )
      or (p_location_id is not null and l.is_map_shared = true)
    )
$$;
