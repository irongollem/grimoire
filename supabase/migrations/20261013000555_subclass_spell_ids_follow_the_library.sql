-- Subclass spell grants name the library's spells by the ids it actually has.
--
-- 20261008165036 wrote the library subclasses' spells from data generated
-- against a local database that still held the retired `wotc-srd` spell rows,
-- so most SRD 5.1 spells were named `srd_<slug>` (`srd_speak_with_animals`).
-- 20260722000002 had deleted those rows in production in favour of the
-- `srd-2014` ones, `srd_srd_<slug>`. The grants pointed at nothing: in
-- production 173 of 280 granted and 59 of 82 expanded spell ids on library
-- subclasses matched no spell, so a Storm Domain cleric got Thunderwave and
-- nothing else from the domain list. The generator's inputs are fixed in the
-- same change (scripts/data/library-spell-ids.json excludes `wotc-srd`).
--
-- The repair is generic, not a list: an id that matches no library spell and
-- whose `srd_srd_` successor exists becomes that successor, in all five spell
-- maps of every subclass. That covers the library rows and any DM's copy made
-- from one, and it is a no-op where the old rows still exist (a stale local
-- seed) because only an id that matches nothing is touched. A custom spell's
-- uuid never matches the `srd_` prefix. Order within a level is kept, and a
-- level that held both forms of one spell keeps it once.
--
-- Changing `granted_spells` / `spell_variants` fires
-- custom_subclasses_resync_characters, which grants the now-resolvable spells
-- to every character already on the subclass.

create function private.retired_srd_spell_id_successor(p_id text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from public.library_spells s where s.id = p_id) then p_id
    when p_id like 'srd\_%'
      and exists (select 1 from public.library_spells s where s.id = 'srd_srd_' || substr(p_id, 5))
      then 'srd_srd_' || substr(p_id, 5)
    else p_id
  end
$$;

-- `{ "<level>": [id, ...] }` with every id replaced by its successor.
create function private.remap_spell_level_map(p_map jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(lvl.key, (
           select coalesce(jsonb_agg(x.id order by x.first_seen), '[]'::jsonb)
             from (select private.retired_srd_spell_id_successor(a.id) as id, min(a.ord) as first_seen
                     from jsonb_array_elements_text(lvl.value) with ordinality as a(id, ord)
                    group by 1) x)),
         '{}'::jsonb)
    from jsonb_each(p_map) as lvl
$$;

-- `{ "<option>": { "<level>": [id, ...] } }`, each option's map remapped.
create function private.remap_spell_variant_map(p_map jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(opt.key, private.remap_spell_level_map(opt.value)), '{}'::jsonb)
    from jsonb_each(p_map) as opt
$$;

update public.custom_subclasses s
   set granted_spells          = r.granted_spells,
       spell_variants          = r.spell_variants,
       expanded_spells         = r.expanded_spells,
       expanded_spell_variants = r.expanded_spell_variants
  from (select id,
               private.remap_spell_level_map(granted_spells)            as granted_spells,
               private.remap_spell_variant_map(spell_variants)          as spell_variants,
               private.remap_spell_level_map(expanded_spells)           as expanded_spells,
               private.remap_spell_variant_map(expanded_spell_variants) as expanded_spell_variants
          from public.custom_subclasses) r
 where r.id = s.id
   and (s.granted_spells, s.spell_variants, s.expanded_spells, s.expanded_spell_variants)
       is distinct from (r.granted_spells, r.spell_variants, r.expanded_spells, r.expanded_spell_variants);

drop function private.remap_spell_variant_map(jsonb);
drop function private.remap_spell_level_map(jsonb);
drop function private.retired_srd_spell_id_successor(text);
