-- A region has a role. Epic #868, frames 07 (Zones), 09 (Data model) and
-- 12 (Tracing) of `atlas/Sites & Cartographer.html`.
--
-- Until now a `location_map_regions` row was either bound to a space or
-- "traced but not yet named", and that single ambiguity is why terrain,
-- darkness and triggers ended up as prose in a room's description: there was
-- no way to draw a shape on the plan that was deliberately *not* a room. A
-- zone is the same geometry with a role, and it is the cheapest way to make a
-- plan interactive without building a VTT.
--
-- Why a role column and not a second table. The geometry, the cell space, the
-- calibration, the drag-to-trace canvas, the RLS and the guard trigger are all
-- already built for regions. A parallel `location_map_zones` table would
-- duplicate every one of them so the two could disagree about the same map.
-- Widening the guard to "a space region binds; a zone region must not" is four
-- lines, and it turns the null column from ambiguous into meaningful: an
-- unbound *space* is unfinished, an unbound *zone* is finished.
--
-- Three more columns arrive with the publish (#868 S3/S10): provenance, so a
-- re-publish from the Cartographer can tell a region it derived from one the
-- DM has since touched; a cell signature, so "the Cistern shifted one east" is
-- recognised as the same room rather than one deletion plus one creation; and
-- `vertices`, the pen tool's ring, because `cells` is a set of squares by
-- construction and cannot express a diagonal.

-- ── The role ────────────────────────────────────────────────────────────────
alter table public.location_map_regions
  add column region_role text not null default 'space'
    constraint location_map_regions_role_check check (region_role in ('space', 'zone')),
  -- A short, closed list for the same reason `hazard_glyph` is one: the
  -- renderer must be able to draw any value, whatever pack is loaded.
  add column zone_kind text
    constraint location_map_regions_zone_kind_check
      check (zone_kind is null or zone_kind in ('terrain', 'hazard', 'light', 'trigger', 'marker')),
  -- Movement cost, depth, light level, trap_id, encounter_id, beat_id,
  -- visible_to_players. Shaped data in jsonb; ids that must not dangle would
  -- be real columns, but these are hints the renderer and the run surface
  -- read, never joins the database enforces -- the same split the region
  -- already makes between `cells` and `space_location_id`.
  add column zone_payload jsonb not null default '{}'::jsonb
    constraint location_map_regions_zone_payload_object check (jsonb_typeof(zone_payload) = 'object'),
  -- A zone has a kind; a space has none. Enforced as one biconditional so a
  -- row cannot be a zone of no kind or a space that claims one.
  add constraint location_map_regions_zone_kind_iff_zone
    check ((region_role = 'zone') = (zone_kind is not null));

-- ── Provenance and identity across publishes ────────────────────────────────
alter table public.location_map_regions
  -- 'dm' is the default and the terminal state: anything the DM has touched
  -- reads 'dm' and is never overwritten by a re-publish, only offered.
  add column derived_from text not null default 'dm'
    constraint location_map_regions_derived_from_check
      check (derived_from in ('dm', 'floodfill', 'annotation')),
  -- A stable hash of the derived cell set, written by the publish. Null for
  -- every hand-traced region, forever.
  add column cell_signature text,
  -- An ordered ring of grid points in the map's own coordinate space, halves
  -- allowed. Null = a painted region, exactly what every region was before
  -- this. Set = `cells` is DERIVED (every cell whose centre falls inside the
  -- ring) and cached, so everything downstream keeps asking "which cells?"
  -- and always gets an answer.
  add column vertices jsonb
    constraint location_map_regions_vertices_array
      check (vertices is null or jsonb_typeof(vertices) = 'array');

comment on column public.location_map_regions.region_role is
  'space = binds to a room or nested site (today''s region). zone = terrain, hazard, light, trigger or marker; binds to nothing by rule.';
comment on column public.location_map_regions.zone_payload is
  'Zone hints: movement_cost, depth_ft, light_level, trap_id, encounter_id, beat_id, visible_to_players. Read by the renderer and the run surface; never enforced.';
comment on column public.location_map_regions.derived_from is
  'Who last shaped this region: dm (never overwritten by a re-publish), floodfill or annotation (the Cartographer publish may update it).';
comment on column public.location_map_regions.vertices is
  'Pen-tool ring of [x, y] grid points (halves allowed). When set, cells is derived from it.';

-- ── The guard, widened ──────────────────────────────────────────────────────
--
-- Today: the bound space must be a child of this site and must be a room or
-- something location_can_hold_rooms admits. Added: a zone must bind nothing.
-- A space keeps the existing rule unchanged. The database stays the
-- authority; the UI only avoids offering what it will refuse.
create or replace function public.guard_location_map_region_space()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_parent uuid;
  v_type   public.location_type_enum;
  v_site   public.location_type_enum;
begin
  select location_type into v_site
    from public.locations where id = new.site_location_id;

  if not private.location_can_hold_rooms(v_site) then
    raise exception 'Regions can only be traced on a place with a floor plan (building, dungeon, grounds, store, tavern or inn)'
      using errcode = '23514';
  end if;

  -- #868: a zone is not a room. It belongs to the plan, not to a space -- an
  -- ash-fall that straddles the nave and the corridor is one zone, not two --
  -- so it never binds, and "unbound" stops being ambiguous.
  if new.region_role = 'zone' and new.space_location_id is not null then
    raise exception 'A zone binds to nothing; only a space region may be bound to a location'
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

  -- ...and not to a space belonging to another campaign (#827). Redundant with
  -- the parent rule today, because a space must already be a child of the site
  -- -- but the two guards fire on different tables and different columns, and
  -- the read path this protects (get_player_visible_site_state) trusts the pair
  -- rather than the chain. Cheap, and it fails closed if the parent rule is
  -- ever relaxed.
  if exists (
    select 1
      from public.locations space, public.locations site
     where space.id = new.space_location_id
       and site.id = new.site_location_id
       and space.campaign_id is not null
       and site.campaign_id is not null
       and space.campaign_id <> site.campaign_id
  ) then
    raise exception 'A map region cannot bind a space from another campaign'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_location_map_region_space() from public, anon, authenticated;

-- The trigger must also fire when a bound space's role is flipped to zone,
-- which the old column list did not cover.
drop trigger if exists location_map_regions_space_guard on public.location_map_regions;
create trigger location_map_regions_space_guard
  before insert or update of space_location_id, site_location_id, region_role
  on public.location_map_regions
  for each row execute procedure public.guard_location_map_region_space();

-- The publish looks regions up by signature within one site; a hand-traced
-- region has none, so the index is partial.
create index location_map_regions_signature_idx
  on public.location_map_regions (site_location_id, cell_signature)
  where cell_signature is not null;
