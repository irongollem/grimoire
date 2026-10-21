-- #1086 parts 3-4: weather by climate, and ages from a birth date.
--
-- Weather is computed on the client from the date, the season and a climate,
-- seeded so the same day in the same place always has the same weather (see
-- src/lib/calendar/weather.ts). The database only stores the climate: a
-- campaign's default, and an optional one per Atlas place, inherited down the
-- tree. Null on a place means "as the place it sits in".
--
-- 'underground' has no weather at all (a cave, the Underdark, a sealed vault).

alter table public.campaigns
  add column climate text not null default 'temperate'
    constraint campaigns_climate_check
      check (climate in ('polar', 'cold', 'temperate', 'warm', 'tropical', 'arid', 'underground'));

alter table public.locations
  add column climate text
    constraint locations_climate_check
      check (climate in ('polar', 'cold', 'temperate', 'warm', 'tropical', 'arid', 'underground'));

-- Terrain decides which weather hazards a place can have (#1086): an avalanche
-- needs slopes, a wildfire needs something to burn. Null inherits from the
-- parent place, then reads as no particular terrain (no terrain hazards).
alter table public.locations
  add column terrain text
    constraint locations_terrain_check
      check (terrain in ('mountains', 'hills', 'forest', 'plains', 'coast', 'wetland', 'desert'));

comment on column public.locations.terrain is
  'This place''s terrain for weather hazards (#1086); null inherits from the parent place.';

-- The DM's hand on the weather (#1086): each pin either sets a day's weather
-- outright or rerolls the pattern from that day, for one climate source (a
-- place id, or null for the campaign's own climate). The days after a pin ease
-- back to the generated pattern (src/lib/calendar/weather.ts). On the campaign
-- row because the weather is computed on every client from that row, and the
-- row already rings the campaign channel when it changes.
alter table public.campaigns
  add column weather_pins jsonb not null default '[]'::jsonb
    constraint campaigns_weather_pins_is_array check (jsonb_typeof(weather_pins) = 'array');

comment on column public.campaigns.climate is
  'The weather a place has when neither it nor any place above it in the Atlas names a climate (#1086).';
comment on column public.locations.climate is
  'This place''s climate for the weather (#1086); null inherits from the parent place, then the campaign.';

-- A birth date on the campaign's calendar. The year alone is enough for an
-- age; month and day come together or not at all. The free-text `age` stays
-- for what a date cannot say ("ancient", "looks about forty"), and the sheet
-- shows the computed age instead of it when a birth year is set.
alter table public.npcs
  add column born_year integer,
  add column born_month integer,
  add column born_day integer,
  add constraint npcs_born_shape check (
    (born_month is null) = (born_day is null)
    and (born_month is null or born_year is not null)
    and (born_month is null or born_month >= 1)
    and (born_day is null or born_day >= 1)
  );

alter table public.party_members
  add column born_year integer,
  add column born_month integer,
  add column born_day integer,
  add constraint party_members_born_shape check (
    (born_month is null) = (born_day is null)
    and (born_month is null or born_year is not null)
    and (born_month is null or born_month >= 1)
    and (born_day is null or born_day >= 1)
  );

-- ── Player projections gain the columns ─────────────────────────────────────
--
-- get_player_visible_locations and get_player_visible_npcs are declared
-- `returns setof <table>` and name their columns by position, so a column
-- added to the table breaks them at the next call ("final statement returns
-- too few columns"): the player portal's Atlas and NPCs, at once. The same
-- trap 20260925002215 describes. Each body below is the latest definition
-- (20261016222453 and 20261005220516) with the new columns appended in table
-- order. A place's climate and terrain are structure, like its parent, and
-- players need them for the weather they are standing in; a birth date is
-- DM-only, as age is.

create or replace function public.get_player_visible_locations(p_campaign_id uuid default null::uuid, p_location_id uuid default null::uuid)
 returns setof locations
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    l.id,
    l.user_id,
    l.campaign_id,
    l.parent_id,
    l.name,
    l.location_type,
    case when l.is_description_shared then private.withhold_secret_blocks(l.description) else null::text end,
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,
    coalesce((
      select jsonb_agg(pin)
      from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
      where coalesce((pin->>'visible_to_players')::boolean, false)
    ), '[]'::jsonb),
    l.is_map_shared,
    l.player_summary,
    l.is_description_shared,
    l.is_npcs_shared,
    l.player_visible_to,
    l.is_inventory_shared,
    l.npc_owner_id,
    l.related_location_ids,
    l.source_map_id,
    l.grid_calibration,
    l.is_battle_map,
    l.era_start,
    l.era_end,
    null::text,                                                               -- audio_theme (DM-only)
    l.ai_provenance,
    l.setting_source,
    l.sort_order,
    null::integer,                                                            -- map_published_rev (DM tooling)
    case when l.is_map_shared then l.map_layer_url else null::text end,
    case when l.is_map_shared then l.map_layer_calibration else null::jsonb end,
    case when l.is_map_shared then l.plan_size else null::jsonb end,
    null::text,                                                               -- demo_source (#912): a quota marker, nothing for players
    l.is_level,                                                               -- which nested sites are floors: structure, like parent_id
    case when l.is_map_shared then l.map_scale else null::jsonb end,          -- map_scale (#932): travels with the map
    case when l.is_map_shared then l.map_live else null::jsonb end,           -- map_live (#1073): the live layer's snapshot, likewise
    case when l.is_map_shared then l.map_layer_stand_url else null::text end,      -- map_layer_stand_url (#1073): the Drawing's standing layer
    case when l.is_map_shared then l.map_layer_stand_live_url else null::text end, -- map_layer_stand_live_url (#1073): the same, less what sways
    l.climate,                                                                -- climate (#1086): the weather a player sees comes from it
    l.terrain                                                                 -- terrain (#1086): which weather hazards apply there
  from locations l
  where l.campaign_id is not null
    and (p_campaign_id is null or l.campaign_id = p_campaign_id)
    and (p_location_id is null or l.id = p_location_id)
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = l.campaign_id
    )
    and (
      exists (
        select 1 from campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = l.campaign_id
          and cm.party_member_id = any (l.player_visible_to)
      )
      or (p_location_id is not null and l.is_map_shared = true)
    )
$function$;

revoke execute on function public.get_player_visible_locations(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_locations(uuid, uuid) to authenticated, service_role;

create or replace function public.get_player_visible_npcs(p_campaign_id uuid default null::uuid, p_location_ids uuid[] default null::uuid[], p_preview_member_id uuid default null::uuid)
 returns setof npcs
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    s.id,
    s.user_id,
    case
      when not ('name' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_name is not null then s.disguise_name
      else s.name
    end,
    case when 'race' = any (s.player_visible_fields) then s.race else null end,
    null::text,                                            -- alignment (DM-only)
    null::text,                                            -- age (DM-only)
    case when 'occupation' = any (s.player_visible_fields) then s.occupation else null end,
    null::text,                                            -- appearance (DM-only)
    null::text,                                            -- personality (DM-only)
    null::text,                                            -- backstory (DM-only)
    null::text,                                            -- notes (DM-only)
    s.status,
    s.relationship,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
      else s.portrait_url
    end,
    null::text[],                                          -- tags (DM-only; no player toggle)
    null::jsonb,                                           -- stat_block (DM-only)
    null::uuid,                                            -- scriptorium_doc_id (DM-only)
    s.created_at,
    s.updated_at,
    s.campaign_id,
    case when 'location' = any (s.player_visible_fields) then s.location_id else null::uuid end,
    s.player_visible_fields,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
      else s.portrait_focal_point
    end,
    null::uuid,                                            -- linked_monster_id (DM-only)
    s.relevance,
    s.player_visible_to,
    -- The cover the party knew, only once it has fallen (unmasked_at set).
    case when s.unmasked and 'name' = any (s.player_visible_fields) then s.disguise_name else null end,
    case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url else null end,
    case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_focal_point else null end,
    false,                                                 -- is_revealed (cover shown; never leak true state)
    s.ai_provenance,
    null::text,                                            -- demo_source (#912): a quota marker, nothing for players
    case                                                   -- cutout_url (#917): the true form, so never for a concealed NPC
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed then null
      else s.cutout_url
    end,
    case when s.unmasked then s.unmasked_at else null end, -- unmasked_at: when the card turns
    null::integer,                                         -- born_year (#1086; DM-only, like age)
    null::integer,                                         -- born_month
    null::integer                                          -- born_day
  from (
    select n.*,
      ((n.disguise_name is not null or n.disguise_portrait_url is not null)
        and not n.is_revealed) as concealed,
      (n.is_revealed and n.unmasked_at is not null
        and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
    from npcs n
    where (p_campaign_id is null or n.campaign_id = p_campaign_id)
      and (p_location_ids is null or n.location_id = any (p_location_ids))
      and (
        -- (a) individually shared with the caller
        exists (
          select 1 from campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.campaign_id = n.campaign_id
            and cm.party_member_id = any (n.player_visible_to)
        )
        -- (b) shared via the NPC's OWN location ("Share linked NPCs" on that
        --     location, shared with the caller) — direct location only.
        or exists (
          select 1 from locations l
          join campaign_members cm
            on cm.user_id = (select auth.uid()) and cm.campaign_id = l.campaign_id
          where l.id = n.location_id
            and l.is_npcs_shared
            and cm.party_member_id = any (l.player_visible_to)
        )
        -- (c) DM preview: the campaign DM sees exactly what the previewed member
        --     would see (individually shared, or location-shared to that member);
        --     with no member chosen, anything shared with at least one member.
        or (
          private.is_campaign_dm(n.campaign_id)
          and (
            (p_preview_member_id is not null and (
              p_preview_member_id = any (n.player_visible_to)
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and p_preview_member_id = any (l.player_visible_to)
              )
            ))
            or (p_preview_member_id is null and (
              array_length(n.player_visible_to, 1) is not null
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and array_length(l.player_visible_to, 1) is not null
              )
            ))
          )
        )
      )
  ) s;
$function$;

revoke execute on function public.get_player_visible_npcs(uuid, uuid[], uuid) from public, anon;
grant execute on function public.get_player_visible_npcs(uuid, uuid[], uuid) to authenticated, service_role;

-- ── NPC generation asks for a number where it knows one ─────────────────────
--
-- A generated NPC gets a birth year when its age is a plain number of years
-- (supabase/functions/_shared/npcAge.ts, bornYearFromAge): a 70-year-old made
-- on 1 Hammer 2972 was born in 2902. A word ("Elder") gives no year, so the
-- model is asked for a number that fits the species' lifespan, and the word
-- belongs in the appearance. replace() touches the line only if it still reads
-- as seeded, so an admin's own edit of this prompt is kept.
update public.ai_system_prompts
   set content = replace(
         content,
         '"age": "Age as a string (e.g. ''45'', ''Young adult'', ''Elder'', ''Ancient'')",',
         '"age": "Age in whole years as a string of digits (e.g. ''45''), fitting the species'' lifespan (an elder human ''70'', an elder elf ''600''); put words like ''elderly'' in the appearance instead",')
 where generator_type = 'npc';
