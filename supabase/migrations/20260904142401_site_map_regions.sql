-- Clickable rooms on a site's map. Story #784, epic #780.
--
-- The design this implements has three layers, any of which may be absent:
--
--   underlay   a static image: a scanned module page, a photo of a hand-drawn map
--   map        a LIVE dungeon_maps construct, rendered from its `layers`
--   regions    cell-sets bound to `room` locations — click a room, get that room
--
-- The middle layer is the point, and is why this is not just "trace shapes on a
-- picture": the Cartographer map is a construct with cells that already carry
-- meaning (`CellMetadata` holds trap_id, feature_id, encounter_id, note_id and
-- both spawn arrays, authored since the tool shipped and read by nothing at
-- runtime). `renderMap()` in src/cartographer/renderMap.ts is a pure function
-- with no Vue or DOM imports, so the Atlas can render the same construct
-- read-only. That is a third consumer of a pure engine, not a merge of the
-- authoring tool with the encounter runner — CLAUDE.md forbids the latter and
-- this does not do it.

-- ── The underlay ────────────────────────────────────────────────────────────
--
-- Deliberately NOT `map_url`. The two have different lifetimes: you keep the
-- scan when you redraw the map over it, and you may have either without the
-- other. One column cannot hold both without one of them being destroyed the
-- first time the other changes.
alter table public.locations add column underlay_url text;

comment on column public.locations.underlay_url is
  'A static reference image beneath the map: a scanned page, a photo. DM-only '
  'and never projected to players -- see the player projection below. Distinct '
  'from map_url, which is the drawn map and may be shared.';

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

create policy "location_map_regions_update" on public.location_map_regions
  for update using ((select auth.uid()) = user_id);

create policy "location_map_regions_delete" on public.location_map_regions
  for delete using ((select auth.uid()) = user_id);

-- ── Recreate the player projection ──────────────────────────────────────────
--
-- The sixth recreation. `get_player_visible_locations` returns `setof
-- locations` and lists every column positionally so it can null the DM-only
-- ones, so any new column makes its list one short and it fails at call time
-- with a return type mismatch -- in the *player* atlas, not the DM's.
-- 20260818081308 learned that and says so in its own header.
--
-- `underlay_url` is nulled, alongside `notes` and `audio_theme`. This is a
-- licensing posture, not a visibility preference: the underlay is typically a
-- scanned page from a book the DM owns. Keeping it for their own prep is
-- ordinary personal use; projecting it to other accounts is redistribution,
-- and the projection is the exact boundary where that would happen. Players
-- see `map_url` -- the drawn map -- when the DM shares it, which is the DM's
-- own work and theirs to share.
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
    case when l.is_description_shared then l.description else null::text end,  -- full description
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,             -- map_url gated by is_map_shared
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
    l.sort_order,
    null::text                                                                -- underlay_url (DM-only; see header)
  from locations l
  where l.campaign_id is not null
    and (p_campaign_id is null or l.campaign_id = p_campaign_id)
    and (p_location_id is null or l.id = p_location_id)
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = l.campaign_id
    )
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
