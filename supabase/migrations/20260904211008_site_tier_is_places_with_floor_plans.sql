-- A site is a place with a floor plan. Story #810, epic #780.
--
-- `private.location_can_hold_rooms` used to answer "site tier plus venue tier",
-- which was seven types, because the Atlas ladder it mirrored had grouped
-- district and wilderness with building and dungeon. That ladder was generated
-- rather than designed and claimed to encode *size*, which it never did:
-- `venue` encoded function (has an inventory), and wilderness has no scale at
-- all — Icewind Dale is a `wilderness` holding 9 villages and 4 regions, so the
-- scale rail read "Site, contains Settlement, Land".
--
-- #810 redefines a rung as *what kind of map a place has, and therefore how its
-- children are placed on it*. Geography (land, settlement, district) takes pins;
-- a place with a floor plan takes traced room regions. That makes the site tier
-- exactly the five types below, and a tavern is a building like any other.
--
-- ── This deletes a principle the previous migration stated, deliberately ─────
--
-- `20260904014714` argued that "where a panel appears and what the data permits
-- are different questions and must not share one predicate", and used that to
-- justify a constraint deliberately wider than the rooms panel: a room could
-- sit inside an inn even though an inn showed no panel, because "an inn does
-- not need a numbered map".
--
-- That is now false, and the owner overruled the judgement behind it: an inn is
-- a building, and a keyed tavern floorplan is in every published adventure. The
-- panel and the constraint are the same question again, and they agree by
-- construction — `isSiteType` in src/lib/locations/tiers.ts is this list. Do not
-- re-widen one without the other; if they diverge again, that is a bug, not the
-- earlier principle reasserting itself.

-- ── The helper ──────────────────────────────────────────────────────────────

-- The argument type is schema-qualified deliberately. An unqualified
-- `location_type_enum` resolves under the *session's* search_path at apply
-- time, not this function's `set search_path = ''` — so if it ever resolved
-- elsewhere, `create or replace` would quietly create a *second* overload
-- beside the old wide one, leaving the triggers bound to the original. That is
-- a silent revert wearing the costume of a successful migration.
create or replace function private.location_can_hold_rooms(p_type public.location_type_enum)
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
    'building', 'dungeon',        -- structures proper
    'store', 'tavern', 'inn'      -- also structures; a tavern has a floor plan
  ), false);
$$;

comment on function private.location_can_hold_rooms(public.location_type_enum) is
  'True for the site tier — the five location types that have a floor plan and '
  'therefore place their children by traced region rather than by pin. Mirrors '
  '`isSiteType` in src/lib/locations/tiers.ts; the two must not diverge (#810).';

-- ── The room-parent guard: message text only ────────────────────────────────
--
-- Rebuilt from the LIVE definition (`pg_get_functiondef`), not from the
-- migration that created it.
--
-- ── The guard now checks a *transition*, not a row ──────────────────────────
--
-- It used to re-validate the room's parent on every UPDATE, and that becomes a
-- data-stranding bug the moment the allowed set narrows — which is exactly what
-- this migration does. `UPDATE OF parent_id, location_type` fires when a column
-- is present in the SET list, **whether or not its value changed**, and
-- `LocationEditor.buildPayload()` sends both unconditionally on every save. So
-- the four production rooms that sit under a district or a wilderness would
-- have become uneditable: renaming one, retagging it, or sharing it with
-- players would raise 23514 on a value the DM never touched.
--
-- Re-checking an unchanged value punishes a DM for the schema's history. So the
-- room-parent check now runs on INSERT, and on UPDATE only when `parent_id` or
-- `location_type` actually moved. New and edited rows are held to the new rule;
-- rows that predate it stay editable, and correct themselves the moment anyone
-- re-parents them. `20260904014714` reasoned this way too ("existing rows are
-- tested on their next parent_id or location_type edit"), but its own wording
-- gave that away — under `UPDATE OF`, "edit" meant any save at all.
--
-- The four are named on #810 for the owner to retype; they are not migrated,
-- because a room under a district is either a mistyped parent or a mistyped
-- room and only the author knows which.

create or replace function public.guard_location_room_parent()
returns trigger
language plpgsql
set search_path = 'public', 'private'
as $$
begin
  -- A room needs a parent that can hold it — on insert, and on the edits that
  -- could actually break it. See the header: an unchanged value must not be
  -- re-judged against a rule that has since narrowed.
  if new.location_type = 'room'
     and (tg_op = 'INSERT'
          or old.parent_id is distinct from new.parent_id
          or old.location_type is distinct from new.location_type)
  then
    if new.parent_id is null then
      raise exception 'A room must sit inside a place that can hold rooms; % has no parent', new.name
        using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.locations p
      where p.id = new.parent_id
        and private.location_can_hold_rooms(p.location_type)
    ) then
      raise exception 'A room must sit inside a building, dungeon, store, tavern or inn'
        using errcode = '23514';
    end if;
  end if;

  -- And a place that already holds rooms — or carries traced regions — may not
  -- become something that can hold neither.
  --
  -- The regions half is new (#810). Without it an *unbound* region strands: the
  -- region guard fires only on insert and on rebinding, so retyping the site
  -- afterwards left a shape on a place with no floor plan — a row no screen can
  -- render, and one that is then partly frozen, since any later write touching
  -- `site_location_id` raises. Unbound is the normal mid-trace state ("draw the
  -- shapes, then say which room each one is"), so the gap sat precisely on the
  -- workflow the table exists for.
  --
  -- Known limit, stated rather than implied: this function is SECURITY INVOKER
  -- and `location_map_regions` is owner-scoped, so it cannot see regions traced
  -- by a *co-DM* on a site they do not own — which `location_map_regions_insert`
  -- does permit. Closing that would mean a SECURITY DEFINER trigger, and a
  -- definer earning its keep on an integrity check that already covers every
  -- single-owner case is a poor trade. The co-DM case strands as before.
  if tg_op = 'UPDATE'
     and old.location_type is distinct from new.location_type
     and not private.location_can_hold_rooms(new.location_type)
     and (
       exists (
         select 1 from public.locations c
         where c.parent_id = new.id and c.location_type = 'room'
       )
       or exists (
         select 1 from public.location_map_regions r
         where r.site_location_id = new.id
       )
     )
  then
    raise exception '% holds rooms or traced regions, so it cannot become a %', new.name, new.location_type
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ── Regions may only be drawn on a place that has a floor plan ──────────────
--
-- New check. Until now *any* location could own a `location_map_regions` row:
-- the guard only constrained the bound room, never the site the region is drawn
-- on. Nothing in the UI could produce such a row, which is precisely why it is
-- worth closing — the database permitted a state no screen can render, and the
-- table is empty in production, so the check is free today and a backfill
-- tomorrow.
--
-- Rebuilt from the live definition; the site check below is new, the parent
-- check is unchanged, and the type check is widened by #818 (edited in
-- place, same reasoning as the column rename it travels with -- see
-- 20260904142401) to admit a nested site alongside a room.

create or replace function public.guard_location_map_region_space()
returns trigger
language plpgsql
set search_path = 'public', 'private'
as $$
declare
  v_parent uuid;
  v_type   public.location_type_enum;
  v_site   public.location_type_enum;
begin
  select location_type into v_site
    from public.locations where id = new.site_location_id;

  if not private.location_can_hold_rooms(v_site) then
    raise exception 'Regions can only be traced on a place with a floor plan (building, dungeon, store, tavern or inn)'
      using errcode = '23514';
  end if;

  if new.space_location_id is null then
    return new;
  end if;

  select parent_id, location_type into v_parent, v_type
    from public.locations where id = new.space_location_id;

  -- #818: the bound child must itself be an addressable space -- a room, or
  -- a nested site with its own floor plan (a courtyard inside a dungeon, a
  -- shop's back room inside an inn). private.location_can_hold_rooms is the
  -- single site-tier predicate (see 20260904014714); do not re-list types
  -- here.
  if v_type is distinct from 'room' and not private.location_can_hold_rooms(v_type) then
    raise exception 'A map region can only be bound to a room or a nested site' using errcode = '23514';
  end if;

  if v_parent is distinct from new.site_location_id then
    raise exception 'A map region can only be bound to a space of the site it is drawn on'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Trigger functions are never reached through PostgREST, and the trigger system
-- bypasses the EXECUTE check, so keep both off the RPC surface.
revoke execute on function public.guard_location_room_parent() from public, anon, authenticated;
revoke execute on function public.guard_location_map_region_space() from public, anon, authenticated;
