-- World Web (#1084): an Open Book release carries the ties between its entries, so the reader prints a page's
-- connections as cross-references with page numbers ("Worshipped by Brenna Ashe, p. 14"). private.open_book_snapshot
-- is restated whole (its current definition, 20261023230211 and later) with one block added before the result and
-- one key (`ties`) in it. A release made before this has no `ties`; the reader treats the key as optional.

CREATE OR REPLACE FUNCTION private.open_book_snapshot(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_book public.open_books;
  v_campaign public.campaigns;
  v_party uuid[];
  v_places jsonb := '[]'::jsonb;
  v_folk jsonb := '[]'::jsonb;
  v_factions jsonb := '[]'::jsonb;
  v_pantheons jsonb := '[]'::jsonb;
  v_deities jsonb := '[]'::jsonb;
  v_lore jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_cited uuid[];
  v_entry_ids uuid[];
  v_ties jsonb := '[]'::jsonb;
  v_concealed uuid[];
begin
  select * into v_book from public.open_books where campaign_id = p_campaign_id;
  if not found then
    return null;
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  select coalesce(array_agg(pm.id), '{}'::uuid[]) into v_party
    from public.party_members pm where pm.campaign_id = p_campaign_id;

  if 'atlas' = any (v_book.chapters) then
    -- As get_player_visible_locations: description and map only when shared, DM notes and audio never, and
    -- only the pins players may see.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id,
             'parent_id', l.parent_id,
             'name', l.name,
             'location_type', l.location_type,
             'player_summary', l.player_summary,
             'description', case when l.is_description_shared then private.withhold_secret_blocks(l.description) end,
             'image_url', l.image_url,
             'tags', to_jsonb(l.tags),
             'is_level', l.is_level,
             'is_battle_map', l.is_battle_map,
             'npcs_shared', l.is_npcs_shared,
             'map', case when l.is_map_shared then jsonb_build_object(
                      'url', l.map_url,
                      'layer_url', l.map_layer_url,
                      'layer_calibration', l.map_layer_calibration,
                      'plan_size', l.plan_size,
                      'scale', l.map_scale) end,
             'pins', coalesce((
                      select jsonb_agg(pin)
                        from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
                       where coalesce((pin->>'visible_to_players')::boolean, false)), '[]'::jsonb)
           ) order by l.sort_order nulls last, l.name), '[]'::jsonb)
      into v_places
      from public.locations l
     where l.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'location', l.id,
             private.open_book_whole_party(l.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'folk' = any (v_book.chapters) then
    -- As get_player_visible_npcs: only the fields the DM shares, the cover while a disguise holds, the cover the
    -- party knew once it falls, and no prose (players are never shown an NPC's appearance, personality or
    -- backstory). A person whose name is not shared has no page to be on.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'name', case when s.concealed and s.disguise_name is not null then s.disguise_name else s.name end,
             'race', case when 'race' = any (s.player_visible_fields) then s.race end,
             'occupation', case when 'occupation' = any (s.player_visible_fields) then s.occupation end,
             'status', s.status,
             'relationship', s.relationship,
             'portrait_url', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
                else s.portrait_url end,
             'portrait_focal_point', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
                else s.portrait_focal_point end,
             'cutout_url', case when 'portrait' = any (s.player_visible_fields) and not s.concealed then s.cutout_url end,
             'location_id', case when 'location' = any (s.player_visible_fields) then s.location_id end,
             'former_name', case when s.unmasked then s.disguise_name end,
             'former_portrait_url', case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url end
           ) order by s.name), '[]'::jsonb)
      into v_folk
      from (
        select n.*,
          ((n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed) as concealed,
          (n.is_revealed and n.unmasked_at is not null
            and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
          from public.npcs n
         where n.campaign_id = p_campaign_id
           and 'name' = any (n.player_visible_fields)
      ) s
     where private.open_book_takes(p_campaign_id, 'npc', s.id,
             private.open_book_whole_party(s.player_visible_to, v_party)
             -- or shared with the party through the place they live, as the projection's arm (b)
             or exists (
               select 1 from public.locations l
                where l.id = s.location_id
                  and l.is_npcs_shared
                  and private.open_book_whole_party(l.player_visible_to, v_party)),
             v_book.include_shared);
  end if;

  if 'factions' = any (v_book.chapters) then
    -- As get_player_visible_factions: descent is the party's to know, the succession custom is not.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'name', f.name,
             'faction_type', f.faction_type,
             'description', private.withhold_secret_blocks(f.description),
             'emblem_url', f.emblem_url,
             'alignment', f.alignment,
             'tags', to_jsonb(f.tags),
             'party_standing', f.party_standing,
             'descent', f.descent
           ) order by f.name), '[]'::jsonb)
      into v_factions
      from public.factions f
     where f.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'faction', f.id,
             private.open_book_whole_party(f.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'pantheon' = any (v_book.chapters) then
    -- Players read pantheons and deities as raw rows (DM notes on them live in entity_notes, which the book never
    -- reads); the book also strips the secret blocks the raw read would show.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'description', private.withhold_secret_blocks(p.description),
             'emblem_url', p.emblem_url,
             'tags', to_jsonb(p.tags)
           ) order by p.name), '[]'::jsonb)
      into v_pantheons
      from public.pantheons p
     where p.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'pantheon', p.id,
             private.open_book_whole_party(p.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id,
             'pantheon_id', d.pantheon_id,
             'name', d.name,
             'titles', d.titles,
             'alternate_names', to_jsonb(d.alternate_names),
             'alignment', d.alignment,
             'symbol', d.symbol,
             'symbol_image_url', d.symbol_image_url,
             'portrait_url', d.portrait_url,
             'portrait_focal_point', d.portrait_focal_point,
             'domains', to_jsonb(d.domains),
             'portfolio', d.portfolio,
             'description', private.withhold_secret_blocks(d.description),
             'tags', to_jsonb(d.tags)
           ) order by d.name), '[]'::jsonb)
      into v_deities
      from public.deities d
     where d.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'deity', d.id,
             private.open_book_whole_party(d.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'lore' = any (v_book.chapters) then
    -- As get_player_visible_notes, less the session reports, which are the Chronicle's.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'category', n.category,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'is_pinned', n.is_pinned,
             'created_at', n.created_at,
             'updated_at', n.updated_at
           ) order by n.is_pinned desc, n.sort_order nulls last, n.title), '[]'::jsonb)
      into v_lore
      from public.notes n
     where n.campaign_id = p_campaign_id
       and n.category is distinct from 'session'
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'chronicle' = any (v_book.chapters) then
    -- Session reports, with the session they belong to (get_player_sessions' columns).
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'session', case when cs.id is not null then jsonb_build_object(
                          'number', cs.number, 'title', cs.title, 'played_on', cs.played_on) end,
             'date', case when n.session_start_year is not null then jsonb_build_object(
                       'year', n.session_start_year, 'month', n.session_start_month, 'day', n.session_start_day,
                       'end_year', n.session_end_year, 'end_month', n.session_end_month, 'end_day', n.session_end_day) end,
             'real_date', n.session_real_date,
             'created_at', n.created_at
           ) order by cs.number nulls last, n.session_real_date nulls last, n.created_at), '[]'::jsonb)
      into v_sessions
      from public.notes n
      left join public.campaign_sessions cs on cs.id = n.session_id
     where n.campaign_id = p_campaign_id
       and n.category = 'session'
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);

    -- The calendar players already read (calendar_events_select): shown events and every session. Never the
    -- DM's links to quests, encounters or places.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'description', private.withhold_secret_blocks(e.description),
             'event_type', e.event_type,
             'year', e.harptos_year, 'month', e.harptos_month, 'day', e.harptos_day,
             'festival_day', e.festival_day,
             'is_multi_day', e.is_multi_day,
             'end_year', e.end_year, 'end_month', e.end_month, 'end_day', e.end_day,
             'color', e.color
           ) order by e.harptos_year nulls last, e.harptos_month nulls last, e.harptos_day nulls last), '[]'::jsonb)
      into v_events
      from public.calendar_events e
     where e.campaign_id = p_campaign_id
       and (e.player_visible or e.event_type = 'session');
  end if;

  -- Rich text mentions people and places by id only (entityMention stores no label), so the book carries a
  -- name for every id its own pages cite, when the whole table can already read that name: the party's
  -- characters, people under their cover, places and factions. Only cited ids: an entry the DM took out keeps
  -- its name out of the book unless released text names it. A mention of anything else stays unnamed.
  -- Cited means an entityMention in the released text, nothing else: a place's parent_id, a pin or a file name
  -- also hold ids, and reading those would name a place the DM took out (#1085 audit).
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
    into v_cited
    from (
      select jsonb_path_query(v_places, '$[*].description') #>> '{}' as doc
      union all select jsonb_path_query(v_factions, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_pantheons, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_deities, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_lore, '$[*].content') #>> '{}'
      union all select jsonb_path_query(v_sessions, '$[*].content') #>> '{}'
      union all select jsonb_path_query(v_events, '$[*].description') #>> '{}'
    ) t
    cross join lateral unnest(private.open_book_mentions(t.doc)) as c(id);

  select coalesce(jsonb_object_agg(x.id::text, x.name), '{}'::jsonb)
    into v_names
    from (
      select pm.id, pm.name from public.party_members pm where pm.campaign_id = p_campaign_id
      union all
      select n.id,
             case when (n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed
                       and n.disguise_name is not null
                  then n.disguise_name else n.name end
        from public.npcs n
       where n.campaign_id = p_campaign_id
         and 'name' = any (n.player_visible_fields)
         and (private.open_book_whole_party(n.player_visible_to, v_party)
              or exists (
                select 1 from public.locations l
                 where l.id = n.location_id
                   and l.is_npcs_shared
                   and private.open_book_whole_party(l.player_visible_to, v_party)))
      union all
      select l.id, l.name from public.locations l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select f.id, f.name from public.factions f
       where f.campaign_id = p_campaign_id and private.open_book_whole_party(f.player_visible_to, v_party)
    ) x
   where x.name is not null
     and x.id = any (v_cited);

  -- World Web (#1084): the ties between two entries that are both in the book, as cross-references. The book
  -- never runs ahead of the table: a link only once the whole party knows it, a record by the rule the player
  -- projection already applies (a covert membership, or one of a disguised NPC, stays the DM's; a home only where the
  -- NPC's location is shared).
  -- A tie to anything not in this release is left out, so a reader can follow every one to its page.
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) into v_entry_ids
    from (
      select (e->>'id')::uuid as id from jsonb_array_elements(v_places) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_folk) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_factions) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_deities) e
    ) x;

  -- A disguised NPC is in the book under the cover; the true one's allegiances and family stay out until it falls.
  select coalesce(array_agg(n.id), '{}'::uuid[]) into v_concealed
    from public.npcs n
   where n.campaign_id = p_campaign_id and not n.is_revealed
     and (n.disguise_name is not null or n.disguise_portrait_url is not null);

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', t.source, 'type', t.type,
           'from_kind', t.from_kind, 'from_id', t.from_id, 'to_kind', t.to_kind, 'to_id', t.to_id,
           'told', t.told)
           order by t.source, t.type, t.from_id, t.to_id), '[]'::jsonb)
    into v_ties
    from (
      select 'link' as source, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, nullif(l.told, '') as told
        from public.world_links l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select 'membership', 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null
        from public.faction_npcs m join public.factions f on f.id = m.faction_id
       where f.campaign_id = p_campaign_id
         and not private.is_covert_role(m.role)
         and m.npc_id <> all (v_concealed)
      union all
      select 'npc_home', 'lives_in', 'npc', n.id, 'location', n.location_id, null
        from public.npcs n
       where n.campaign_id = p_campaign_id and n.location_id is not null and 'location' = any (n.player_visible_fields)
      union all
      select 'seat', 'seat', 'faction', f.id, 'location', f.seat_location_id, null
        from public.factions f where f.campaign_id = p_campaign_id and f.seat_location_id is not null
      union all
      select 'kin', k.kind || '_of', 'npc', k.from_npc_id, 'npc', k.to_npc_id, null
        from public.kin_links k
       where k.campaign_id = p_campaign_id and k.from_npc_id is not null and k.to_npc_id is not null
         and k.from_npc_id <> all (v_concealed) and k.to_npc_id <> all (v_concealed)
    ) t
   where t.from_id = any (v_entry_ids) and t.to_id = any (v_entry_ids);

  return jsonb_build_object(
    'v', 1,
    'book', jsonb_build_object(
      'title', v_book.title,
      'subtitle', v_book.subtitle,
      'cover_art', v_book.cover_art,
      'cover_image_url', v_book.cover_image_url,
      'leather', v_book.leather,
      'chapters', to_jsonb(v_book.chapters),
      'campaign_name', v_campaign.name),
    'calendar', jsonb_build_object(
      'calendar_id', v_campaign.calendar_id,
      'custom_calendar', v_campaign.custom_calendar,
      'current', jsonb_build_object('year', v_campaign.current_year, 'month', v_campaign.current_month, 'day', v_campaign.current_day)),
    'places', v_places,
    'folk', v_folk,
    'factions', v_factions,
    'pantheons', v_pantheons,
    'deities', v_deities,
    'lore', v_lore,
    'sessions', v_sessions,
    'events', v_events,
    'names', v_names,
    'ties', v_ties,
    'stats', jsonb_build_object(
      'places', jsonb_array_length(v_places),
      'folk', jsonb_array_length(v_folk),
      'factions', jsonb_array_length(v_factions),
      'pantheons', jsonb_array_length(v_pantheons),
      'deities', jsonb_array_length(v_deities),
      'lore', jsonb_array_length(v_lore),
      'sessions', jsonb_array_length(v_sessions),
      'events', jsonb_array_length(v_events))
  );
end;
$function$;
