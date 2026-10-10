-- browse_monsters reads the stat summary (CR, AC, HP) for the page's rows only
-- (#999 3.2).
--
-- Measured in production on 10 Oct 2026: a bestiary page took about 128 ms,
-- second page or first, because the summary was read inside `filtered`, which
-- the totals also use and Postgres therefore materialises, so every page
-- unpacked the stat block of every monster in scope (3,211 at 2014 rules).
-- Reading 1,000 rows' CR and speed costs about 56 ms against 7 ms without.
--
-- This replaces 3.4.2's plan of stored generated columns. Those would have
-- broken every whole-row copier of `monsters` (the demo copy, ownership
-- transfer, world bundles, copy to campaign) and changed the shape of
-- `get_player_visible_monsters`, for a saving this rewrite gets without a
-- schema change. Same signature and output, so the grants are kept.

create or replace function public.browse_monsters(
  p_slugs       text[],
  p_ruleset     text,
  p_campaign_id uuid,
  p_search      text default null,
  p_source      text default 'all',
  p_type        text default null,
  p_limit       int  default 48,
  p_offset      int  default 0,
  -- How many of the newest own monsters are over the plan's quota (the page
  -- passes `current - limit` from check_all_quotas, 0 when within it).
  p_lock_count  int  default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  pat as (select private.contains_pattern(p_search) as p),
  lib as (
    select lm.id, lm.name, lm.size, lm.monster_type, lm.habitat, lm.source, lm.source_title,
           true as is_shared, lm.tags,
           coalesce(own.image_url, can.image_url, lm.image_url) as image_url,
           coalesce(own.portrait_focal_point, can.portrait_focal_point, lm.portrait_focal_point) as portrait_focal_point,
           null::timestamptz as created_at,
           0 as origin
      from public.library_monsters lm
      left join public.library_monster_art_canonical can on can.entry_id = lm.id
      left join public.library_monster_art own on own.entry_id = lm.id and own.user_id = auth.uid()
     where lm.source = any (p_slugs) and lm.ruleset = p_ruleset
  ),
  own as (
    select m.id::text as id, m.name, m.size, m.monster_type, m.habitat, m.source, m.source_title,
           false as is_shared, m.tags, m.image_url, m.portrait_focal_point,
           m.created_at,
           1 as origin
      from public.monsters m
     where m.user_id = auth.uid()
       and not m.open5e_import
       and (m.ruleset is null or m.ruleset = p_ruleset)
       and (m.campaign_id is null or m.campaign_id = p_campaign_id)
  ),
  scoped as (select * from lib union all select * from own),
  filtered as (
    select s.* from scoped s, pat
     where (coalesce(p_source, 'all') = 'all'
            or (p_source = 'custom' and not s.is_shared)
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
  -- block there unpacked it for every monster in scope on every page.
  paged as (
    select p.*, sb -> 'challenge_rating' as challenge_rating, sb -> 'armor_class' as armor_class,
           sb -> 'hit_points' as hit_points
      from page p
      cross join lateral (
        select case when p.is_shared
                    then (select lm.stat_block from public.library_monsters lm where lm.id = p.id)
                    else (select m.stat_block from public.monsters m where m.id = p.id::uuid)
               end as sb
      ) s
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'size', size, 'monster_type', monster_type, 'habitat', habitat,
               'source', source, 'source_title', source_title, 'is_shared', is_shared, 'tags', tags,
               'image_url', image_url, 'portrait_focal_point', portrait_focal_point,
               'challenge_rating', challenge_rating, 'armor_class', armor_class, 'hit_points', hit_points)
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
$$;
