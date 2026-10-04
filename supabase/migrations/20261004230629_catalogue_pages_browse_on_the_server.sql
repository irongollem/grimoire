-- The Monsters, Vault and Spells pages browse on the server (#972, story 5).
--
-- Each page used to load its whole catalogue (every library row of the enabled
-- books plus the DM's own, `select *`: 2.3 MB for the monster library alone)
-- and filter, count and page it in the browser, so a list of 48 cards cost
-- the full table. Each now asks for one page of slim rows, plus what the page
-- used to derive from the whole list in memory: the totals, the ids "select
-- all" acts on, the quota-locked ids and (the Vault) its source options.
--
-- All three are SECURITY INVOKER: RLS decides what the caller may read; the
-- own-row branches also name the caller in the query, as every own-row read
-- here does. The rules mirror the client code they replace, quirks included,
-- because a server rewrite is no place to change what a DM sees:
--   * monsters and spells are never deduped (library and own rows both list);
--     items let an own row shadow its library twin (src/lib/library/libraryShadow.ts);
--   * a monster card's art is the DM's own override, then canonical, then the
--     row's synced copy (useLibraryMonsterArt's merge);
--   * an item card falls back to library_art_defaults by name, only for rows
--     with a source (buildCatalogue's withArt);
--   * custom spells keep RLS's breadth (a player reads their DM's custom spells),
--     and a custom spell carrying source_record_key counts as shared
--     (isSharedContent).
-- Order is by lower(name) then name then id, library before own on ties: close
-- to the old localeCompare, and deterministic so pages never overlap.

-- `%<text>%` for ILIKE with the user's own % _ and \ taken literally, or null
-- when there is nothing to search for.
create function private.contains_pattern(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(coalesce(p_text, '')), '') is null then null
    else '%' || replace(replace(replace(btrim(p_text), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end
$$;

-- ── Monsters ───────────────────────────────────────────────────────────────

create function public.browse_monsters(
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
           lm.stat_block -> 'challenge_rating' as challenge_rating,
           lm.stat_block -> 'armor_class' as armor_class,
           lm.stat_block -> 'hit_points' as hit_points,
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
           m.stat_block -> 'challenge_rating', m.stat_block -> 'armor_class', m.stat_block -> 'hit_points',
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
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'size', size, 'monster_type', monster_type, 'habitat', habitat,
               'source', source, 'source_title', source_title, 'is_shared', is_shared, 'tags', tags,
               'image_url', image_url, 'portrait_focal_point', portrait_focal_point,
               'challenge_rating', challenge_rating, 'armor_class', armor_class, 'hit_points', hit_points)
             order by lower(name), name, origin, id)
        from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'scope_total', (select count(*) from scoped),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where not is_shared), '[]'::jsonb),
    -- The NEWEST own monsters beyond the quota, the ones MonsterList locked.
    'locked_ids', coalesce((
      select jsonb_agg(id) from (
        select id from own order by created_at desc, id limit greatest(p_lock_count, 0)
      ) l), '[]'::jsonb)
  )
$$;

-- ── Items (the Vault) ──────────────────────────────────────────────────────

create function public.browse_items(
  p_slugs       text[],
  p_ruleset     text,
  p_campaign_id uuid,
  p_search      text default null,
  p_type        text default null,
  p_rarity      text default null,
  p_source      text default null,
  -- null: usable here. 'campaign' | 'general' | 'library' | 'other_campaign'.
  -- 'other_campaign' is the one that reads own rows outside this campaign.
  p_scope       text default null,
  p_limit       int  default 48,
  p_offset      int  default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with
  pat as (select private.contains_pattern(p_search) as p),
  own as (
    select i.id::text as id, i.name, i.item_type, i.rarity, i.subtype, i.tags, i.source, i.source_title,
           i.source_document_key, i.source_record_key, i.image_url, i.image_focal_point,
           i.damage_rolls, i.armor_class, i.charges, i.content is not null as has_content,
           i.campaign_id, false as is_shared, 1 as origin
      from public.items i
     where i.user_id = auth.uid()
       and (i.ruleset is null or i.ruleset = p_ruleset)
       and (p_scope = 'other_campaign' or i.campaign_id is null or i.campaign_id = p_campaign_id)
  ),
  lib as (
    select l.id, l.name, l.item_type, l.rarity, l.subtype, l.tags, l.source, l.source_title,
           l.source_document_key, l.source_record_key, l.image_url, l.image_focal_point,
           l.damage_rolls, l.armor_class, l.charges, false as has_content,
           null::uuid as campaign_id, true as is_shared, 0 as origin
      from public.library_items l
     where l.source_document_key = any (array['grimoire-bundled'] || p_slugs)
       and (l.ruleset is null or l.ruleset = p_ruleset)
       -- An own row shadows its library twin: by identity when it carries
       -- both keys, else by name when it has a source; homebrew never does.
       and not exists (
         select 1 from own o
          where (o.source_document_key is not null and o.source_record_key is not null
                 and o.source_document_key = l.source_document_key
                 and o.source_record_key = l.source_record_key)
             or (o.source is not null
                 and not (o.source_document_key is not null and o.source_record_key is not null)
                 and lower(o.name) = lower(l.name))
       )
  ),
  merged as (
    select m.*,
           -- Default art by name, only for a row with a source and no image.
           case when m.source is not null and nullif(m.image_url, '') is null then d.image_url else m.image_url end as card_image_url,
           case when m.source is not null and nullif(m.image_url, '') is null and d.image_url is not null
                then d.image_focal_point else m.image_focal_point end as card_focal_point,
           case when m.is_shared then 'library'
                when m.campaign_id is null then 'general'
                when m.campaign_id = p_campaign_id then 'campaign'
                else 'other_campaign' end as scope
      from (select * from lib union all select * from own) m
      left join public.library_art_defaults d on d.content_type = 'item' and d.content_name = lower(m.name)
  ),
  filtered as (
    select f.* from merged f, pat
     where (p_type is null or f.item_type = p_type)
       and (p_rarity is null or f.rarity = p_rarity)
       and (p_source is null or f.source = p_source)
       and (p_scope is null or f.scope = p_scope)
       and (pat.p is null
            or f.name ilike pat.p
            or f.subtype ilike pat.p
            or exists (select 1 from unnest(f.tags) t where t ilike pat.p))
  ),
  page as (
    select * from filtered
     order by lower(name), name, origin, id
     limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'item_type', item_type, 'rarity', rarity, 'tags', tags,
               'image_url', card_image_url, 'image_focal_point', card_focal_point,
               'damage_rolls', damage_rolls, 'armor_class', armor_class, 'charges', charges,
               'has_content', has_content, 'campaign_id', campaign_id, 'is_shared', is_shared)
             order by lower(name), name, origin, id)
        from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where not is_shared), '[]'::jsonb),
    -- The Source filter's options: the books and sources of what the page can show.
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('slug', source, 'title', title) order by lower(coalesce(title, source)))
        from (select source, max(source_title) as title from merged where source is not null group by source) s
    ), '[]'::jsonb)
  )
$$;

-- ── Spells ─────────────────────────────────────────────────────────────────

create function public.browse_spells(
  p_slugs       text[],
  p_ruleset     text,
  p_campaign_id uuid,
  p_search      text default null,
  p_level       int  default null,
  p_school      text default null,
  p_class       text default null,
  p_source      text default 'all',
  p_limit       int  default 48,
  p_offset      int  default 0
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
    select s.id, s.name, s.level, s.school, s.ritual, s.casting_time, s.range, s.components,
           s.concentration, s.classes, s.tags, s.source, s.source_title, s.source_url,
           true as is_shared, 0 as origin
      from public.library_spells s
     where s.source = any (p_slugs) and s.ruleset = p_ruleset
  ),
  -- No user filter, on purpose: spells_select lets a player read the custom
  -- spells of a DM they share a campaign with, and the player's spell list
  -- relies on it. Scoped by campaign like useAllSpells.
  own as (
    select s.id::text as id, s.name, s.level::int, s.school, s.ritual, s.casting_time, s.range, s.components,
           s.concentration, s.classes, s.tags, s.source, s.source_title, s.source_url,
           s.source_record_key is not null as is_shared, 1 as origin
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
       and (p_class is null or p_class = any (f.classes))
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
               'source', source, 'source_title', source_title, 'source_url', source_url, 'is_shared', is_shared)
             order by level, lower(name), name, origin, id)
        from page), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where not is_shared), '[]'::jsonb)
  )
$$;

revoke execute on function public.browse_monsters(text[], text, uuid, text, text, text, int, int, int) from public, anon;
revoke execute on function public.browse_items(text[], text, uuid, text, text, text, text, text, int, int) from public, anon;
revoke execute on function public.browse_spells(text[], text, uuid, text, int, text, text, text, int, int) from public, anon;
grant execute on function public.browse_monsters(text[], text, uuid, text, text, text, int, int, int) to authenticated, service_role;
grant execute on function public.browse_items(text[], text, uuid, text, text, text, text, text, int, int) to authenticated, service_role;
grant execute on function public.browse_spells(text[], text, uuid, text, int, text, text, text, int, int) to authenticated, service_role;
