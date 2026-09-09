-- A way out has a kind, may join any two spaces, and may cite the feature that
-- governs it. Epic #868, frames 03, 06 and 11 of `atlas/Sites & Cartographer.html`.
--
-- Three additions to `location_doors`, each closing a gap the site model left:
--
--   door_kind          A stair between Level 1 and Level 2 was inexpressible
--                      except as prose, and vertical connections are the single
--                      most common thing a dungeon has that the model did not.
--                      20260904061014 said "an enum of passage kinds is a
--                      taxonomy nobody asked for" -- and for *labels* that holds:
--                      `label` stays free text and is still what is read aloud.
--                      The kind is not read aloud; it is branched on, by the
--                      renderer (an arch draws thin, a stair draws as a stair)
--                      and by the levels rail (which lists the vertical ones).
--                      That is the difference between a label and a kind, and
--                      it is why one is prose and the other is a closed list.
--
--   source_edge_key    "14,6:W" in the map's own cell space, so a re-publish
--                      from the Cartographer updates the door it derived
--                      instead of duplicating it. Null for every hand-made
--                      door, forever.
--
--   dungeon_feature_id A "Secret Door" feature and a door with `is_secret` were
--                      the same fact in two catalogues, with the perception DC
--                      retyped into `lock_note` as prose. Three of the seven
--                      DUNGEON_FEATURE_TYPES -- Secret Door, Hidden Passage,
--                      Moving Wall -- *are* connections; the other four are not,
--                      so folding features into doors would be wrong for four
--                      of seven. A nullable FK is the honest shape: a door may
--                      cite a feature; a feature never requires a door.
--                      `on delete set null`, never cascade: deleting a catalogue
--                      fixture must not delete a connection in someone's dungeon.
--
-- And the endpoint guard widens from "two rooms sharing a parent" to "two
-- *bindable spaces* sharing a parent" -- a room, or a nested site with its own
-- floor plan. A level is a sibling site, so the rule already fits; it is the
-- same predicate #818 already lets a region bind (`bindableSpaces` in
-- tiers.ts, `private.location_can_hold_rooms` here).
--
-- Still authored state only. `starts_locked` and `is_secret` keep meaning what
-- the DM prepared. Whether the party has since opened or found it is play
-- state, and 20260908215644 gives that its home in the append-only log.

alter table public.location_doors
  add column door_kind text not null default 'door'
    constraint location_doors_kind_check
      check (door_kind in ('door', 'arch', 'stair', 'shaft', 'portal')),
  add column source_edge_key text
    constraint location_doors_edge_key_format
      check (source_edge_key is null or source_edge_key ~ '^-?[0-9]+,-?[0-9]+:[NW]$'),
  add column dungeon_feature_id uuid
    references public.dungeon_features(id) on delete set null;

comment on column public.location_doors.door_kind is
  'door | arch | stair | shaft | portal. Branched on by the renderer and the levels rail; `label` remains the free text that is read aloud.';
comment on column public.location_doors.source_edge_key is
  'The Cartographer edge this door was derived from ("x,y:N" / "x,y:W", NW ownership). Reconciles a re-publish; null for every hand-made door.';
comment on column public.location_doors.dungeon_feature_id is
  'The Secret Door / Hidden Passage / Moving Wall that conceals or opens this way out. Its perception_dc, investigation_dc and trigger_type are read from there, never retyped.';

-- One derived door per edge, per originating space. The publish matches by
-- edge key across the whole site on the client; this is the safety net.
create unique index location_doors_source_edge_uniq
  on public.location_doors (from_location_id, source_edge_key)
  where source_edge_key is not null;

create index location_doors_feature_idx
  on public.location_doors (dungeon_feature_id)
  where dungeon_feature_id is not null;

-- ── The endpoint guard, widened ─────────────────────────────────────────────
create or replace function public.guard_location_door_endpoints()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_from_parent uuid;
  v_to_parent   uuid;
  v_from_type   public.location_type_enum;
  v_to_type     public.location_type_enum;
begin
  select parent_id, location_type into v_from_parent, v_from_type
    from public.locations where id = new.from_location_id;
  select parent_id, location_type into v_to_parent, v_to_type
    from public.locations where id = new.to_location_id;

  -- #868: both ends must be bindable spaces -- a room, or a site with its own
  -- floor plan. `private.location_can_hold_rooms` is the single site-tier
  -- predicate; do not re-list types here. Coalesced at the source, so a
  -- missing row (NULL type) denies rather than answering NULL.
  if not (coalesce(v_from_type = 'room', false) or private.location_can_hold_rooms(v_from_type))
     or not (coalesce(v_to_type = 'room', false) or private.location_can_hold_rooms(v_to_type)) then
    raise exception 'A way out connects two spaces: rooms, or nested sites with a floor plan'
      using errcode = '23514';
  end if;

  if v_from_parent is null or v_from_parent is distinct from v_to_parent then
    raise exception 'A way out connects two spaces inside the same place'
      using errcode = '23514';
  end if;

  -- The governing feature, when cited, must be the author's own. The RLS
  -- insert policy checks only the originating location, and a feature id
  -- is otherwise a free uuid.
  if new.dungeon_feature_id is not null and not exists (
    select 1 from public.dungeon_features f
     where f.id = new.dungeon_feature_id
       and f.user_id = (select auth.uid())
  ) then
    raise exception 'A way out may only cite a dungeon feature you authored'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_location_door_endpoints() from public, anon, authenticated;

drop trigger if exists location_doors_endpoint_guard on public.location_doors;
create trigger location_doors_endpoint_guard
  before insert or update of from_location_id, to_location_id, dungeon_feature_id
  on public.location_doors
  for each row execute procedure public.guard_location_door_endpoints();
