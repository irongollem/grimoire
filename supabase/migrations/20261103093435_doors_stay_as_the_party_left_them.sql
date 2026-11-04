-- Doors stay as the party left them (#1134).
--
-- A door the DM opened or shut lived in encounter_state.door_states, which belonged to one fight and was reset at the
-- next Go live; exploring had none at all, so the party could walk through a door in a fight and find it shut again
-- the moment the fight ended. Like the fog (#1133, 20261103093432), a door's play state belongs to the map: it now
-- lives on map_memory beside what the party has seen, per campaign and map place, read by every member and written by
-- the DM through set_map_door, which merges on the server. The list keeps its shape ({ id, open } overrides of the
-- drawn state, checked by private.is_door_state_list). encounter_state.door_states moves into it and is dropped, and
-- get_player_encounter_state no longer returns it.
--
-- These are the map's drawn doors (segment ids). The site plan's ways between rooms keep their own facts
-- (unlocked, found) in the location state log, keyed by location_doors ids: a different door, a different store.

alter table public.map_memory
  add column door_states jsonb not null default '[]'::jsonb
    constraint map_memory_door_states_shape check (private.is_door_state_list(door_states));

comment on column public.map_memory.door_states is
  'The doors of this map the DM opened or shut in play, as { id, open } overrides of the drawn state (#1134); shared by exploring and every fight on the map.';

-- Set one door's play state on a map: replaces any earlier override for that door. Invoker: the map_memory policies
-- decide who may (the DM), and anyone else changes nothing and is told so. Returns the door list as it now stands.
create function public.set_map_door(p_campaign_id uuid, p_location_id uuid, p_door_id text, p_open boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_doors jsonb;
begin
  insert into public.map_memory (campaign_id, location_id)
  values (p_campaign_id, p_location_id)
  on conflict (campaign_id, location_id) do nothing;

  update public.map_memory m
     set door_states = coalesce(
           (select jsonb_agg(door order by door ->> 'id')
              from jsonb_array_elements(m.door_states) door
             where door ->> 'id' <> p_door_id),
           '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object('id', p_door_id, 'open', p_open))
   where m.campaign_id = p_campaign_id
     and m.location_id = p_location_id
  returning m.door_states into v_doors;

  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return v_doors;
end;
$$;

revoke all on function public.set_map_door(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_map_door(uuid, uuid, text, boolean) to authenticated, service_role;

-- Each fight's doors move onto its map: a fight in a room onto its site's map. Where several fights on one map left
-- doors, the one played last wins, door by door.
insert into public.map_memory (campaign_id, location_id, door_states)
select campaign_id, map_place_id, jsonb_agg(jsonb_build_object('id', door_id, 'open', open) order by door_id)
  from (
    select distinct on (state.campaign_id, map_place.id, door ->> 'id')
           state.campaign_id, map_place.id as map_place_id, door ->> 'id' as door_id, (door ->> 'open')::boolean as open
      from public.encounter_state state
      join public.encounters encounter on encounter.id = state.encounter_id
      join public.locations place on place.id = encounter.location_id
      join public.locations map_place
        on map_place.id = case when private.location_is_interior(place.location_type) then place.parent_id else place.id end
      cross join lateral jsonb_array_elements(state.door_states) door
     where map_place.campaign_id = state.campaign_id
     order by state.campaign_id, map_place.id, door ->> 'id', state.updated_at desc
  ) latest
 group by campaign_id, map_place_id
on conflict (campaign_id, location_id) do update set door_states = excluded.door_states;

-- The projection loses door_states (players read them from map_memory): a returned column cannot be dropped in place,
-- so the function is made anew with the same body and grants.
drop function public.get_player_encounter_state(uuid);

create function public.get_player_encounter_state(p_campaign_id uuid)
 RETURNS TABLE(id uuid, encounter_id uuid, campaign_id uuid, user_id uuid, is_running boolean, current_round integer, active_combatant_index integer, combatants_live jsonb, started_at timestamp with time zone, updated_at timestamp with time zone, events_fired jsonb, active_combatant_instance_id text, magical_darkness jsonb, location_id uuid, fired_player_events jsonb, faction_colors jsonb)
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
    (select active.instance_id
       from active
      where exists (select 1 from projected where projected.instance_id = active.instance_id)
    ) as active_combatant_instance_id,
    target.magical_darkness,             -- #1073 story 10: where it lies is visible to all
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
    ), '[]'::jsonb)
  from target;
$function$;

revoke all on function public.get_player_encounter_state(uuid) from public;
revoke execute on function public.get_player_encounter_state(uuid) from anon;
grant execute on function public.get_player_encounter_state(uuid) to authenticated, service_role;

alter table public.encounter_state drop column door_states;
