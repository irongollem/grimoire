-- Migration: player_encounter_state_allowlist
--
-- #1017 gives a live combatant `action_uses`: which recharge and per-day
-- abilities a monster has spent this fight (keyed by the action's name). That is
-- DM information. A player who can see a revealed monster must not learn that
-- its breath weapon is spent, or that it has one use left.
--
-- `get_player_encounter_state` used to project a visible combatant by
-- SUBTRACTING DM-only keys, so every key added to `RunCombatant` reached players
-- until someone remembered to name it: `action_uses` would have, and the review
-- of this change found four that already did (a monster's concentration and
-- surprise, and a disguised NPC's true token art, which the battle map draws in
-- preference to the portrait). The visible projection is now an ALLOWLIST of the
-- fields the player portal reads, the way the unseen branch already was, and a
-- disguise that swaps the portrait also withholds token_url. Otherwise the same
-- function as 20260730000003. `player_encounter_state.test.sql` holds the line.

create or replace function public.get_player_encounter_state(p_campaign_id uuid)
returns table (
  id uuid,
  encounter_id uuid,
  campaign_id uuid,
  user_id uuid,
  is_running boolean,
  current_round integer,
  active_combatant_index integer,
  combatants_live jsonb,
  started_at timestamptz,
  updated_at timestamptz,
  events_fired jsonb,
  fog_mask text,
  active_combatant_instance_id text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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
    ) as active_combatant_instance_id
  from target;
$$;

revoke all on function public.get_player_encounter_state(uuid) from public;
revoke execute on function public.get_player_encounter_state(uuid) from anon;
grant execute on function public.get_player_encounter_state(uuid) to authenticated;
