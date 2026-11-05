-- Book Nook (#1142): a place's picture that breathes.
--
-- The design is the canvas "Book Nook" (https://claude.ai/artifact/Nq31S9bKY3hkymDWgwTdLN), decisions in the
-- body of epic #1142. A nook is a layered painting moved a little by code (src/lib/bookNook/). It is made in
-- Book Nook, a Publish tool, and shown at a place the way a Cartographer map is bound to one (frame 02a):
--
--   1. public.book_nooks           one row per nook in a campaign; the scene is jsonb, its art is on R2.
--   2. locations.book_nook_id      the nook a place shows. Unique: a place shows one nook, a nook one place.
--   3. get_player_book_nook        a player reads a nook only through a place they may see.
--   4. public.library_nook_parts   the stock shelf: admin-managed cut-outs and frames (frame 06b).
--   5. campaigns.table_shows       the Table screen's Picture/Map switch, kept with the party's position (08).

-- ── 1. Nooks ────────────────────────────────────────────────────────────────
create table public.book_nooks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  title       text not null,
  -- The scene as src/lib/bookNook/scene.ts types it (Scene): room size, loop, camera, the stack of layers and
  -- effects, grade, seed, the screens' windows and the optional frame. The client is the only writer; a scene
  -- it cannot read renders as its still.
  scene       jsonb not null,
  -- The composed first frame, every cut-out in place: what lists, cards and reduce-motion show.
  still_url   text,
  -- Bumped by the client on every save, so a stale tab's save can be refused and a player's cached bitmaps
  -- know to reload.
  rev         integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint book_nooks_title_check check (length(btrim(title)) between 1 and 120),
  constraint book_nooks_scene_check check (jsonb_typeof(scene) = 'object')
);

comment on table public.book_nooks is
  'Book Nook (#1142): a layered painting a place can show. The scene is src/lib/bookNook Scene jsonb.';

create index book_nooks_campaign_idx on public.book_nooks (campaign_id);
create index book_nooks_user_idx on public.book_nooks (user_id);

create trigger book_nooks_updated_at
  before update on public.book_nooks
  for each row execute procedure update_updated_at();

-- Any DM of the campaign (co-DMs included) may make and edit nooks, as with Cartographer maps. A player
-- never reads the table: only get_player_book_nook below. Being a nook's author is not access on its own: a DM
-- who is demoted keeps nothing. One permissive policy per command.
alter table public.book_nooks enable row level security;

create policy "book_nooks_select" on public.book_nooks for select
  using (private.is_campaign_dm(campaign_id));
create policy "book_nooks_insert" on public.book_nooks for insert
  with check (((select auth.uid()) = user_id) and private.is_campaign_dm(campaign_id));
create policy "book_nooks_update" on public.book_nooks for update
  using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy "book_nooks_delete" on public.book_nooks for delete
  using ((((select auth.uid()) = user_id) and private.is_campaign_dm(campaign_id)) or private.is_campaign_owner(campaign_id));

-- A nook's author does not change by editing it, as with places: otherwise a DM could hand a player a nook's
-- row, and with it a read and a delete (the security audit of 5 Nov 2026).
create trigger book_nooks_guard_content_author
  before update on public.book_nooks
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute function private.guard_content_author();

grant select, insert, update, delete on public.book_nooks to authenticated, service_role;

-- Live by default: every tab refetches a nook when it changes (CLAUDE.md "Live Data").
create trigger book_nooks_signal_insert after insert on public.book_nooks
  referencing new table as changed for each statement execute function public.signal_campaign_change();
create trigger book_nooks_signal_update after update on public.book_nooks
  referencing old table as left_rows new table as changed for each statement execute function public.signal_campaign_change();
create trigger book_nooks_signal_delete after delete on public.book_nooks
  referencing old table as changed for each statement execute function public.signal_campaign_change();

-- The demo ships Sugarwell's inn as a nook, so the table is copied with its campaign.
insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('book_nooks', 1, true, null);

-- ── 2. The nook a place shows ───────────────────────────────────────────────
alter table public.locations
  add column book_nook_id uuid references public.book_nooks (id) on delete set null;

-- A place shows at most one nook and a nook is shown at most at one place (decision 1 of #1142).
create unique index locations_book_nook_id_key on public.locations (book_nook_id) where book_nook_id is not null;

comment on column public.locations.book_nook_id is
  'Book Nook (#1142): the nook this place shows in its picture slot, or none. Like source_map_id for a map.';

-- A nook from another campaign cannot be shown here (same_campaign_refs.test.sql holds every such column).
drop trigger if exists zz_same_campaign_refs on public.locations;
create trigger zz_same_campaign_refs
  before insert or update of npc_owner_id, parent_id, source_map_id, book_nook_id, campaign_id on public.locations
  for each row execute procedure private.enforce_same_campaign_refs(
    'npc_owner_id', 'npcs', 'owned',
    'parent_id', 'locations', 'owned',
    'source_map_id', 'dungeon_maps', 'owned',
    'book_nook_id', 'book_nooks', 'owned');

-- Showing a nook is an edit of the place, so it stamps updated_at like the map's binding does.
drop trigger if exists locations_updated_at on public.locations;
create trigger locations_updated_at
  before update on public.locations
  for each row when (
    old.parent_id is distinct from new.parent_id or old.name is distinct from new.name
    or old.location_type is distinct from new.location_type or old.description is distinct from new.description
    or old.notes is distinct from new.notes or old.tags is distinct from new.tags
    or old.image_url is distinct from new.image_url or old.map_url is distinct from new.map_url
    or old.map_pins is distinct from new.map_pins or old.is_map_shared is distinct from new.is_map_shared
    or old.player_summary is distinct from new.player_summary
    or old.is_description_shared is distinct from new.is_description_shared
    or old.is_npcs_shared is distinct from new.is_npcs_shared
    or old.is_inventory_shared is distinct from new.is_inventory_shared
    or old.npc_owner_id is distinct from new.npc_owner_id
    or old.related_location_ids is distinct from new.related_location_ids
    or old.source_map_id is distinct from new.source_map_id or old.is_battle_map is distinct from new.is_battle_map
    or old.grid_calibration is distinct from new.grid_calibration or old.book_nook_id is distinct from new.book_nook_id)
  execute procedure update_updated_at();

-- ── 3. What a player reads ──────────────────────────────────────────────────
-- get_player_visible_locations returns `setof locations`, which is positional: the new column is appended in
-- the table's order (last). A player sees which nook a visible place shows.
create or replace function public.get_player_visible_locations(p_campaign_id uuid default null::uuid, p_location_id uuid default null::uuid)
 returns setof locations
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    l.id,
    l.user_id,
    l.campaign_id,
    l.parent_id,
    l.name,
    l.location_type,
    case when l.is_description_shared then private.withhold_secret_blocks(l.description) else null::text end,
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,
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
    null::integer,                                                            -- map_published_rev (DM tooling)
    case when l.is_map_shared then l.map_layer_url else null::text end,
    case when l.is_map_shared then l.map_layer_calibration else null::jsonb end,
    case when l.is_map_shared then l.plan_size else null::jsonb end,
    null::text,                                                               -- demo_source (#912): a quota marker, nothing for players
    l.is_level,                                                               -- which nested sites are floors: structure, like parent_id
    case when l.is_map_shared then l.map_scale else null::jsonb end,          -- map_scale (#932): travels with the map
    case when l.is_map_shared then l.map_live else null::jsonb end,           -- map_live (#1073): the live layer's snapshot, likewise
    case when l.is_map_shared then l.map_layer_stand_url else null::text end,      -- map_layer_stand_url (#1073): the Drawing's standing layer
    case when l.is_map_shared then l.map_layer_stand_live_url else null::text end, -- map_layer_stand_live_url (#1073): the same, less what sways
    l.climate,                                                                -- climate (#1086): the weather a player sees comes from it
    l.terrain,                                                                -- terrain (#1086): which weather hazards apply there
    null::jsonb,                                                              -- map_motion (#1125): a moving map plays only on the DM's own device
    l.book_nook_id                                                            -- book_nook_id (#1142): the picture a visible place shows
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
$function$;

-- The nook a place shows, for a player the place is shown to. Deliberately narrower than
-- get_player_visible_locations, which also answers a named place whose map is shared: a shared map is not the
-- DM showing the place's picture ("Nothing the DM has not revealed", frame 09). A definer because players have
-- no read on book_nooks (or on locations); its refusal is proven in book_nook.test.sql.
create function public.get_player_book_nook(p_location_id uuid)
 returns setof public.book_nooks
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select n.*
    from public.locations l
    join public.book_nooks n on n.id = l.book_nook_id and n.campaign_id = l.campaign_id
   where l.id = p_location_id
     and exists (
       select 1 from public.campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = l.campaign_id
          and cm.party_member_id = any (l.player_visible_to)
     );
$function$;

revoke execute on function public.get_player_book_nook(uuid) from public, anon;
grant execute on function public.get_player_book_nook(uuid) to authenticated, service_role;

-- ── 4. The stock shelf ──────────────────────────────────────────────────────
-- Cut-outs and frames painted for Grimoire by the maintainer's painter queue (frame 06b), on R2 under the
-- srd/ prefix of location-images like the library's other canonical art. A nook that uses a stock part copies
-- its image URL into its own scene, so nothing in book_nooks points at this table by id.
insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-book-nook', null, 'Grimoire Book Nook', 'Dungeon Grimoire', '{}',
  'Original cut-outs and frames painted for Dungeon Grimoire. Not from any published book.',
  null, null, true, true, 87)
on conflict (key) do nothing;

create table public.library_nook_parts (
  id          text primary key,
  kind        text not null,
  group_key   text not null,
  name        text not null,
  -- What the shelf sets when the part is placed: for a cut-out its hold and named motion
  -- ({ "hold": "stands", "motion": "Flame" }), for a frame its shape ({ "shape": "tall" }).
  preset      jsonb not null default '{}'::jsonb,
  image_url   text,
  sort_order  integer not null default 100,
  source      text not null default 'grimoire-book-nook' references public.content_sources (key),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint library_nook_parts_kind_check check (kind = any (array['cutout', 'frame'])),
  constraint library_nook_parts_group_check check (group_key = any (array['fire', 'cloth', 'creatures', 'air', 'frames'])),
  constraint library_nook_parts_preset_check check (jsonb_typeof(preset) = 'object')
);

create trigger library_nook_parts_updated_at
  before update on public.library_nook_parts
  for each row execute procedure update_updated_at();

alter table public.library_nook_parts enable row level security;

create policy "library_nook_parts_select" on public.library_nook_parts for select to authenticated using (true);
create policy "library_nook_parts_insert" on public.library_nook_parts for insert with check (private.is_app_admin());
create policy "library_nook_parts_update" on public.library_nook_parts for update using (private.is_app_admin());
create policy "library_nook_parts_delete" on public.library_nook_parts for delete using (private.is_app_admin());

grant select, insert, update, delete on public.library_nook_parts to authenticated, service_role;

-- Canonical art in location-images/srd/: signed-in read, admin write (the dressing-images pattern,
-- 20261014102253). Inert on a stack without the bucket; buckets are not made by migration.
create policy "location_images_srd_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'location-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "location_images_srd_update" on storage.objects for update to authenticated
  using (bucket_id = 'location-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "location_images_srd_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'location-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "location_images_srd_select" on storage.objects for select to authenticated
  using (bucket_id = 'location-images' and (storage.foldername(name))[1] = 'srd');

-- ── 5. What the Table screen shows ──────────────────────────────────────────
-- The DM's "On the table" switch (frame 08). Kept with the party's position on the campaign row, not sent as
-- a moment, so a TV that joins late shows what the room is showing. 'map' is the Table screen as it was;
-- 'picture' shows the party's place's nook. A fight always shows the map whatever this says.
alter table public.campaigns
  add column table_shows text not null default 'map',
  add constraint campaigns_table_shows_check check (table_shows = any (array['map', 'picture']));
