-- Migration: player_encounter_location_and_beats
-- A player's battle map and combat panel stop reading the encounters table, which players cannot read.
--
-- The player battle map (`PlayerEncounterMapView`) and the combat panel (`PlayerEncounterPanel`) read the running
-- encounter's row from `public.encounters` for two things: its `location_id` (which map to draw, and whether to offer
-- "View battle map") and its scripted `events` (to show the player-visible beats that have fired). The encounters
-- select policy admits the owner and the campaign's DMs only, and always has, so for a real player both reads came back
-- empty: the battle map waited on "Loading encounter..." forever and no fired beat ever reached the panel. Found while
-- proofing #1073 on the local fixtures, 19 Oct 2026.
--
-- The fix is not a player read of `encounters` (its events carry DM-only triggers, actions and names), but two more
-- columns on the player-safe projection that already gates on campaign membership: the battle `location_id`, the
-- fired player-visible beats as `{ id, name, message }`, and the faction colours the token rings need as `{ id, color }`. `get_player_encounter_state` returns a table, so it is dropped and
-- created again.

drop function public.get_player_encounter_state(uuid);

create function public.get_player_encounter_state(p_campaign_id uuid)
 RETURNS TABLE(id uuid, encounter_id uuid, campaign_id uuid, user_id uuid, is_running boolean, current_round integer, active_combatant_index integer, combatants_live jsonb, started_at timestamp with time zone, updated_at timestamp with time zone, events_fired jsonb, fog_mask text, active_combatant_instance_id text, magical_darkness jsonb, location_id uuid, fired_player_events jsonb, faction_colors jsonb)
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
          'footprint', visible.combatant->'footprint'
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
              'reveal_state', 'wildshape', 'position', 'footprint'
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
    ), '[]'::jsonb)
  from target;
$function$;

revoke all on function public.get_player_encounter_state(uuid) from public;
revoke execute on function public.get_player_encounter_state(uuid) from anon;
grant execute on function public.get_player_encounter_state(uuid) to authenticated, service_role;
