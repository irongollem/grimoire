-- The Bestiary's Source filter gains "This campaign": the monsters whose
-- campaign_id is the active campaign, leaving out the DM's global library
-- ("Custom" keeps meaning every own monster in scope). The value is
-- `p_source = 'campaign'`; with no campaign it matches nothing.
--
-- Only the `own` CTE's new campaign_id column (null for library rows) and the
-- one filter line change; the rest is 20261013231042's body unchanged, which
-- production matched when this was written.

CREATE OR REPLACE FUNCTION public.browse_monsters(p_slugs text[], p_ruleset text, p_campaign_id uuid, p_search text DEFAULT NULL::text, p_source text DEFAULT 'all'::text, p_type text DEFAULT NULL::text, p_limit integer DEFAULT 48, p_offset integer DEFAULT 0, p_lock_count integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  pat as (select private.contains_pattern(p_search) as p),
  lib as (
    select lm.id, lm.name, lm.size, lm.monster_type, lm.habitat, lm.source, lm.source_title,
           true as is_shared, lm.tags,
           coalesce(own.image_url, can.image_url, lm.image_url) as image_url,
           coalesce(own.portrait_focal_point, can.portrait_focal_point, lm.portrait_focal_point) as portrait_focal_point,
           null::timestamptz as created_at,
           0 as origin,
           lm.id as lib_id, null::uuid as own_id, null::uuid as campaign_id
      from public.library_monsters lm
      left join public.library_monster_art_canonical can on can.entry_id = lm.id
      left join public.library_monster_art own on own.entry_id = lm.id and own.user_id = auth.uid()
     where lm.source = any (p_slugs) and lm.ruleset = p_ruleset
  ),
  own as (
    select m.id::text as id, m.name, m.size, m.monster_type, m.habitat, m.source, m.source_title,
           false as is_shared, m.tags, m.image_url, m.portrait_focal_point,
           m.created_at,
           1 as origin,
           null::text as lib_id, m.id as own_id, m.campaign_id
      from public.monsters m
     -- This campaign's rows whoever wrote them, the caller's library, and the
     -- owner's, which a co-DM reads (#590) and the monster views mark read-only.
     where not m.open5e_import
       and (m.ruleset is null or m.ruleset = p_ruleset)
       and (m.campaign_id = p_campaign_id
            or (m.campaign_id is null
                and (m.user_id = auth.uid()
                     or m.user_id = (select c.user_id from public.campaigns c where c.id = p_campaign_id))))
  ),
  scoped as (select * from lib union all select * from own),
  filtered as (
    select s.* from scoped s, pat
     where (coalesce(p_source, 'all') = 'all'
            or (p_source = 'custom' and not s.is_shared)
            or (p_source = 'campaign' and s.campaign_id = p_campaign_id)
            or s.source = p_source)
       and (p_type is null or s.monster_type = p_type)
       and (pat.p is null
            or s.name ilike pat.p
            or s.monster_type ilike pat.p
            or s.habitat ilike pat.p
            or exists (select 1 from unnest(s.tags) t where t ilike pat.p))
  ),
  page as (
    select * from filtered
     order by lower(name), name, origin, id
     limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ),
  -- The stat summary is read for the page's rows only. `filtered` is used twice
  -- (the page and the totals), so it is materialised, and reading the stat
  -- block there unpacked it for every monster in scope on every page. Each row
  -- carries its key typed for its own table, so the join needs no cast.
  paged as (
    select p.*, coalesce(lm.stat_block, m.stat_block) as sb
      from page p
      left join public.library_monsters lm on lm.id = p.lib_id
      left join public.monsters m on m.id = p.own_id
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'size', size, 'monster_type', monster_type, 'habitat', habitat,
               'source', source, 'source_title', source_title, 'is_shared', is_shared, 'tags', tags,
               'image_url', image_url, 'portrait_focal_point', portrait_focal_point,
               'challenge_rating', sb -> 'challenge_rating', 'armor_class', sb -> 'armor_class',
               'hit_points', sb -> 'hit_points')
             order by lower(name), name, origin, id)
        from paged), '[]'::jsonb)
  ) || case when greatest(p_offset, 0) = 0 then jsonb_build_object(
    'total', (select count(*) from filtered),
    'scope_total', (select count(*) from scoped),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where not is_shared), '[]'::jsonb),
    -- The NEWEST own monsters beyond the quota, the ones MonsterList locked.
    'locked_ids', coalesce((
      select jsonb_agg(id) from (
        select id from own order by created_at desc, id limit greatest(p_lock_count, 0)
      ) l), '[]'::jsonb)
  ) else '{}'::jsonb end
$function$;
