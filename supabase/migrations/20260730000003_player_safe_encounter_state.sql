-- Player-safe live encounter state (#570).
--
-- Players previously selected encounter_state directly. Its combatants_live JSON
-- contains the DM's complete roster, including hidden combatants and the true
-- identity of concealed NPCs. RLS can gate rows, but it cannot filter entries or
-- rewrite fields inside a JSON array, so player reads now go through a projection.

-- A metadata-only table provides a safe realtime invalidation channel. Players
-- subscribe here and refetch the projection; the raw encounter row is DM-only.
create table public.encounter_state_player_updates (
  encounter_state_id uuid primary key references public.encounter_state(id) on delete cascade,
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  is_running boolean not null,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.encounter_state_player_updates enable row level security;
alter table public.encounter_state_player_updates replica identity full;

create policy "encounter_state_player_updates_select"
on public.encounter_state_player_updates for select
using (
  private.is_campaign_member(campaign_id)
  or private.is_campaign_dm(campaign_id)
);

revoke all on table public.encounter_state_player_updates from anon, authenticated;
grant select on table public.encounter_state_player_updates to authenticated;

alter publication supabase_realtime add table public.encounter_state_player_updates;

create or replace function private.sync_encounter_state_player_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.encounter_state_player_updates (
    encounter_state_id,
    encounter_id,
    campaign_id,
    is_running,
    started_at,
    updated_at
  ) values (
    new.id,
    new.encounter_id,
    new.campaign_id,
    new.is_running,
    new.started_at,
    clock_timestamp()
  )
  on conflict (encounter_state_id) do update set
    encounter_id = excluded.encounter_id,
    campaign_id = excluded.campaign_id,
    is_running = excluded.is_running,
    started_at = excluded.started_at,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create trigger encounter_state_player_update_sync
after insert or update on public.encounter_state
for each row execute function private.sync_encounter_state_player_update();

insert into public.encounter_state_player_updates (
  encounter_state_id,
  encounter_id,
  campaign_id,
  is_running,
  started_at,
  updated_at
)
select id, encounter_id, campaign_id, is_running, started_at, updated_at
from public.encounter_state;

-- A disguise can be revealed (or changed) without touching encounter_state.
-- Bump the safe signal for any live row containing that NPC so connected players
-- immediately refetch and receive the newly appropriate identity.
create or replace function private.signal_encounter_npc_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.encounter_state_player_updates signal
     set updated_at = clock_timestamp()
    from public.encounter_state state
   where signal.encounter_state_id = state.id
     and state.is_running
     and exists (
       select 1
       from jsonb_array_elements(state.combatants_live) combatant
       where combatant->>'npc_id' = new.id::text
     );
  return new;
end;
$$;

create trigger npc_encounter_identity_change_signal
after update of name, portrait_url, portrait_focal_point,
  disguise_name, disguise_portrait_url, disguise_portrait_focal_point, is_revealed
on public.npcs
for each row execute function private.signal_encounter_npc_identity_change();

-- Return the newest running encounter using only player-authorized combatants.
-- Hidden enemies are removed before the JSON reaches the client. Concealed NPC
-- identity is resolved from the current NPC row on every call, so unmasking is
-- reflected live rather than being frozen at spawn time.
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
          visible.combatant
            - array['ac', 'curses', 'def_id', 'legendary_action_cap',
                    'legendary_actions_remaining', 'reactionUsed']::text[]
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

-- DM access remains through encounter_state_dm_all. Players have no base-table
-- SELECT path after this point, so devtools cannot bypass the projection.
drop policy if exists "encounter_state_member_select" on public.encounter_state;
