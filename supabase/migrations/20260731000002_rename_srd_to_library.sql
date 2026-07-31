-- Migration: rename_srd_to_library
-- Renames the shared-content vocabulary from `srd_` to `library_` (#583).
--
-- WHY: the `srd_` prefix drifted to mean "canonical / shared / admin-provided",
-- which is not what SRD means. Only ~660 of 3,541 `srd_monsters` rows are WotC
-- SRD; the rest is Kobold Press (OGL 1.0a, Black Flag under ORC) and EN
-- Publishing. Filing another publisher's book under an "SRD" banner misdescribes
-- its licence. #567 fixed the user-visible labels and built `content_sources`;
-- this fixes the schema's own vocabulary. `srd_monsters.is_srd` was the purest
-- form of the bug: it is `true` for all 3,541 rows, `blackflag` and `tob3`
-- included, so it never meant "is SRD" — it meant "is shared library content".
--
-- DELIBERATELY NOT RENAMED (#583 scope decision):
--   * Row ids keep their `srd_` prefix (`srd_owlbear`, `srd_srd_2024_owlbear`),
--     and `stableSrdId()` still mints them. Churning 6,739 ids means remapping
--     12 referrer columns — five of them jsonb — and one such id lives inside
--     user-written prose in `notes.content`, which cannot be safely rewritten.
--     Ids are invisible to users; the churn risks the #553 "Unknown creature"
--     class of breakage and buys nothing.
--   * The `srd/` storage prefix and the 11 storage policies keyed on it:
--     1,193 objects across three buckets, 1,073 art-row image_urls, plus public
--     URLs already handed out that would go dead.
--   * `source_document_key`, `source_record_key`, `library_rules.slug` and
--     `.parent_slug` hold Open5e's OWN keys (`srd_2024_owlbear`). They are
--     upstream identifiers we do not control and must never be rewritten.
--   * The `'srd-2014'` / `'srd-2024'` content_source keys, which genuinely are
--     the WotC System Reference Documents.
--
-- This migration is metadata-only: not one row is read or written. `alter table
-- rename` keeps data, indexes, constraints, policies and grants attached to the
-- same OIDs, so RLS and PostgREST exposure carry over unchanged. Likewise
-- `alter function ... rename` preserves each RPC's existing ACL, which differs
-- between them — hence renames rather than drop/create throughout.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
alter table public.srd_monsters              rename to library_monsters;
alter table public.srd_spells                rename to library_spells;
alter table public.srd_items                 rename to library_items;
alter table public.srd_species               rename to library_species;
alter table public.srd_rules                 rename to library_rules;
alter table public.srd_monster_art           rename to library_monster_art;
alter table public.srd_monster_art_canonical rename to library_monster_art_canonical;
alter table public.srd_spell_art             rename to library_spell_art;
alter table public.srd_spell_art_canonical   rename to library_spell_art_canonical;
alter table public.srd_art_staging           rename to library_art_staging;
alter table public.srd_art_defaults          rename to library_art_defaults;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------

-- True for the Kobold Press and EN Publishing rows too: it marks shared library
-- content, not SRD provenance. Real provenance is source_document_key ->
-- content_sources.
alter table public.library_monsters rename column is_srd to is_shared;

-- `srd_id` points at the library entry the art belongs to — library_monsters.id
-- or library_spells.id, per table. It stays ONE name across all four art
-- tables rather than becoming monster_id/spell_id, because the art subsystem is
-- deliberately polymorphic over them: LibraryArtRepairPanel.vue selects its
-- table from a `mode` prop, and LibraryArtListRow.vue renders monster and spell
-- rows through a single LibraryEntityEntry shape. Diverging the column names
-- would force a column-name parameter through every one of those queries to buy
-- nothing — the owning table already says which entity it is.
alter table public.library_monster_art           rename column srd_id to entry_id;
alter table public.library_monster_art_canonical rename column srd_id to entry_id;
alter table public.library_spell_art             rename column srd_id to entry_id;
alter table public.library_spell_art_canonical   rename column srd_id to entry_id;

-- Never held a slug or an id: it is `lower(name)`, and is joined as such by
-- sync_library_item_art / sync_library_spell_art below.
alter table public.library_art_defaults rename column srd_slug to content_name;

-- These two live on user tables and already carry a `monster_id` uuid column
-- for homebrew, so the shared-library reference needs its own distinct name.
alter table public.discovered_monsters rename column srd_slug to library_monster_id;
alter table public.pinned_forms        rename column srd_slug to library_monster_id;

-- ---------------------------------------------------------------------------
-- 3. Unrelated functions that read the renamed tables
-- ---------------------------------------------------------------------------
-- Function bodies are stored as text and resolved at execution, so a table
-- rename does not update them — they would fail at runtime rather than here.
--
-- These four need exactly one substitution, `srd_spells` -> `library_spells`,
-- inside bodies that are otherwise unrelated to this change and total ~900
-- lines (cast_character_spell_v4 alone is 20KB; a transcription slip there is a
-- spell-casting outage). So they are re-emitted from pg_get_functiondef with
-- only that identifier swapped, over an explicitly named set. `\y` is a word
-- boundary, so row-id literals such as 'srd_spells_something' or comments
-- mentioning "srd_dire_wolf" cannot be caught by it.
do $$
declare
  r         record;
  v_names   text[] := array[
    'cast_character_spell_v4',
    'character_spell_level',
    'review_characters_for_campaign_ruleset',
    'validate_character_spell_source'
  ];
  v_seen    text[] := '{}';
  v_missing text;
begin
  -- Driven per ROW (i.e. per oid), and pg_get_functiondef emits the full
  -- signature, so an overload is rewritten as itself rather than clobbering its
  -- sibling. One that does not mention srd_spells needs no rewrite and is
  -- skipped rather than raising — adding a second signature beside a live one
  -- is a normal way to evolve an RPC and must not abort a deploy. The
  -- assertion below is therefore per NAME, not a count: a name that disappears
  -- from the schema, or whose every signature has stopped referencing
  -- srd_spells, still stops the migration.
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname = any(v_names)
    order by p.proname, p.oid
  loop
    if r.def !~ '\ysrd_spells\y' then
      continue;
    end if;
    v_seen := v_seen || r.proname;
    execute regexp_replace(r.def, '\ysrd_spells\y', 'library_spells', 'g');
  end loop;

  select string_agg(nm, ', ' order by nm) into v_missing
  from unnest(v_names) nm
  where not (nm = any(v_seen));

  if v_missing is not null then
    raise exception 'Expected each of % to reference srd_spells and be rewritten; these did not: %',
                    v_names, v_missing;
  end if;
end $$;

-- Short enough to restate in full.
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

-- ---------------------------------------------------------------------------
-- 4. The shared-content RPCs: rename, then restate the bodies
-- ---------------------------------------------------------------------------
-- Rename first (a rename does not validate the body), then `create or replace`
-- under the new name. Both operations preserve the existing grants.
alter function public.get_srd_monster_sources(text) rename to get_library_monster_sources;
alter function public.get_srd_spell_sources(text)   rename to get_library_spell_sources;
alter function public.get_srd_item_sources(text)    rename to get_library_item_sources;
alter function public.get_srd_species_sources(text) rename to get_library_species_sources;

alter function public.sync_srd_monster_art_to_shared_table() rename to sync_library_monster_art;
alter function public.sync_srd_spell_art_to_shared_table()   rename to sync_library_spell_art;
alter function public.sync_srd_item_art_to_shared_table()    rename to sync_library_item_art;

create or replace function public.get_library_monster_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select source, source_title, count(*)
  from library_monsters
  where source is not null and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source);
$function$;

create or replace function public.get_library_spell_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    source,
    source_title,
    count(*) as count
  from library_spells
  where source is not null
    and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source) nulls last;
$function$;

create or replace function public.get_library_item_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select source, source_title, count(*)
  from library_items
  where source is not null and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source);
$function$;

create or replace function public.get_library_species_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select source, source_title, count(*)
  from library_species
  where source is not null and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source);
$function$;

create or replace function public.sync_library_monster_art()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated_count integer;
begin
  if not private.is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  update library_monsters lm
  set image_url            = lmac.image_url,
      portrait_focal_point = lmac.portrait_focal_point,
      updated_at           = now()
  from library_monster_art_canonical lmac
  where lmac.entry_id = lm.id
    and lmac.image_url is not null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$function$;

create or replace function public.sync_library_spell_art()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated_count integer := 0;
  batch_count   integer;
begin
  if not private.is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  -- Legacy path: art published to library_art_defaults (admin-write-only).
  update library_spells ls
  set image_url         = lad.image_url,
      image_focal_point = lad.image_focal_point,
      updated_at        = now()
  from library_art_defaults lad
  where lad.content_type = 'spell'
    and lad.content_name = lower(ls.name)
    and lad.image_url   is not null;

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  -- New path: dedicated canonical table (admin-write-only via RLS).
  update library_spells ls
  set image_url         = lsac.image_url,
      image_focal_point = lsac.portrait_focal_point,
      updated_at        = now()
  from library_spell_art_canonical lsac
  where lsac.entry_id  = ls.id
    and lsac.image_url is not null;

  get diagnostics batch_count = row_count;
  updated_count := updated_count + batch_count;

  return updated_count;
end;
$function$;

create or replace function public.sync_library_item_art()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  updated_count integer;
begin
  if not private.is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  update library_items li
  set image_url         = lad.image_url,
      image_focal_point = lad.image_focal_point,
      updated_at        = now()
  from library_art_defaults lad
  where lad.content_type = 'item'
    and lad.content_name = lower(li.name)
    and lad.image_url   is not null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$function$;

-- Alone among the three art-sync RPCs, the item one granted EXECUTE to `anon`.
-- It is SECURITY DEFINER and gates on is_app_admin() internally, so this was
-- not exploitable, but an admin-only RPC has no reason to be on anon's surface.
-- Align it with its siblings (anon's access arrives via the PUBLIC grant, so
-- PUBLIC is the one that has to go).
revoke execute on function public.sync_library_item_art() from public, anon;
grant execute on function public.sync_library_item_art() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Derivative object names (constraints, indexes, triggers, policies)
-- ---------------------------------------------------------------------------
-- Postgres does not rename these alongside their table, so without this step
-- `\d library_monsters` still reads `srd_` throughout.

-- Names that embed a renamed COLUMN need more than the prefix swap, so do them
-- explicitly first; the generic loop below then skips them. Renaming a
-- constraint also renames the index backing it.
alter table public.library_art_defaults
  rename constraint srd_art_defaults_content_type_srd_slug_key
  to library_art_defaults_content_type_content_name_key;
alter table public.library_monster_art
  rename constraint srd_monster_art_user_id_srd_id_key
  to library_monster_art_user_id_entry_id_key;
alter table public.library_spell_art
  rename constraint srd_spell_art_user_id_srd_id_key
  to library_spell_art_user_id_entry_id_key;

-- These two hang off USER tables (discovered_monsters, pinned_forms) whose
-- shared-library column section 2 renamed to library_monster_id — so the loops
-- below, which walk objects on `library_*` tables, never visit them, and the
-- section-6 gate matches an `srd_` PREFIX these names do not have. Both would
-- survive: a `dm_srd_uniq` over a column called library_monster_id, passing a
-- gate that claims the vocabulary is gone. Neither name is referenced anywhere
-- (both are minted by the squashed initial schema; no `on conflict on
-- constraint` names them), so renaming is free.
alter index public.dm_srd_uniq rename to dm_library_uniq;
alter table public.pinned_forms
  rename constraint pinned_forms_srd_unique to pinned_forms_library_unique;

do $$
declare r record;
begin
  -- Constraints (also renames any index backing them).
  for r in
    select c.relname as tbl, con.conname
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'library\_%' and con.conname like 'srd\_%'
  loop
    execute format('alter table public.%I rename constraint %I to %I',
                   r.tbl, r.conname, 'library_' || substring(r.conname from 5));
  end loop;

  -- Indexes with no owning constraint.
  for r in
    select i.relname as idx
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class c on c.oid = x.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'library\_%' and i.relname like 'srd\_%'
  loop
    execute format('alter index public.%I rename to %I',
                   r.idx, 'library_' || substring(r.idx from 5));
  end loop;

  -- Triggers.
  for r in
    select c.relname as tbl, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'library\_%'
      and t.tgname like 'srd\_%' and not t.tgisinternal
  loop
    execute format('alter trigger %I on public.%I rename to %I',
                   r.tgname, r.tbl, 'library_' || substring(r.tgname from 5));
  end loop;

  -- RLS policies.
  for r in
    select c.relname as tbl, p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname like 'library\_%' and p.polname like 'srd\_%'
  loop
    execute format('alter policy %I on public.%I rename to %I',
                   r.polname, r.tbl, 'library_' || substring(r.polname from 5));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Verification gate
-- ---------------------------------------------------------------------------
-- Anything left behind fails the migration, and therefore the deploy, instead
-- of surfacing later as a 404 in the app. This inspects object NAMES and
-- function bodies naming the old tables only, so row-id literals and the Open5e
-- key columns are out of its reach by construction.
--
-- Every name test is a SUBSTRING, not a prefix. `dm_srd_uniq` and
-- `pinned_forms_srd_unique` are precisely the shape a prefix test waves
-- through, and they are the ones most likely to survive, since they sit on user
-- tables rather than on a renamed `library_*` one.
do $$
declare
  v_old_tables text := '\y(srd_monsters|srd_spells|srd_items|srd_species|srd_rules'
                       || '|srd_monster_art|srd_monster_art_canonical|srd_spell_art'
                       || '|srd_spell_art_canonical|srd_art_staging|srd_art_defaults)\y';
  v_leftover   text;
begin
  select string_agg(what, ', ' order by what) into v_leftover from (
    select 'table ' || c.relname as what
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like '%srd%'
    union all
    select 'index ' || c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'i' and c.relname like '%srd%'
    union all
    select 'constraint ' || c.relname || '.' || con.conname
      from pg_constraint con join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and con.conname like '%srd%'
    union all
    select 'column ' || table_name || '.' || column_name
      from information_schema.columns
      where table_schema = 'public' and column_name like '%srd%'
    union all
    select 'function ' || n.nspname || '.' || p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prokind = 'f'
        and (p.proname like '%srd%' or p.prosrc ~ v_old_tables)
    union all
    select 'policy ' || c.relname || '.' || p.polname
      from pg_policy p join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and p.polname like '%srd%'
    union all
    select 'trigger ' || c.relname || '.' || t.tgname
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and t.tgname like '%srd%' and not t.tgisinternal
  ) leftovers;

  if v_leftover is not null then
    raise exception 'srd_ vocabulary left in the schema after the rename: %', v_leftover;
  end if;
end $$;
