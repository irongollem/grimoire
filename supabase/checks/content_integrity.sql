-- Content referential integrity — dangling shared-content references.
--
-- The shared library tables (srd_monsters/srd_spells/srd_items/srd_species) are
-- referenced from user data by TEXT ids with no FK (slugs can't FK a uuid
-- column, and species refs deliberately hold either shape). Twice now an id
-- transition remapped most-but-not-all referrers and shipped silently:
--   * #553 (20260722000002) missed discovered_monsters.srd_slug → every
--     discovered SRD creature rendered "Unknown creature" (fixed 20260724000004)
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

select check_name, cnt from (
  select 'discovered_monsters.srd_slug -> srd_monsters' as check_name,
    (select count(*) from discovered_monsters d where d.srd_slug is not null
       and not exists (select 1 from srd_monsters s where s.id = d.srd_slug)) as cnt
  union all select 'pinned_forms.srd_slug -> srd_monsters',
    (select count(*) from pinned_forms p where p.srd_slug is not null
       and not exists (select 1 from srd_monsters s where s.id = p.srd_slug))
  union all select 'companions.source_monster_id (slug) -> srd_monsters',
    (select count(*) from companions c where c.source_monster_id is not null
       and c.source_monster_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from srd_monsters s where s.id = c.source_monster_id))
  union all select 'srd_monster_art.srd_id -> srd_monsters',
    (select count(*) from srd_monster_art a
       where not exists (select 1 from srd_monsters s where s.id = a.srd_id))
  union all select 'srd_spell_art.srd_id -> srd_spells',
    (select count(*) from srd_spell_art a
       where not exists (select 1 from srd_spells s where s.id = a.srd_id))
  union all select 'character_spells.spell_id (slug) -> srd_spells',
    (select count(*) from character_spells cs where cs.spell_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from srd_spells s where s.id = cs.spell_id))
  union all select 'spell_cast_records.spell_id (slug) -> srd_spells',
    (select count(*) from spell_cast_records r where r.spell_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from srd_spells s where s.id = r.spell_id))
  union all select 'party_members.species_id (slug) -> srd_species',
    (select count(*) from party_members pm where pm.species_id is not null and pm.species_id !~ '^[0-9a-f]{8}-'
       and not exists (select 1 from srd_species s where s.id = pm.species_id))
  union all select 'party_members.species_id (uuid) -> species',
    (select count(*) from party_members pm where pm.species_id ~ '^[0-9a-f]{8}-'
       and not exists (select 1 from species s where s.id::text = pm.species_id))
  union all select 'party_members.disguise_species_id (any) -> species/srd',
    (select count(*) from party_members pm where pm.disguise_species_id is not null
       and not exists (select 1 from species s where s.id::text = pm.disguise_species_id)
       and not exists (select 1 from srd_species ss where ss.id = pm.disguise_species_id))
  union all select 'campaigns.disabled_species_ids (elements) -> species/srd',
    (select count(*) from campaigns c, unnest(c.disabled_species_ids) as el
       where not exists (select 1 from species s where s.id::text = el)
         and not exists (select 1 from srd_species ss where ss.id = el))
  union all select 'party_members.wildshape_state.monster_id -> srd/monsters',
    (select count(*) from party_members pm
       where pm.wildshape_state is not null and pm.wildshape_state->>'monster_id' is not null
         and not exists (select 1 from srd_monsters s where s.id = pm.wildshape_state->>'monster_id')
         and not exists (select 1 from monsters m where m.id::text = pm.wildshape_state->>'monster_id'))
) checks
where cnt > 0
order by cnt desc;
