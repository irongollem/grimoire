-- Every creature takes its size on the battle grid (#1125 decision 13).
--
-- Until now only monsters had a size: an NPC token was hard-coded to one square (the maintainer's NPC mammoth stood
-- on a single square like a goblin), and companions had nowhere to keep one. PHB 2024 "Creature Size": Tiny 2.5 ft,
-- Small and Medium 5 ft, Large 10 ft, Huge 15 ft, Gargantuan 20 ft.
--
--   npcs.size, companions.size: the creature's size, one of the six, Medium unless the DM says otherwise. A companion
--     made from a monster takes that monster's size now, once; the DM edits it like any other field after that.
--   get_player_encounter_state: players' battle maps read `size` (baked at spawn beside `footprint`) and
--     `size_override` (Enlarge/Reduce) to draw a token at its footprint, so both join the allowlist. A wild shape's
--     size rides inside `wildshape`, which players already receive.

alter table public.npcs
  add column size text not null default 'medium'
  constraint npcs_size_check check (size in ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'));

comment on column public.npcs.size is
  'The NPC''s creature size (PHB 2024 "Creature Size"), which sets its token''s footprint on the battle map (#1125).';

alter table public.companions
  add column size text not null default 'medium'
  constraint companions_size_check check (size in ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'));

comment on column public.companions.size is
  'The companion''s creature size (PHB 2024 "Creature Size"), which sets its token''s footprint on the battle map (#1125).';

-- source_monster_id is text: a campaign monster's uuid or a library row's text id.
update public.companions companion
set size = monster.size
from public.monsters monster
where monster.id::text = companion.source_monster_id
  and monster.size in ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan');

update public.companions companion
set size = library.size
from public.library_monsters library
where library.id = companion.source_monster_id
  and library.size in ('tiny', 'small', 'medium', 'large', 'huge', 'gargantuan');

-- The projection is unchanged but for the two names added to its allowlist.
create or replace function public.get_player_encounter_state(p_campaign_id uuid)
 RETURNS TABLE(id uuid, encounter_id uuid, campaign_id uuid, user_id uuid, is_running boolean, current_round integer, active_combatant_index integer, combatants_live jsonb, started_at timestamp with time zone, updated_at timestamp with time zone, events_fired jsonb, fog_mask text, active_combatant_instance_id text, magical_darkness jsonb, location_id uuid, fired_player_events jsonb, faction_colors jsonb, door_states jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with target as (
    select state.*
    from public.encounter_state state
    where state.campaign_id = p_campaign_id
      and state.is_running
      and (
        private.is_campaign_member(p_campaign_id)
        or private.is_campaign_dm(p_campaign_id)
      )
    order by state.started_at desc nulls last, state.updated_at desc
    limit 1
  ),
  ranked as (
    select
      entry.combatant,
      entry.ordinality,
      (row_number() over (
        order by
          coalesce((entry.combatant->>'initiative')::numeric, -999) desc,
          case when entry.combatant->>'type' = 'player' then 0 else 1 end,
          coalesce(
            (entry.combatant->>'initiative_bonus')::numeric,
            (entry.combatant->>'dex_mod')::numeric,
            0
          ) desc,
          entry.ordinality
      ) - 1)::integer as initiative_index
    from target
    cross join lateral jsonb_array_elements(target.combatants_live)
      with ordinality as entry(combatant, ordinality)
  ),
  active as (
    select ranked.combatant->>'instance_id' as instance_id, ranked.initiative_index
    from ranked
    join target on ranked.initiative_index = target.active_combatant_index
  ),
  visible as (
    select ranked.*
    from ranked
    where ranked.combatant->>'type' = 'player'
       or coalesce(ranked.combatant->>'reveal_state', 'hidden') <> 'hidden'
  ),
  projected as (
    select
      visible.ordinality,
      visible.initiative_index,
      visible.combatant->>'instance_id' as instance_id,
      case
        -- "Unseen" exposes an initiative slot/token but not the creature behind
        -- it. Build an intentionally opaque combatant instead of trusting the UI
        -- to hide identity and stats that were already delivered.
        when visible.combatant->>'type' = 'monster'
          and visible.combatant->>'reveal_state' = 'unseen'
        then jsonb_strip_nulls(jsonb_build_object(
          'instance_id', visible.combatant->'instance_id',
          'type', 'monster',
          'name', '???',
          'faction_id', visible.combatant->'faction_id',
          'initiative', visible.combatant->'initiative',
          'hp', 1,
          'max_hp', 1,
          'ac', '',
          'conditions', '[]'::jsonb,
          'curses', '[]'::jsonb,
          'death_saves', jsonb_build_object('successes', 0, 'failures', 0),
          'dex_mod', 0,
          'reveal_state', 'unseen',
          'portrait_url', null,
          'portrait_focal_point', null,
          'position', visible.combatant->'position',
          'footprint', visible.combatant->'footprint',
          -- How much of the board it covers is as visible as the token itself (#1125 decision 13).
          'size', visible.combatant->'size',
          'size_override', visible.combatant->'size_override'
        ))
        else (
          -- An allowlist: the fields the player portal reads (encounter panel,
          -- combatant list and lightbox, battle map, Hearth turn line, and the
          -- client initiative sort, which needs dex_mod and initiative_bonus to
          -- match active_combatant_index). Any field a later change adds to the
          -- runner stays with the DM until it is named here.
          (select coalesce(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb)
             from jsonb_each(visible.combatant) kv
            where kv.key = any (array[
              'instance_id', 'type', 'name', 'faction_id', 'initiative',
              'hp', 'max_hp', 'temp_hp', 'conditions', 'death_saves',
              'monster_id', 'npc_id', 'party_member_id', 'companion_id',
              'dex_mod', 'initiative_bonus',
              'portrait_url', 'portrait_focal_point', 'token_url',
              'reveal_state', 'wildshape', 'position', 'footprint',
              'size', 'size_override'
            ]::text[]))
          || jsonb_build_object('ac', '', 'curses', '[]'::jsonb)
          || case
            when npc.id is null then '{}'::jsonb
            else jsonb_build_object(
              'name', case
                when (npc.disguise_name is not null or npc.disguise_portrait_url is not null)
                  and not npc.is_revealed
                  and npc.disguise_name is not null
                then npc.disguise_name
                else visible.combatant->>'name'
              end,
              'portrait_url', case
                when (npc.disguise_name is not null or npc.disguise_portrait_url is not null)
                  and not npc.is_revealed
                  and npc.disguise_portrait_url is not null
                then npc.disguise_portrait_url
                else visible.combatant->>'portrait_url'
              end,
              'portrait_focal_point', case
                when (npc.disguise_name is not null or npc.disguise_portrait_url is not null)
                  and not npc.is_revealed
                  and npc.disguise_portrait_url is not null
                then npc.disguise_portrait_focal_point
                else visible.combatant->'portrait_focal_point'
              end,
              -- The battle map draws token_url (the true creature's cutout) in
              -- preference to portrait_url, so a disguise that swaps the portrait
              -- must take the token art away too, or the map shows the real face.
              'token_url', case
                when (npc.disguise_name is not null or npc.disguise_portrait_url is not null)
                  and not npc.is_revealed
                  and npc.disguise_portrait_url is not null
                then null
                else visible.combatant->'token_url'
              end
            )
          end
        )
      end as combatant
    from visible
    left join public.npcs npc on npc.id::text = visible.combatant->>'npc_id'
  )
  select
    target.id,
    target.encounter_id,
    target.campaign_id,
    target.user_id,
    target.is_running,
    target.current_round,
    case
      when exists (
        select 1 from projected join active using (instance_id)
      ) then (
        select count(*)::integer
        from projected, active
        where projected.initiative_index < active.initiative_index
      )
      else -1
    end as active_combatant_index,
    coalesce(
      (select jsonb_agg(projected.combatant order by projected.ordinality) from projected),
      '[]'::jsonb
    ) as combatants_live,
    target.started_at,
    target.updated_at,
    target.events_fired,
    target.fog_mask,
    (select active.instance_id
       from active
      where exists (select 1 from projected where projected.instance_id = active.instance_id)
    ) as active_combatant_instance_id,
    target.magical_darkness,             -- #1073 story 10: where it lies is visible to all, like the fog
    -- The battle location: where the map is. The location's own visibility is still decided by
    -- get_player_visible_locations; this only names it.
    (select encounter.location_id from public.encounters encounter where encounter.id = target.encounter_id),
    -- The scripted beats a player may read: those marked player-visible that have fired, as their id, name and the
    -- message they broadcast. Unfired beats and every DM-only field (triggers, other actions) stay home.
    coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', event ->> 'id',
          'name', event ->> 'name',
          'message', (select action ->> 'message'
                        from jsonb_array_elements(coalesce(event -> 'actions', '[]'::jsonb)) action
                       where action ->> 'type' = 'broadcast_message'
                       limit 1))
        order by ordinality)
      from public.encounters encounter,
           jsonb_array_elements(coalesce(encounter.events, '[]'::jsonb)) with ordinality as e(event, ordinality)
      where encounter.id = target.encounter_id
        and coalesce((event ->> 'is_player_visible')::boolean, false)
        and coalesce(target.events_fired, '[]'::jsonb) ? (event ->> 'id')
    ), '[]'::jsonb),
    -- The colour of each faction, for the token rings: no faction names (an "Assassins of the Hand" faction would
    -- name the twist) and no hostility table.
    coalesce((
      select jsonb_agg(jsonb_build_object('id', faction ->> 'id', 'color', faction ->> 'color'))
      from public.encounters encounter, jsonb_array_elements(coalesce(encounter.factions, '[]'::jsonb)) faction
      where encounter.id = target.encounter_id
    ), '[]'::jsonb),
    target.door_states                   -- which doors stand open is visible to all, like the leaf itself
  from target;
$function$;

revoke all on function public.get_player_encounter_state(uuid) from public;
revoke execute on function public.get_player_encounter_state(uuid) from anon;
grant execute on function public.get_player_encounter_state(uuid) to authenticated, service_role;

-- get_player_visible_npcs returns setof npcs positionally, so it gains the new column at the end, in table order.
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
    null::integer,                                         -- born_day
    null::integer,                                         -- died_year (DM-only, like the birth date)
    null::integer,                                         -- died_month
    null::integer,                                         -- died_day
    s.size                                                 -- size (#1125): the token on the battle map shows it anyway
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
