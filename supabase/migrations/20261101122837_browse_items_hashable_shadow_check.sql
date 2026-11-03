-- #999 6.1: browse_items was the slowest read the app makes (430 calls,
-- 169 ms mean in production since 7 Oct). Its shadow check (an own item hides
-- its library twin) joined on `identity match OR name match`, which Postgres
-- cannot hash, so it ran as a nested loop: for the largest campaign, 1,169
-- library rows times the own rows, about 40 of 68 ms. Split into two
-- NOT EXISTS, each an equality, it becomes two hash anti-joins (~3 ms) with
-- the same rows: an equality on a null key never matches, so the identity
-- branch's `is not null` guards are implied. Body otherwise unchanged from
-- 20261014100306.

create or replace function public.browse_items(p_slugs text[], p_ruleset text, p_campaign_id uuid, p_search text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_rarity text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_scope text DEFAULT NULL::text, p_limit integer DEFAULT 48, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  pat as (select private.contains_pattern(p_search) as p),
  own as (
    select i.id::text as id, i.name, i.item_type, i.rarity, i.subtype, i.tags, i.source, i.source_title,
           i.source_document_key, i.source_record_key, i.image_url, i.image_focal_point,
           i.damage_rolls, i.armor_class, i.charges, i.content is not null as has_content,
           i.campaign_id, false as is_shared, 1 as origin
      from public.items i
     -- The caller's own rows (other campaigns' too, for the 'other_campaign'
     -- scope), plus this campaign's rows whoever wrote them and the owner's
     -- library, which a co-DM reads (#590) and the item view marks read-only.
     where (i.ruleset is null or i.ruleset = p_ruleset)
       and ((i.user_id = auth.uid()
             and (p_scope = 'other_campaign' or i.campaign_id is null or i.campaign_id = p_campaign_id))
            or i.campaign_id = p_campaign_id
            or (i.campaign_id is null
                and i.user_id = (select c.user_id from public.campaigns c where c.id = p_campaign_id)))
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
       -- Two anti-joins rather than one with an OR: each is an equality the
       -- planner can hash, where the OR forced a nested loop of every library
       -- row against every own row (#999 6.1).
       and not exists (
         select 1 from own o
          where o.source_document_key = l.source_document_key
            and o.source_record_key = l.source_record_key
       )
       and not exists (
         select 1 from own o
          where o.source is not null
            and not (o.source_document_key is not null and o.source_record_key is not null)
            and lower(o.name) = lower(l.name)
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
       and (p_source is null or coalesce(f.source_document_key, f.source) = p_source)
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
               'has_content', has_content, 'campaign_id', campaign_id, 'is_shared', is_shared,
               'source', source, 'source_title', source_title, 'source_document_key', source_document_key)
             order by lower(name), name, origin, id)
        from page), '[]'::jsonb)
  ) || case when greatest(p_offset, 0) = 0 then jsonb_build_object(
    'total', (select count(*) from filtered),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where not is_shared), '[]'::jsonb),
    -- The Source filter's options: the books and sources of what the page can show.
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('slug', source, 'title', title) order by lower(coalesce(title, source)))
        from (select coalesce(source_document_key, source) as source, max(source_title) as title
                from merged where coalesce(source_document_key, source) is not null
               group by coalesce(source_document_key, source)) s
    ), '[]'::jsonb)
  ) else '{}'::jsonb end
$function$;
