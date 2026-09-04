-- Clickable rooms on a site's map. Story #784, epic #780.
--
-- The design this implements has two layers, either of which may be absent:
--
--   image      the picture of this place: `locations.map_url` — a Cartographer
--              bake, an uploaded scan, a photo of a hand-drawn page. There is
--              no second image column; see the note below.
--   regions    cell-sets bound to `room` locations — click a room, get that room
--
-- AMENDED by #805, before any of this reached production. This header
-- originally described a third layer between those two — the `dungeon_maps`
-- construct behind `locations.source_map_id`, rendered live over the picture —
-- and called it "the point". It was not, and it has been deleted.
--
-- `map_url` and `source_map_id` are written together by Save to Atlas, so the
-- bake already *is* the render: drawing the tiles over their own bake shows
-- the same picture, except when the map was edited without re-baking, and the
-- answer to that is re-baking. What makes this more than "trace shapes on a
-- picture" is the Cartographer's cell *data* — `CellMetadata` holds trap_id,
-- feature_id, encounter_id, note_id and both spawn arrays, authored since the
-- tool shipped and read by nothing at runtime — which #789 reads by matching
-- cell keys. That never needed a second renderer in the Atlas.
--
-- The cells themselves are anchored to the image through
-- `locations.grid_calibration` (#805). They were briefly anchored to the
-- bounding box of whatever had been traced, which meant tracing a shape
-- resized the space the shape was traced in.

-- ── No separate underlay column ────────────────────────────────────────────
--
-- An earlier draft of this migration added `locations.underlay_url` for "a
-- scanned page to trace over". That was a second answer to a question
-- `locations` already answers: `map_url` IS the image of this place, whatever
-- it is — a Cartographer bake, an uploaded scan, a photo — and `is_map_shared`
-- already decides whether players see it.
--
-- Two image columns meant the site panel reported "no map yet" on a location
-- that plainly had one, because it looked only at its own field. Regions
-- therefore overlay `map_url` (or the live `dungeon_maps` construct behind
-- `source_map_id` when there is one), and nothing new is stored for the image.

-- ── Regions ─────────────────────────────────────────────────────────────────
--
-- The binding is relational; the geometry is not. A region points at a room
-- with a real foreign key and a real cascade, while the cells it covers are
-- genuinely shaped data and live in jsonb. That split is the same one
-- location_placements makes, and it is deliberately NOT the shape of
-- `quest_beat_attachments.metadata.room_ids` -- an unenforceable id list inside
-- a blob, which this epic is deleting.
create table public.location_map_regions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- The site this region is drawn on. Required even when a room is bound,
  -- because a region may exist *before* it is bound to anything: you trace the
  -- shapes off the page first, then say which room each one is.
  site_location_id uuid not null references public.locations(id) on delete cascade,

  -- Null while unbound. The canvas shows it as "Region 5" until it is named.
  room_location_id uuid references public.locations(id) on delete cascade,

  -- Cell keys from the Cartographer's own coordinate space (`cellKey` in
  -- types/dungeonMap.types.ts). An array of strings; shaped data, not a
  -- relationship, so jsonb is right here in a way it is not for the binding.
  cells            jsonb not null default '[]'::jsonb,

  -- Only meaningful while unbound; a bound region takes its name from its room.
  label            text,
  sort_order       integer,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint location_map_regions_cells_array check (jsonb_typeof(cells) = 'array')
);

comment on table public.location_map_regions is
  'A shape on a site''s map bound to one of its rooms. Binding is a real FK; the geometry is jsonb because a shape is shaped data. Unbound regions are allowed -- you trace first and name second.';

create index location_map_regions_site_idx on public.location_map_regions (site_location_id);
create index location_map_regions_room_idx on public.location_map_regions (room_location_id)
  where room_location_id is not null;

-- One region per room. Two shapes claiming the same room is always a mistake;
-- two unbound shapes are the normal state while tracing, so the index is
-- partial.
create unique index location_map_regions_room_uniq
  on public.location_map_regions (room_location_id)
  where room_location_id is not null;

create trigger location_map_regions_updated_at
  before update on public.location_map_regions
  for each row execute procedure update_updated_at();

-- A bound region's room must actually be a room of that site. Without this the
-- binding is an id pair nothing checks, which is exactly the hole
-- metadata.room_ids left by validating only that an id existed.
create function public.guard_location_map_region_room()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_parent uuid;
  v_type   public.location_type_enum;
begin
  if new.room_location_id is null then
    return new;
  end if;

  select parent_id, location_type into v_parent, v_type
    from public.locations where id = new.room_location_id;

  if v_type is distinct from 'room' then
    raise exception 'A map region can only be bound to a room' using errcode = '23514';
  end if;

  if v_parent is distinct from new.site_location_id then
    raise exception 'A map region can only be bound to a room of the site it is drawn on'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_location_map_region_room() from public, anon, authenticated;

create trigger location_map_regions_room_guard
  before insert or update of room_location_id, site_location_id
  on public.location_map_regions
  for each row execute procedure public.guard_location_map_region_room();

alter table public.location_map_regions enable row level security;

-- Same live shape as location_placements and location_doors: owner-scoped read
-- and write, and creating one additionally requires being DM of the campaign
-- the site belongs to. No campaign_id column -- `locations` owns that fact.
create policy "location_map_regions_select" on public.location_map_regions
  for select using ((select auth.uid()) = user_id);

create policy "location_map_regions_insert" on public.location_map_regions
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.locations l
      where l.id = site_location_id
        and (l.campaign_id is null or private.is_campaign_dm(l.campaign_id))
    )
  );


-- `with check` is not optional here, and its absence is the exact hole
-- 20260828210805 exists to close. Without it Postgres reuses USING as the
-- check, which pins `user_id` but leaves the location pointer free — so a user
-- who cannot INSERT against someone else's site can still create a row on their
-- own and then UPDATE it to point there. The tables this migration says it
-- mirrors (`puzzle_rooms`, `traps`) both carry the check; they key it on their
-- own `campaign_id` column, which these tables deliberately do not have, so it
-- is restated here as the same join the INSERT policy uses.
create policy "location_map_regions_update" on public.location_map_regions
  for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.locations l
      where l.id = site_location_id
        and (l.campaign_id is null or private.is_campaign_dm(l.campaign_id))
    )
  );

create policy "location_map_regions_delete" on public.location_map_regions
  for delete using ((select auth.uid()) = user_id);

-- No projection recreate: `locations` gains no column here, so
-- `get_player_visible_locations` still matches the rowtype it was last built
-- against (20260904014714, for `sort_order`).
