-- The publish remembers what it wrote. Epic #868, frames 02, 05 and 10 of
-- `atlas/Sites & Cartographer.html`.
--
-- Save to Atlas baked a WebP, wrote `map_url` + `source_map_id`, and ended.
-- `source_map_id` was a one-way breadcrumb ("Edit map in Cartographer") that
-- could not say whether the drawing had moved on since. Publish to Atlas
-- carries structure (regions, doors, placements -- see the two migrations
-- before this one), and three small columns let it be safe to run twice:
--
--   dungeon_maps.rev              A revision counter, bumped by trigger whenever
--                                 the drawing's layers or metadata change. The
--                                 sheet talks about "rev 14, published rev 12";
--                                 the row had `updated_at` but no counter, and a
--                                 timestamp is not a thing a DM reads as "two
--                                 behind".
--   locations.map_published_rev   Which rev the last publish carried. Null means
--                                 "never published from the Cartographer", which
--                                 is exactly what a scanned page is.
--   location_placements
--     .source_cell_key            Which cell of the site's plan this placement was
--                                 drawn on. Null is the normal case -- a trap added
--                                 from the room sheet has no cell and draws on the
--                                 room. The cell link stays the precise one; the
--                                 room list stays the authority on "what is
--                                 prepped here". Without it a trap is in the room
--                                 list or on the map, never both, and the DM
--                                 maintains one fact twice.

-- ── dungeon_maps.rev ────────────────────────────────────────────────────────
alter table public.dungeon_maps
  add column rev integer not null default 1;

comment on column public.dungeon_maps.rev is
  'Bumped by trigger whenever layers or metadata change. locations.map_published_rev records which rev a site was last published from.';

create or replace function public.bump_dungeon_map_rev()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only the drawing counts. Renaming a map or retagging it does not make a
  -- published site stale, so those saves leave the rev alone.
  if new.layers is distinct from old.layers or new.metadata is distinct from old.metadata then
    new.rev := old.rev + 1;
  end if;
  return new;
end;
$$;

revoke execute on function public.bump_dungeon_map_rev() from public, anon, authenticated;

create trigger dungeon_maps_bump_rev
  before update of layers, metadata on public.dungeon_maps
  for each row execute procedure public.bump_dungeon_map_rev();

-- ── locations.map_published_rev ─────────────────────────────────────────────
alter table public.locations
  add column map_published_rev integer;

comment on column public.locations.map_published_rev is
  'The dungeon_maps.rev the last Publish to Atlas carried. Null = never published from the Cartographer (a scanned page, a photo).';

-- Not content: a re-publish that changes nothing but the rev must not bump
-- "last edited" or invalidate the embedding source hash, so the column is
-- kept off the locations_updated_at WHEN list the same way sort_order is.
-- (The trigger's WHEN clause enumerates content columns positively; a new
-- column is excluded by default. Recorded here so nobody adds it.)
--
-- Found while checking that claim: the WHEN list has never actually been in
-- force. 20260529000002 replaced `locations_updated_at` and `quests_updated_at`
-- with conditional triggers, but the squashed schema had created them as
-- `set_locations_updated_at` / `set_quests_updated_at`, so its
-- `drop trigger if exists` dropped nothing and both tables have run an
-- unconditional bump beside the conditional one since -- a room reorder or a
-- reveal toggle bumped "last edited" after all, and re-embedded the row. Two
-- triggers, one intent; the stale pair goes.
drop trigger if exists set_locations_updated_at on public.locations;
drop trigger if exists set_quests_updated_at on public.quests;

-- ── location_placements.source_cell_key ─────────────────────────────────────
alter table public.location_placements
  add column source_cell_key text
    constraint location_placements_cell_key_format
      check (source_cell_key is null or source_cell_key ~ '^-?[0-9]+,-?[0-9]+$');

comment on column public.location_placements.source_cell_key is
  'The cell of the site''s plan this placement was drawn on ("x,y" in the map''s own cell space). Null = added from the room sheet; draws on the room.';

-- ── get_player_visible_locations, the sixth recreation ──────────────────────
--
-- `returns setof locations` lists every column positionally so it can null
-- the DM-only ones; `locations` just gained its 32nd column, so the list is
-- one short until it is rebuilt. `map_published_rev` is nulled for players: it
-- says nothing about the world, only about the DM's tooling.
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
    case when l.is_description_shared then l.description else null::text end,
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    -- A site with a plan sends no picture: the player's plan is composed from
    -- cells by get_player_visible_site_state (20260908215645), and the baked
    -- image was "the one honest limit" -- one signed URL that shows the whole
    -- floor to anyone who fetches it. A place with no traced spaces (a region
    -- map with pins, a scanned town) still ships its picture as before.
    case when l.is_map_shared and not exists (
           select 1 from location_map_regions r
            where r.site_location_id = l.id
              and r.region_role = 'space'
              and r.space_location_id is not null
         ) then l.map_url else null::text end,
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
    null::integer                                                             -- map_published_rev (DM tooling)
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
