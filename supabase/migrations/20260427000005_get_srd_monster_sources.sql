-- Migration: get_srd_monster_sources
-- RPC that returns distinct source slugs with monster counts from srd_monsters.
-- Used by the Sources panel in the Bestiary — avoids the 1,000-row Supabase default limit.
-- Also cleans up the incorrectly-seeded rows (all tagged 'wotc-srd' regardless of actual source).

-- Remove the incorrectly-seeded data. The seed script previously used the filter-input slug
-- as the source for every returned monster, so A5e and other-document monsters all ended up
-- tagged as 'wotc-srd'. The corrected seed script (uses m.document__slug from the response)
-- will re-populate this table with accurate per-source labels.
truncate table public.srd_monsters restart identity;

create or replace function public.get_srd_monster_sources()
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
  from srd_monsters
  group by source, source_title
  order by coalesce(source_title, source) nulls last;
$$;

grant execute on function public.get_srd_monster_sources() to anon, authenticated;
