-- Migration: encounter_magical_darkness
-- Magical darkness on the battle map (#1073, story 10): spheres the DM places during play.
--
-- Darkness on a map so far is the absence of light (`dungeon_maps.darkness`, carved by its lights). The rules also have
-- MAGICAL darkness, which no light lifts and darkvision cannot see into: the *darkness* spell's 15-foot sphere, a
-- shadow demon's lair, a cursed relic. Only blindsight (which is not sight), truesight and a warlock's Devil's Sight
-- see in it (2014 and 2024 alike). It belongs to a fight, not to the drawing, so it lives on the live encounter state
-- beside the fog: `magical_darkness` is a list of spheres, each `{ id, x, y, radius }` with the centre in the battle
-- map's image cells (the space of the fog and the tokens, fractional) and the radius in feet.
--
-- The DM writes it with the rest of the live state (the runner's debounced update); players read it through
-- `get_player_encounter_state`, which returns a table, so it is dropped and created again with the column appended.
-- Where the darkness lies is not a secret: anyone at the table sees the black sphere, as they see the fog.

-- A check constraint cannot hold a subquery, so the shape test is a function. Total (true or false, never NULL):
-- anything that is not a list of well-formed spheres is false.
create function private.is_magical_darkness_list(p_zones jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select case when jsonb_typeof(p_zones) is distinct from 'array' then false else
    jsonb_array_length(p_zones) <= 50
    and coalesce(
      (select bool_and(
          jsonb_typeof(zone) = 'object'
          and jsonb_typeof(zone -> 'id') = 'string'
          and jsonb_typeof(zone -> 'x') = 'number'
          and jsonb_typeof(zone -> 'y') = 'number'
          and jsonb_typeof(zone -> 'radius') = 'number'
          and (zone ->> 'radius')::numeric > 0
          and (zone ->> 'radius')::numeric <= 120
          and (zone - 'id' - 'x' - 'y' - 'radius') = '{}'::jsonb)
        from jsonb_array_elements(p_zones) zone),
      true)
  end;
$function$;

alter table public.encounter_state add column magical_darkness jsonb not null default '[]'::jsonb
  constraint encounter_state_magical_darkness_shape check (private.is_magical_darkness_list(magical_darkness));

comment on column public.encounter_state.magical_darkness is
  'Spheres of magical darkness on the battle map (#1073): [{ id, x, y, radius }], centre in image cells, radius in feet. No light lifts it; only blindsight, truesight and Devil''s Sight see in it.';

drop function public.get_player_encounter_state(uuid);

create function public.get_player_encounter_state(p_campaign_id uuid)
 RETURNS TABLE(id uuid, encounter_id uuid, campaign_id uuid, user_id uuid, is_running boolean, current_round integer, active_combatant_index integer, combatants_live jsonb, started_at timestamp with time zone, updated_at timestamp with time zone, events_fired jsonb, fog_mask text, active_combatant_instance_id text, magical_darkness jsonb)
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
    target.magical_darkness              -- #1073 story 10: where it lies is visible to all, like the fog
  from target;
$function$;

revoke all on function public.get_player_encounter_state(uuid) from public;
revoke execute on function public.get_player_encounter_state(uuid) from anon;
grant execute on function public.get_player_encounter_state(uuid) to authenticated, service_role;
