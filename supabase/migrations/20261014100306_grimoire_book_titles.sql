-- Our own books are called "Grimoire <Area>", one way, everywhere.
--
-- A row's source is now shown the same on every screen: the book's title from
-- this table (src/lib/library/sourceLabel.ts), never a generic "Library",
-- "Reference" or "Official". That made the inconsistency in our own titles
-- visible: "Grimoire Bestiary (homebrew)" and "Grimoire Species (homebrew)"
-- beside a plain "Grimoire Dungeon Craft", and the publisher "Grimoire" on some
-- of our sources and "Dungeon Grimoire" on others. The maintainer's call
-- (14 Oct 2026): "Grimoire <Area>", no "(homebrew)" in a title. That the content
-- is original homebrew is still said by each book's copyright notice and by
-- the Licences page, which lists it under "Grimoire original content".

update public.content_sources set title = v.title, publisher = 'Dungeon Grimoire'
  from (values
    ('grimoire-bestiary',           'Grimoire Bestiary'),
    ('grimoire-species',            'Grimoire Species'),
    ('grimoire-backgrounds',        'Grimoire Backgrounds'),
    ('grimoire-dungeon-craft',      'Grimoire Dungeon Craft'),
    ('grimoire-bundled',            'Grimoire Equipment'),
    ('grimoire-system',             'Grimoire Classes'),
    ('grimoire-2024-compatibility', 'Grimoire 2024 Compatibility'),
    ('grimoire-art',                'Grimoire Art')
  ) as v(key, title)
 where content_sources.key = v.key;

-- Library rows keep a copy of their book's title. The client names a book by
-- key from content_sources, so a stale copy is never shown; these are brought
-- in line anyway so a read of the row itself agrees. Only our own library rows:
-- a DM's customized copy keeps whatever it was copied with, and is labelled by
-- its key all the same.
update public.library_monsters    set source_title = 'Grimoire Bestiary'    where source_document_key = 'grimoire-bestiary';
update public.library_species     set source_title = 'Grimoire Species'     where source_document_key = 'grimoire-species';
update public.library_backgrounds set source_title = 'Grimoire Backgrounds' where source_document_key = 'grimoire-backgrounds';

-- The Licences page listed only the books holding monsters, spells, items,
-- species, rules or classes, so the books added since (Backgrounds, Dungeon
-- Craft) never appeared on it. They have no per-kind column; they count toward
-- `entry_count`, which is what puts a book on the page.
create or replace function public.get_content_licenses()
returns table(key text, open5e_key text, title text, publisher text,
              license_keys text[], copyright_notice text, product_url text,
              gamesystem text, monster_count bigint, spell_count bigint,
              item_count bigint, species_count bigint, rule_count bigint,
              class_count bigint, entry_count bigint, sort_order integer)
language sql
stable
set search_path to 'public'
as $function$
  with tallies as (
    select source_document_key as k, 'monster'::text as kind, count(*) as n from library_monsters group by 1
    union all
    select source_document_key, 'spell',   count(*) from library_spells   group by 1
    union all
    select source_document_key, 'item',    count(*) from library_items    group by 1
    union all
    select source_document_key, 'species', count(*) from library_species  group by 1
    union all
    select source_document_key, 'rule',    count(*) from library_rules    group by 1
    union all
    select source_document_key, 'class',   count(*) from system_classes   group by 1
    union all
    select source_document_key, 'other',   count(*) from library_backgrounds group by 1
    union all
    select source, 'other', count(*) from library_traps            group by 1
    union all
    select source, 'other', count(*) from library_dungeon_features group by 1
    union all
    select source, 'other', count(*) from library_puzzles          group by 1
    union all
    select source, 'other', count(*) from library_roll_tables      group by 1
  ),
  rolled as (
    select
      k,
      coalesce(sum(n) filter (where kind = 'monster'), 0) as monster_count,
      coalesce(sum(n) filter (where kind = 'spell'),   0) as spell_count,
      coalesce(sum(n) filter (where kind = 'item'),    0) as item_count,
      coalesce(sum(n) filter (where kind = 'species'), 0) as species_count,
      coalesce(sum(n) filter (where kind = 'rule'),    0) as rule_count,
      coalesce(sum(n) filter (where kind = 'class'),   0) as class_count,
      coalesce(sum(n), 0)                                 as entry_count
    from tallies
    where k is not null
    group by k
  )
  select
    r.k,
    cs.open5e_key,
    coalesce(cs.title, r.k),
    coalesce(cs.publisher, 'Uncatalogued source'),
    coalesce(cs.license_keys, '{}'::text[]),
    cs.copyright_notice,
    cs.product_url,
    cs.gamesystem,
    r.monster_count,
    r.spell_count,
    r.item_count,
    r.species_count,
    r.rule_count,
    r.class_count,
    r.entry_count,
    coalesce(cs.sort_order, 999)
  from rolled r
  left join content_sources cs on cs.key = r.k
  order by coalesce(cs.sort_order, 999), coalesce(cs.title, r.k);
$function$;

-- An item names its book by `source_document_key`: the bundled equipment is
-- 'grimoire-bundled' with a `source` of 'srd' or nothing. The browse rows did
-- not carry either, so an item card could not say which book it came from, and
-- the Source filter grouped by `source`, which filed 152 Grimoire Equipment rows
-- under "srd". Rows now carry the three fields, and the filter and its options
-- key on `source_document_key`, falling back to `source` (a DM's typed source),
-- the same key the card's badge reads.
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
