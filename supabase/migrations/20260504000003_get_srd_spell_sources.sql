-- Migration: get_srd_spell_sources
-- RPC that returns distinct source slugs with spell counts from srd_spells.
-- Used by the Sources panel in the Spellbook — mirrors get_srd_monster_sources().

create or replace function public.get_srd_spell_sources()
returns table(source text, source_title text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    source,
    source_title,
    count(*) as count
  from srd_spells
  where source is not null
  group by source, source_title
  order by coalesce(source_title, source) nulls last;
$$;

grant execute on function public.get_srd_spell_sources() to anon, authenticated;
