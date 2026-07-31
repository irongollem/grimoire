-- Content referential integrity — dangling shared-content references.
--
-- The shared library tables (library_monsters/library_spells/library_items/
-- library_species) are referenced from user data by TEXT ids with no FK (slugs
-- can't FK a uuid column, and species refs deliberately hold either shape).
-- Twice now an id transition remapped most-but-not-all referrers and shipped
-- silently:
--   * #553 (20260722000002) missed discovered_monsters.library_monster_id (then
--     named srd_slug) → every discovered shared creature rendered "Unknown
--     creature" (fixed 20260724000004)
--   * the same transition's art remap needed its own follow-up (20260722000004)
--
-- This file returns ONE ROW PER VIOLATED CHECK (empty result = healthy). It is
-- executed against PRODUCTION by the supabase-migrations deploy workflow right
-- after `supabase db push` — a migration that strands references fails its own
-- deploy instead of waiting for a player report. pgTAP can't cover this class:
-- CI's local DB has no seeded/user data, so only a prod-data check is
-- non-vacuous.
--
-- Manual run: paste into the SQL editor, or
--   psql "$PROD_DB_URL" -f supabase/checks/content_integrity.sql
-- Adding a new text-id reference to shared content? Add its check here in the
-- same migration.
--
-- COVERAGE NOTE (#583). The referrer list below was derived by scanning every
-- text/jsonb column in `public` for values carrying a shared id, NOT by reading
-- the code. That scan found eight live referrers this file had always missed:
-- all five jsonb ones, entity_notes.entity_id, and the three granted_spells
-- columns. Re-run the scan before any future id transition — it is the only way
-- to find references the compiler cannot see:
--
--   do $$ declare r record; n bigint; begin
--     create temp table if not exists _hits(tbl text, col text, n bigint);
--     for r in select c.table_name, c.column_name from information_schema.columns c
--       join information_schema.tables t
--         on t.table_schema = c.table_schema and t.table_name = c.table_name
--       where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
--         and c.data_type in ('text','character varying','jsonb','json','ARRAY')
--     loop
--       begin execute format('select count(*) from public.%I where %I::text like %L',
--         r.table_name, r.column_name, '%srd\_%') into n;
--       exception when others then n := -1; end;
--       if coalesce(n, 0) <> 0 then insert into _hits values (r.table_name, r.column_name, n); end if;
--     end loop;
--   end $$;
--   select * from _hits order by n desc;
--
-- (Shared ids still carry the legacy `srd_` prefix — #583 renamed the tables but
-- deliberately left row ids alone, so that pattern is still the right probe.)
--
-- One referrer is deliberately NOT checked: notes.content holds ids inside
-- user-written prose. A migration cannot safely rewrite it, so a check on it
-- could only ever report a violation nobody is able to act on.

select check_name, cnt from (
  -- ---- monsters -----------------------------------------------------------
  select 'discovered_monsters.library_monster_id -> library_monsters' as check_name,
    (select count(*) from discovered_monsters d where d.library_monster_id is not null
       and not exists (select 1 from library_monsters s where s.id = d.library_monster_id)) as cnt
  union all select 'pinned_forms.library_monster_id -> library_monsters',
    (select count(*) from pinned_forms p where p.library_monster_id is not null
       and not exists (select 1 from library_monsters s where s.id = p.library_monster_id))
  union all select 'companions.source_monster_id (slug) -> library_monsters',
    (select count(*) from companions c where c.source_monster_id is not null
       and c.source_monster_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from library_monsters s where s.id = c.source_monster_id))
  union all select 'library_monster_art.entry_id -> library_monsters',
    (select count(*) from library_monster_art a
       where not exists (select 1 from library_monsters s where s.id = a.entry_id))
  -- The two *_canonical tables (20260730000010) hold what library_monster_art /
  -- library_spell_art used to keep behind is_canonical, so they carry the same
  -- dangling-text-id risk and need the same check.
  union all select 'library_monster_art_canonical.entry_id -> library_monsters',
    (select count(*) from library_monster_art_canonical a
       where not exists (select 1 from library_monsters s where s.id = a.entry_id))

  -- ---- spells -------------------------------------------------------------
  union all select 'library_spell_art.entry_id -> library_spells',
    (select count(*) from library_spell_art a
       where not exists (select 1 from library_spells s where s.id = a.entry_id))
  union all select 'library_spell_art_canonical.entry_id -> library_spells',
    (select count(*) from library_spell_art_canonical a
       where not exists (select 1 from library_spells s where s.id = a.entry_id))
  union all select 'character_spells.spell_id (slug) -> library_spells',
    (select count(*) from character_spells cs where cs.spell_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from library_spells s where s.id = cs.spell_id))
  union all select 'spell_cast_records.spell_id (slug) -> library_spells',
    (select count(*) from spell_cast_records r where r.spell_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from library_spells s where s.id = r.spell_id))

  -- ---- species ------------------------------------------------------------
  union all select 'party_members.species_id (slug) -> library_species',
    (select count(*) from party_members pm where pm.species_id is not null and pm.species_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from library_species s where s.id = pm.species_id))
  union all select 'party_members.species_id (uuid) -> species',
    (select count(*) from party_members pm where pm.species_id ~ '^[0-9a-f]{8}-'
       and not exists (select 1 from species s where s.id::text = pm.species_id))
  union all select 'party_members.disguise_species_id (any) -> species/library',
    (select count(*) from party_members pm where pm.disguise_species_id is not null
       and not exists (select 1 from species s where s.id::text = pm.disguise_species_id)
       and not exists (select 1 from library_species ls where ls.id = pm.disguise_species_id))
  union all select 'campaigns.disabled_species_ids (elements) -> species/library',
    (select count(*) from campaigns c, unnest(c.disabled_species_ids) as el
       where not exists (select 1 from species s where s.id::text = el)
         and not exists (select 1 from library_species ls where ls.id = el))

  -- ---- jsonb referrers ----------------------------------------------------
  -- These carry shared ids inside documents rather than columns, so no schema
  -- introspection reveals them and no FK can guard them. Every one was already
  -- populated in production and unchecked here until #583.
  union all select 'party_members.wildshape_state.monster_id -> library/monsters',
    (select count(*) from party_members pm
       where pm.wildshape_state is not null and pm.wildshape_state->>'monster_id' is not null
         and not exists (select 1 from library_monsters s where s.id = pm.wildshape_state->>'monster_id')
         and not exists (select 1 from monsters m where m.id::text = pm.wildshape_state->>'monster_id'))
  union all select 'encounters.combatants[].monster_id -> library_monsters',
    (select count(*) from encounters e
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(e.combatants) = 'array' then e.combatants else '[]'::jsonb end) as c
       where c->>'monster_id' is not null
         and c->>'monster_id' !~ '^[0-9a-f]{8}-'
         and not exists (select 1 from library_monsters s where s.id = c->>'monster_id'))
  union all select 'encounter_state.combatants_live[].monster_id -> library_monsters',
    (select count(*) from encounter_state es
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(es.combatants_live) = 'array' then es.combatants_live else '[]'::jsonb end) as c
       where c->>'monster_id' is not null
         and c->>'monster_id' !~ '^[0-9a-f]{8}-'
         and not exists (select 1 from library_monsters s where s.id = c->>'monster_id'))
  -- A `spawn_combatants` round trigger: three levels down, and it summons the
  -- monster mid-fight, so a stranded id here is a broken encounter, not a
  -- cosmetic one.
  union all select 'encounters.events[].actions[].spawns[].monster_id -> library_monsters',
    (select count(*) from encounters e
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(e.events) = 'array' then e.events else '[]'::jsonb end) as ev
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(ev->'actions') = 'array' then ev->'actions' else '[]'::jsonb end) as act
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(act->'spawns') = 'array' then act->'spawns' else '[]'::jsonb end) as sp
       where sp->>'monster_id' is not null
         and sp->>'monster_id' !~ '^[0-9a-f]{8}-'
         and not exists (select 1 from library_monsters s where s.id = sp->>'monster_id'))
  union all select 'spell_cast_records.concentration_state.spell_id -> library_spells',
    (select count(*) from spell_cast_records r
       where r.concentration_state->>'spell_id' is not null
         and r.concentration_state->>'spell_id' !~ '^[0-9a-f]{8}-'
         and not exists (select 1 from library_spells s where s.id = r.concentration_state->>'spell_id'))
  union all select 'party_members.concentration.spell_id -> library_spells',
    (select count(*) from party_members pm
       where pm.concentration->>'spell_id' is not null
         and pm.concentration->>'spell_id' !~ '^[0-9a-f]{8}-'
         and not exists (select 1 from library_spells s where s.id = pm.concentration->>'spell_id'))

  -- granted_spells is a jsonb array of {spell_id, ...} objects on three
  -- separate tables, all three feeding the level-up spell picker. The string
  -- fallback covers any legacy element stored as a bare id.
  union all select 'species.granted_spells[].spell_id -> library_spells',
    (select count(*) from species sp
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(sp.granted_spells) = 'array' then sp.granted_spells else '[]'::jsonb end) as g
       cross join lateral (select coalesce(g->>'spell_id',
         case when jsonb_typeof(g) = 'string' then g#>>'{}' end) as sid) x
       where x.sid is not null and x.sid !~ '^[0-9a-f]{8}-'
         and not exists (select 1 from library_spells s where s.id = x.sid))
  union all select 'custom_subclasses.granted_spells[].spell_id -> library_spells',
    (select count(*) from custom_subclasses cs
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(cs.granted_spells) = 'array' then cs.granted_spells else '[]'::jsonb end) as g
       cross join lateral (select coalesce(g->>'spell_id',
         case when jsonb_typeof(g) = 'string' then g#>>'{}' end) as sid) x
       where x.sid is not null and x.sid !~ '^[0-9a-f]{8}-'
         and not exists (select 1 from library_spells s where s.id = x.sid))
  union all select 'class_feature_options.granted_spells[].spell_id -> library_spells',
    (select count(*) from class_feature_options cfo
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(cfo.granted_spells) = 'array' then cfo.granted_spells else '[]'::jsonb end) as g
       cross join lateral (select coalesce(g->>'spell_id',
         case when jsonb_typeof(g) = 'string' then g#>>'{}' end) as sid) x
       where x.sid is not null and x.sid !~ '^[0-9a-f]{8}-'
         and not exists (select 1 from library_spells s where s.id = x.sid))

  -- ---- notes --------------------------------------------------------------
  -- entity_notes.entity_id is polymorphic: a uuid for user-owned entities, a
  -- shared library id when the note hangs off a library monster or spell, so it
  -- has to resolve against either shared table.
  union all select 'entity_notes.entity_id (slug) -> library_monsters/spells',
    (select count(*) from entity_notes en where en.entity_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from library_monsters s where s.id = en.entity_id)
       and not exists (select 1 from library_spells s where s.id = en.entity_id))
) checks
where cnt > 0
order by cnt desc;
