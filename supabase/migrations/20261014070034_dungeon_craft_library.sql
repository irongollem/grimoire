-- Dungeon Craft gets a library (#1060).
--
-- Every other catalogue opens on shared content; the Traproom, Features,
-- Enigmarium and Roll Tables tabs opened empty until a DM pressed "Populate
-- Examples", which copied hard-coded templates into that DM's own rows: a
-- private copy with no art, which no later fix to a template could reach.
-- This migration gives the four kinds library tables of their own, authored by
-- Grimoire, and lets the places that point at a trap or a feature point at a
-- library row directly (the #954 model: picking shared content references it
-- instead of copying it). The rows themselves arrive in the next migration.
--
--  1. The source, `grimoire-dungeon-craft`. Always on: it is not gated by
--     `campaign_enabled_sources`, because it is the only source of these kinds,
--     so there is nothing to choose between, and it replaces a button every DM
--     already had. Enablement can join it the day a second source exists.
--  2. Four library tables. Each mirrors the content columns of its owned
--     table, column for column and type for type, so Customize (and "Use in
--     campaign" for puzzles and roll tables) is a straight copy. Text slug ids
--     (`grimoire_hidden_pit`), select for everyone, writes admin-only, the
--     pattern of library_backgrounds (20261005083556). No ruleset column: a
--     trap's DCs and damage read the same in both editions.
--  3. Referrers. Each gets a SEPARATE library column with a real foreign key,
--     not a widened mixed-shape id, so the uuid half keeps its own foreign key
--     and its cascade:
--       location_placements.library_trap_id / library_dungeon_feature_id,
--         joining the exclusive arc;
--       encounters.library_trap_ids text[] beside trap_ids uuid[]. Ownership
--         transfer rewrites trap_ids by uuid (transfer_campaign_ownership) and
--         a library id never needs rewriting, so widening trap_ids to text[]
--         would have meant changing a function for no gain;
--       location_doors.library_dungeon_feature_id, at most one of the two;
--       puzzle_rooms.library_dungeon_feature_id, at most one of the two.
--     `on delete restrict`, as loot_placements.library_item_id: a library
--     reseed that fails loudly on a row someone placed beats a placement that
--     silently vanished. An array cannot carry a foreign key, so
--     library_trap_ids is guarded by a trigger and by content_integrity.sql.
--     No ownership check on any library column: shared content is public read,
--     and the existing policies already pass a row whose own-kind column is
--     null.
--  4. Canonical art: srd/ prefixes on trap-images, dungeon-feature-images and
--     puzzle-images for the Supabase fallback (bytes go to R2, whose allow list
--     is STORAGE_WRITE_POLICY in supabase/functions/_shared/storage-policy.ts).
--     A policy on a bucket a stack lacks is inert; buckets are provisioned by
--     `npm run dev:buckets`, never by migration.
--  5. Readers the column changes reach: get_player_visible_puzzles returns
--     setof puzzle_rooms in column order, and update_location_doors names the
--     columns a batch update may set.

-- ── 1. Source ───────────────────────────────────────────────────────────────
insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dungeon-craft', null, 'Grimoire Dungeon Craft', 'Dungeon Grimoire', '{}',
  'Original traps, dungeon features, puzzles and roll tables written for Dungeon Grimoire. Not from any published book.',
  null, null, true, true, 85)
on conflict (key) do nothing;

-- ── 2. Library tables ───────────────────────────────────────────────────────
create table public.library_traps (
  id                 text primary key,
  name               text not null,
  description        jsonb,
  trap_type          text not null default 'Mechanical',
  cr                 text,
  trigger_type       text,
  detection_dc       integer,
  disarm_dc          integer,
  effect_description text,
  save_type          text,
  save_dc            integer,
  attack_bonus       integer,
  reset_type         text not null default 'None',
  trap_hp            integer,
  trap_ac            integer,
  damage_immunities  text[] not null default '{}',
  damage_entries     jsonb not null default '[]'::jsonb,
  hazard_glyph       text,
  tags               text[] not null default '{}',
  notes              jsonb,
  image_url          text,
  image_focal_point  jsonb,
  source             text not null default 'grimoire-dungeon-craft' references public.content_sources(key),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint library_traps_hazard_glyph_check check (hazard_glyph is null or hazard_glyph = any (array[
    'pit', 'pressure_plate', 'tripwire', 'falling_block', 'dart_wall', 'blade',
    'flame_jet', 'glyph', 'net', 'alarm', 'collapsing_floor']))
);

create table public.library_dungeon_features (
  id                   text primary key,
  name                 text not null,
  feature_type         text not null default 'Secret Door',
  description          text,
  perception_dc        integer,
  investigation_dc     integer,
  arcana_dc            integer,
  trigger_type         text,
  trigger_description  text,
  contents_description text,
  feature_glyph        text,
  tags                 text[] not null default '{}',
  notes                text,
  image_url            text,
  image_focal_point    jsonb,
  source               text not null default 'grimoire-dungeon-craft' references public.content_sources(key),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint library_dungeon_features_feature_glyph_check check (feature_glyph is null or feature_glyph = any (array[
    'secret_door', 'hidden_passage', 'cache', 'moving_wall', 'lever', 'altar',
    'fountain', 'statue', 'rubble', 'inscription']))
);

-- No sharing state (is_shared, shared_hints, player_visible_to) and no anchor
-- (location_id, dungeon_feature_id): those belong to a puzzle in a campaign,
-- which is what "Use in campaign" makes of this row.
create table public.library_puzzles (
  id                  text primary key,
  name                text not null,
  puzzle_type         text not null default 'Logic',
  difficulty          text not null default 'Medium',
  description         text,
  read_aloud          text,
  solution            text,
  hints               jsonb not null default '[]'::jsonb,
  skill_checks        jsonb not null default '[]'::jsonb,
  success_outcome     text,
  failure_consequence text,
  tags                text[] not null default '{}',
  notes               text,
  image_url           text,
  image_focal_point   jsonb,
  source              text not null default 'grimoire-dungeon-craft' references public.content_sources(key),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Entries carry min, max, label and notes only: an entry's id is minted, and
-- its encounter_id wired, when a DM copies the table into a campaign.
create table public.library_roll_tables (
  id          text primary key,
  name        text not null,
  description text,
  dice        text not null,
  entries     jsonb not null default '[]'::jsonb,
  tags        text[] not null default '{}',
  notes       text,
  source      text not null default 'grimoire-dungeon-craft' references public.content_sources(key),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint library_roll_tables_dice_check check (dice = any (array['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '1d100']))
);

create index library_traps_source_idx            on public.library_traps (source);
create index library_dungeon_features_source_idx on public.library_dungeon_features (source);
create index library_puzzles_source_idx          on public.library_puzzles (source);
create index library_roll_tables_source_idx      on public.library_roll_tables (source);

alter table public.library_traps            enable row level security;
alter table public.library_dungeon_features enable row level security;
alter table public.library_puzzles          enable row level security;
alter table public.library_roll_tables      enable row level security;

create policy "library_traps_select" on public.library_traps for select using (true);
create policy "library_traps_insert" on public.library_traps for insert with check (private.is_app_admin());
create policy "library_traps_update" on public.library_traps for update using (private.is_app_admin());
create policy "library_traps_delete" on public.library_traps for delete using (private.is_app_admin());

create policy "library_dungeon_features_select" on public.library_dungeon_features for select using (true);
create policy "library_dungeon_features_insert" on public.library_dungeon_features for insert with check (private.is_app_admin());
create policy "library_dungeon_features_update" on public.library_dungeon_features for update using (private.is_app_admin());
create policy "library_dungeon_features_delete" on public.library_dungeon_features for delete using (private.is_app_admin());

create policy "library_puzzles_select" on public.library_puzzles for select using (true);
create policy "library_puzzles_insert" on public.library_puzzles for insert with check (private.is_app_admin());
create policy "library_puzzles_update" on public.library_puzzles for update using (private.is_app_admin());
create policy "library_puzzles_delete" on public.library_puzzles for delete using (private.is_app_admin());

create policy "library_roll_tables_select" on public.library_roll_tables for select using (true);
create policy "library_roll_tables_insert" on public.library_roll_tables for insert with check (private.is_app_admin());
create policy "library_roll_tables_update" on public.library_roll_tables for update using (private.is_app_admin());
create policy "library_roll_tables_delete" on public.library_roll_tables for delete using (private.is_app_admin());

create trigger library_traps_updated_at
  before update on public.library_traps
  for each row execute procedure update_updated_at();
create trigger library_dungeon_features_updated_at
  before update on public.library_dungeon_features
  for each row execute procedure update_updated_at();
create trigger library_puzzles_updated_at
  before update on public.library_puzzles
  for each row execute procedure update_updated_at();
create trigger library_roll_tables_updated_at
  before update on public.library_roll_tables
  for each row execute procedure update_updated_at();

-- ── 3. Referrers ────────────────────────────────────────────────────────────

-- Room placements: two more arms of the exclusive arc. Same per-kind partial
-- uniques as the uuid arms (20260904054806): the same entry twice in one room
-- is a mistake every time, the same entry in two rooms is the point.
alter table public.location_placements
  add column library_trap_id text references public.library_traps(id) on delete restrict,
  add column library_dungeon_feature_id text references public.library_dungeon_features(id) on delete restrict;

alter table public.location_placements drop constraint location_placements_one_target;
alter table public.location_placements add constraint location_placements_one_target check (
  num_nonnulls(trap_id, dungeon_feature_id, roll_table_id, loot_table_id, library_trap_id, library_dungeon_feature_id) = 1);

create index location_placements_library_trap_idx
  on public.location_placements (library_trap_id) where library_trap_id is not null;
create index location_placements_library_feature_idx
  on public.location_placements (library_dungeon_feature_id) where library_dungeon_feature_id is not null;
create unique index location_placements_library_trap_uniq
  on public.location_placements (location_id, library_trap_id) where library_trap_id is not null;
create unique index location_placements_library_feature_uniq
  on public.location_placements (location_id, library_dungeon_feature_id) where library_dungeon_feature_id is not null;

-- Doors: a way out may cite a library Secret Door, Hidden Passage or Moving
-- Wall as well as one of the DM's own. guard_location_door_endpoints checks
-- authorship of the uuid half only; the foreign key is the whole check here.
alter table public.location_doors
  add column library_dungeon_feature_id text references public.library_dungeon_features(id) on delete restrict;
alter table public.location_doors add constraint location_doors_one_feature check (
  num_nonnulls(dungeon_feature_id, library_dungeon_feature_id) <= 1);
create index location_doors_library_feature_idx
  on public.location_doors (library_dungeon_feature_id) where library_dungeon_feature_id is not null;
comment on column public.location_doors.library_dungeon_feature_id is
  'The library dungeon feature that conceals or opens this way out (#1060). At most one of this and dungeon_feature_id.';

-- Puzzles: a puzzle may be anchored to a library feature.
alter table public.puzzle_rooms
  add column library_dungeon_feature_id text references public.library_dungeon_features(id) on delete restrict;
alter table public.puzzle_rooms add constraint puzzle_rooms_one_feature check (
  num_nonnulls(dungeon_feature_id, library_dungeon_feature_id) <= 1);
create index puzzle_rooms_library_feature_idx
  on public.puzzle_rooms (library_dungeon_feature_id) where library_dungeon_feature_id is not null;

-- Encounters: library traps beside the DM's own.
alter table public.encounters
  add column library_trap_ids text[] not null default '{}'::text[];

create function private.guard_encounter_library_traps()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  -- A NULL element is refused too: `lt.id = null` matches nothing, and a check
  -- that only looks for the missing id would read a missing NULL as no miss.
  if exists (
    select 1 from unnest(new.library_trap_ids) as x(id)
     where x.id is null
        or not exists (select 1 from public.library_traps lt where lt.id = x.id)
  ) then
    raise exception 'Unknown library trap in %', new.library_trap_ids using errcode = '23503';
  end if;
  return new;
end;
$function$;
revoke execute on function private.guard_encounter_library_traps() from public, anon, authenticated;

create trigger encounters_guard_library_traps
  before insert or update of library_trap_ids on public.encounters
  for each row when (cardinality(new.library_trap_ids) > 0)
  execute procedure private.guard_encounter_library_traps();

-- ── 4. Canonical art ────────────────────────────────────────────────────────
-- The species-images pattern (20261005144201): signed-in read, admin write.
create policy "trap_images_srd_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'trap-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "trap_images_srd_update" on storage.objects for update to authenticated
  using (bucket_id = 'trap-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "trap_images_srd_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'trap-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "trap_images_srd_select" on storage.objects for select to authenticated
  using (bucket_id = 'trap-images' and (storage.foldername(name))[1] = 'srd');

create policy "dungeon_feature_images_srd_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'dungeon-feature-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "dungeon_feature_images_srd_update" on storage.objects for update to authenticated
  using (bucket_id = 'dungeon-feature-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "dungeon_feature_images_srd_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'dungeon-feature-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "dungeon_feature_images_srd_select" on storage.objects for select to authenticated
  using (bucket_id = 'dungeon-feature-images' and (storage.foldername(name))[1] = 'srd');

create policy "puzzle_images_srd_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'puzzle-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "puzzle_images_srd_update" on storage.objects for update to authenticated
  using (bucket_id = 'puzzle-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "puzzle_images_srd_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'puzzle-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "puzzle_images_srd_select" on storage.objects for select to authenticated
  using (bucket_id = 'puzzle-images' and (storage.foldername(name))[1] = 'srd');

-- ── 5. Readers ──────────────────────────────────────────────────────────────

create or replace function public.update_location_doors(p_updates jsonb)
 returns void
 language sql
 set search_path to ''
as $function$
  select private.update_rows_by_id('location_doors', p_updates, array[
    'from_location_id', 'to_location_id', 'label', 'is_one_way', 'starts_locked', 'lock_note',
    'is_secret', 'sort_order', 'door_kind', 'edge_key', 'derived_from', 'dungeon_feature_id',
    'library_dungeon_feature_id']);
$function$;

-- Same body as 20261007092700, with the new last column withheld like the
-- other anchor: where the puzzle sits is the DM's business.
create or replace function public.get_player_visible_puzzles(p_campaign_id uuid default null::uuid, p_puzzle_id uuid default null::uuid, p_preview_party_member_id uuid default null::uuid)
 returns setof puzzle_rooms
 language plpgsql
 stable security definer
 set search_path to 'public', 'private'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_preview_party_member_id is not null and not exists (
    select 1
    from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then
    raise exception 'Preview audience is not available to this DM';
  end if;

  return query select
    p.id,
    p.user_id,
    p.name,
    p.puzzle_type,
    p.difficulty,
    private.withhold_secret_blocks(p.description),   -- player-facing "The Room" setup
    null::text,                          -- solution (DM-only)
    -- hints: keep only the entries the DM has revealed via shared_hints
    coalesce((
      select jsonb_agg(h order by (h->>'order')::int)
      from jsonb_array_elements(coalesce(p.hints, '[]'::jsonb)) h
      where (h->>'order')::int = any (coalesce(p.shared_hints, array[]::int[]))
    ), '[]'::jsonb),
    p.skill_checks,                      -- skill + DC are shown to players
    null::text,                          -- success_outcome (DM-only)
    null::text,                          -- failure_consequence (DM-only)
    p.image_url,
    p.image_focal_point,
    p.tags,
    null::text,                          -- notes (DM-only)
    p.created_at,
    p.updated_at,
    p.campaign_id,
    p.is_shared,
    p.shared_hints,
    private.withhold_secret_blocks(p.read_aloud),
    null::uuid,                          -- location_id (DM-only anchor)
    null::uuid,                          -- dungeon_feature_id (DM-only anchor)
    p.ai_provenance,
    p.player_visible_to,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    null::text                           -- library_dungeon_feature_id (#1060): DM-only anchor
  from puzzle_rooms p
  where p.campaign_id is not null
    and (p_campaign_id is null or p.campaign_id = p_campaign_id)
    and (p_puzzle_id   is null or p.id = p_puzzle_id)
    and case
      when p_preview_party_member_id is null then private.is_puzzle_player_visible(p.id)
      else p_preview_party_member_id = any (p.player_visible_to)
        and coalesce(private.is_campaign_dm(p.campaign_id), false)
    end;
end;
$function$;
