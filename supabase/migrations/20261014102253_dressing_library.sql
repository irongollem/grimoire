-- Dressing: a shared library of top-down props for every Cartographer map (#1062).
--
-- A map could show floors, walls, doors and stairs, but little that makes a room
-- a place: the only props were the six themed object categories each tile pack
-- carries, drawn from whatever pack the cell was painted with. Dressing is a
-- library of generic props (tables, beds, coffins, campfires) a DM places on
-- any map whatever pack it uses: a table is a table on marble, sand or lava.
--
--  1. The source, `grimoire-dressing`. Opt-in through the book icon like every
--     other library, and it starts off: a campaign offers the rows of the
--     sources in `campaign_enabled_sources` (a table-less user, their
--     `user_enabled_sources`). Enablement governs what the picker OFFERS, never
--     whether a placed prop resolves (the #954 rule): the client reads every
--     library_dressing row to draw a map.
--  2. `library_dressing`, the library_traps pattern (20261014070034): slug ids
--     (`dressing_long_table`), select for everyone, writes admin-only, one
--     policy per command. A prop's footprint is in cells, unrotated; a
--     placement turns it about its centre. No image_focal_point: a prop is drawn
--     whole on the grid, never cropped. No DM uploads and no per-user art
--     overrides in v1, so there is no campaign-scoped row here at all.
--  3. `get_library_dressing_sources()`, what the Dressing book icon lists, the
--     shape of get_library_dungeon_craft_sources.
--  4. Canonical art under srd/ in `dressing-images` for the Supabase fallback
--     (bytes go to R2, whose allow list is STORAGE_WRITE_POLICY in
--     supabase/functions/_shared/storage-policy.ts). A policy on a bucket a
--     stack lacks is inert; buckets are provisioned by `npm run dev:buckets`,
--     never by migration.
--  5. Placements live in the map document: `dungeon_maps.layers.dressing`, a
--     record of placement uuid -> { prop_id, x, y, rotation, z }. Not keyed by
--     cell, because a prop spans cells and props overlap; `z` says which is on
--     top, since jsonb does not keep object key order. The column default gains
--     the key for new maps. Existing rows are NOT backfilled: the client reads
--     an absent layer as empty (withLayerDefaults), and touching `layers` would
--     bump every map's `rev` through dungeon_maps_bump_rev, flagging every
--     published site as behind for a change that draws nothing. A prop_id is a
--     text reference into a jsonb document, so no FK guards it;
--     supabase/checks/content_integrity.sql does.
--  6. get_content_licenses counts Dressing toward `entry_count`, which is what
--     puts a book on the Licences page. The body is 20261014100306's with one
--     more tally.

-- ── 1. Source ───────────────────────────────────────────────────────────────
insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing', null, 'Grimoire Dressing', 'Dungeon Grimoire', '{}',
  'Original top-down map props drawn for Dungeon Grimoire. Not from any published book.',
  null, null, true, true, 86)
on conflict (key) do nothing;

-- ── 2. Library table ────────────────────────────────────────────────────────
create table public.library_dressing (
  id          text primary key,
  name        text not null,
  group_key   text not null,
  tags        text[] not null default '{}',
  footprint_w integer not null default 1,
  footprint_h integer not null default 1,
  image_url   text,
  source      text not null default 'grimoire-dressing' references public.content_sources(key),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint library_dressing_group_key_check check (group_key = any (array[
    'furniture', 'containers', 'loot', 'remains', 'tavern', 'workshop',
    'arcane', 'religious', 'camp', 'prison', 'outdoor'])),
  constraint library_dressing_footprint_check check (
    footprint_w between 1 and 4 and footprint_h between 1 and 4)
);

create index library_dressing_source_idx on public.library_dressing (source);

alter table public.library_dressing enable row level security;

create policy "library_dressing_select" on public.library_dressing for select using (true);
create policy "library_dressing_insert" on public.library_dressing for insert with check (private.is_app_admin());
create policy "library_dressing_update" on public.library_dressing for update using (private.is_app_admin());
create policy "library_dressing_delete" on public.library_dressing for delete using (private.is_app_admin());

create trigger library_dressing_updated_at
  before update on public.library_dressing
  for each row execute procedure update_updated_at();

-- ── 3. Sources ──────────────────────────────────────────────────────────────
create function public.get_library_dressing_sources()
 returns table(source text, source_title text, count bigint)
 language sql
 stable
 set search_path to 'public'
as $function$
  select d.source, cs.title as source_title, count(*)
    from library_dressing d
    left join content_sources cs on cs.key = d.source
   group by d.source, cs.title
   order by coalesce(cs.title, d.source);
$function$;

-- ── 4. Canonical art ────────────────────────────────────────────────────────
-- The trap-images pattern (20261014070034): signed-in read, admin write.
create policy "dressing_images_srd_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'dressing-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "dressing_images_srd_update" on storage.objects for update to authenticated
  using (bucket_id = 'dressing-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "dressing_images_srd_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'dressing-images' and (storage.foldername(name))[1] = 'srd' and private.is_app_admin());
create policy "dressing_images_srd_select" on storage.objects for select to authenticated
  using (bucket_id = 'dressing-images' and (storage.foldername(name))[1] = 'srd');

-- ── 5. Map layer ────────────────────────────────────────────────────────────
alter table public.dungeon_maps
  alter column layers set default '{"floor":{},"solidBlock":{},"object":{},"annotation":{},"dressing":{}}'::jsonb;

-- ── 6. Licences page ───────────────────────────────────────────────────────
create or replace function public.get_content_licenses()
returns table(key text, open5e_key text, title text, publisher text,
              license_keys text[], copyright_notice text, product_url text,
              gamesystem text, monster_count bigint, spell_count bigint,
              item_count bigint, species_count bigint, rule_count bigint,
              class_count bigint, entry_count bigint, sort_order integer)
language sql
stable
set search_path to 'public'
as $function$
  with tallies as (
    select source_document_key as k, 'monster'::text as kind, count(*) as n from library_monsters group by 1
    union all
    select source_document_key, 'spell',   count(*) from library_spells   group by 1
    union all
    select source_document_key, 'item',    count(*) from library_items    group by 1
    union all
    select source_document_key, 'species', count(*) from library_species  group by 1
    union all
    select source_document_key, 'rule',    count(*) from library_rules    group by 1
    union all
    select source_document_key, 'class',   count(*) from system_classes   group by 1
    union all
    select source_document_key, 'other',   count(*) from library_backgrounds group by 1
    union all
    select source, 'other', count(*) from library_traps            group by 1
    union all
    select source, 'other', count(*) from library_dungeon_features group by 1
    union all
    select source, 'other', count(*) from library_puzzles          group by 1
    union all
    select source, 'other', count(*) from library_roll_tables      group by 1
    union all
    select source, 'other', count(*) from library_dressing         group by 1
  ),
  rolled as (
    select
      k,
      coalesce(sum(n) filter (where kind = 'monster'), 0) as monster_count,
      coalesce(sum(n) filter (where kind = 'spell'),   0) as spell_count,
      coalesce(sum(n) filter (where kind = 'item'),    0) as item_count,
      coalesce(sum(n) filter (where kind = 'species'), 0) as species_count,
      coalesce(sum(n) filter (where kind = 'rule'),    0) as rule_count,
      coalesce(sum(n) filter (where kind = 'class'),   0) as class_count,
      coalesce(sum(n), 0)                                 as entry_count
    from tallies
    where k is not null
    group by k
  )
  select
    r.k,
    cs.open5e_key,
    coalesce(cs.title, r.k),
    coalesce(cs.publisher, 'Uncatalogued source'),
    coalesce(cs.license_keys, '{}'::text[]),
    cs.copyright_notice,
    cs.product_url,
    cs.gamesystem,
    r.monster_count,
    r.spell_count,
    r.item_count,
    r.species_count,
    r.rule_count,
    r.class_count,
    r.entry_count,
    coalesce(cs.sort_order, 999)
  from rolled r
  left join content_sources cs on cs.key = r.k
  order by coalesce(cs.sort_order, 999), coalesce(cs.title, r.k);
$function$;
