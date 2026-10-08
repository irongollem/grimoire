-- The Spellbook's cards carry art, as the Bestiary's do: a spell row from
-- browse_spells now names its picture, so the list can draw the same art-led
-- card the monster and NPC grids use rather than a text-only tile.
--
-- Art resolves exactly as useLibrarySpellArtEntry does on the detail page, and
-- as browse_monsters does for monsters: the caller's own override wins, then the
-- canonical library art, then whatever the library row itself carries. A custom
-- spell keeps its art on its own row. The key is `image_focal_point`, the name
-- the Spell type already uses, not the art tables' `portrait_focal_point`.
--
-- Same signature, so `create or replace` keeps the grants; still SECURITY
-- INVOKER, so RLS on both art tables decides what the caller may read.

CREATE OR REPLACE FUNCTION public.browse_spells(p_slugs text[], p_ruleset text, p_campaign_id uuid, p_search text DEFAULT NULL::text, p_level integer DEFAULT NULL::integer, p_school text DEFAULT NULL::text, p_class text DEFAULT NULL::text, p_source text DEFAULT 'all'::text, p_limit integer DEFAULT 48, p_offset integer DEFAULT 0, p_extra_ids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  pat as (select private.contains_pattern(p_search) as p),
  lib as (
    select s.id, s.name, s.level, s.school, s.ritual, s.casting_time, s.range, s.components,
           s.concentration, s.classes, s.tags, s.source, s.source_title, s.source_url,
           coalesce(mine.image_url, can.image_url, s.image_url) as image_url,
           coalesce(mine.portrait_focal_point, can.portrait_focal_point, s.image_focal_point) as image_focal_point,
           true as is_shared, false as is_own, 0 as origin
      from public.library_spells s
      left join public.library_spell_art_canonical can on can.entry_id = s.id
      left join public.library_spell_art mine on mine.entry_id = s.id and mine.user_id = (select auth.uid())
     where s.source = any (p_slugs) and s.ruleset = p_ruleset
  ),
  -- No user filter, on purpose: spells_select lets a player read the custom
  -- spells of a DM they share a campaign with, and the player's spell list
  -- relies on it. Scoped by campaign like useAllSpells. So a listed custom
  -- spell is not necessarily the caller's: `is_own` says which are, and only
  -- those can be edited or selected.
  own as (
    select s.id::text as id, s.name, s.level::int, s.school, s.ritual, s.casting_time, s.range, s.components,
           s.concentration, s.classes, s.tags, s.source, s.source_title, s.source_url,
           s.image_url, s.image_focal_point,
           s.source_record_key is not null as is_shared,
           s.user_id = (select auth.uid()) as is_own, 1 as origin
      from public.spells s
     where not s.open5e_import
       and (s.ruleset is null or s.ruleset = p_ruleset)
       and (s.campaign_id is null or s.campaign_id = p_campaign_id)
  ),
  scoped as (select * from lib union all select * from own),
  filtered as (
    select f.* from scoped f, pat
     where (coalesce(p_source, 'all') = 'all'
            or (p_source = 'custom' and not f.is_shared)
            or f.source = p_source)
       and (p_level is null or f.level = p_level)
       and (p_school is null or f.school = p_school)
       and (p_class is null or p_class = any (f.classes) or f.id = any (p_extra_ids))
       and (pat.p is null or f.name ilike pat.p)
  ),
  page as (
    select * from filtered
     order by level, lower(name), name, origin, id
     limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'level', level, 'school', school, 'ritual', ritual,
               'casting_time', casting_time, 'range', range, 'components', components,
               'concentration', concentration, 'classes', classes, 'tags', tags,
               'source', source, 'source_title', source_title, 'source_url', source_url,
               'image_url', image_url, 'image_focal_point', image_focal_point, 'is_shared', is_shared,
               'is_own', is_own)
             order by level, lower(name), name, origin, id)
        from page), '[]'::jsonb)
  ) || case when greatest(p_offset, 0) = 0 then jsonb_build_object(
    'total', (select count(*) from filtered),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where is_own and not is_shared), '[]'::jsonb)
  ) else '{}'::jsonb end
$function$;
