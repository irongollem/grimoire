-- The map remembers what the party has seen (#1133).
--
-- A fight is a structured set of things active in one area of a map, not a map of its own (the maintainer, 2 Nov 2026),
-- so what the party has seen of a map belongs to the map and the campaign, not to one fight. Until now each fight kept
-- its own fog in encounter_state.fog_mask, wiped at every Go live, while exploring derived its fog from the rooms
-- marked Explored: the TV switched screens mid-session and the party's knowledge of a dungeon reset at every fight.
--
--   map_memory: per campaign and per place whose map is drawn (a site, or a place with a battle map of its own), the
--     squares of that map the party has seen or the DM has revealed, as "x,y;x,y" in the map picture's grid cells
--     (the encoding fog_mask used, lib/battlemap/fogMask.ts). Members read it; the DM writes it, through
--     remember_map_cells, which merges on the server so two DM windows brushing at once cannot overwrite each other.
--   campaigns.map_memory: 'remembered' keeps what the party has seen; 'strict' keeps only the DM's own reveals and
--     shows the rest only while it is seen (the client decides what to write; the column is the table's choice).
--   campaigns.player_sight: 'shared' shows every phone what the whole party sees; 'own' shows each player only what
--     their own character sees.
--   encounter_state.fog_mask moves into map_memory (a fight in a room remembers into its site's map) and is dropped;
--     get_player_encounter_state no longer returns it.

create table public.map_memory (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  seen text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_memory_one_per_map unique (campaign_id, location_id)
);

comment on table public.map_memory is
  'What the party has seen of one map in one campaign, or the DM has revealed (#1133): the squares, as "x,y;x,y" in the map picture''s grid cells. Shared by exploring and every fight on that map.';

create index map_memory_location_idx on public.map_memory (location_id);

create trigger map_memory_updated_at
  before update on public.map_memory
  for each row execute procedure update_updated_at();

create trigger zz_same_campaign_refs
  before insert or update of location_id, campaign_id
  on public.map_memory
  for each row execute procedure private.enforce_same_campaign_refs('location_id', 'locations', 'owned');

alter table public.map_memory enable row level security;

-- What the party has seen is no secret from the party: every member reads it. Only the DM writes.
create policy "map_memory_select" on public.map_memory for select
  using (private.is_campaign_member(campaign_id) or private.is_campaign_dm(campaign_id));
create policy "map_memory_insert" on public.map_memory for insert
  with check (private.is_campaign_dm(campaign_id));
create policy "map_memory_update" on public.map_memory for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "map_memory_delete" on public.map_memory for delete
  using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.map_memory to authenticated, service_role;

-- It rings the campaign doorbell like every live table: a revealed square reaches the TV and the phones at once.
create trigger map_memory_signal_insert after insert on public.map_memory referencing new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger map_memory_signal_update after update on public.map_memory referencing old table as left_rows new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger map_memory_signal_delete after delete on public.map_memory referencing old table as changed
  for each statement execute function public.signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('map_memory', 1, false, 'play state: a demo starts unexplored');

-- Merge squares into a map's memory: add `p_reveal`, then take away `p_hide`; `p_forget` first empties it (Hide all,
-- or Reveal all with every square in `p_reveal`). Invoker: the policies above decide who may, and a member who is not
-- the DM changes nothing and is told so. Returns the memory as it now stands.
create function public.remember_map_cells(
  p_campaign_id uuid,
  p_location_id uuid,
  p_reveal text[] default '{}',
  p_hide text[] default '{}',
  p_forget boolean default false
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_seen text;
begin
  insert into public.map_memory (campaign_id, location_id)
  values (p_campaign_id, p_location_id)
  on conflict (campaign_id, location_id) do nothing;

  update public.map_memory m
     set seen = (
       select coalesce(string_agg(cell, ';' order by cell), '')
         from (
           select distinct cell
             from unnest(
                    case when p_forget then '{}'::text[] else string_to_array(nullif(m.seen, ''), ';') end
                    || coalesce(p_reveal, '{}')
                  ) cell
            where cell ~ '^-?\d+,-?\d+$'
              and not (cell = any (coalesce(p_hide, '{}')))
         ) kept
     )
   where m.campaign_id = p_campaign_id
     and m.location_id = p_location_id
  returning m.seen into v_seen;

  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return v_seen;
end;
$$;

revoke all on function public.remember_map_cells(uuid, uuid, text[], text[], boolean) from public, anon;
grant execute on function public.remember_map_cells(uuid, uuid, text[], text[], boolean) to authenticated, service_role;

alter table public.campaigns
  add column map_memory text not null default 'remembered'
    constraint campaigns_map_memory_check check (map_memory in ('remembered', 'strict')),
  add column player_sight text not null default 'shared'
    constraint campaigns_player_sight_check check (player_sight in ('shared', 'own'));

comment on column public.campaigns.map_memory is
  'Whether what the party has seen of a map stays revealed (''remembered'') or shows only while seen (''strict''); the DM''s own reveals stay either way (#1133).';
comment on column public.campaigns.player_sight is
  'Whether every phone shows what the whole party sees (''shared'') or only its own character''s sight (''own'', for online play) (#1133).';

-- The fog each fight kept moves into its map's memory: a fight in a room remembers into its site's map, the map the
-- Play screen draws for it. Squares are already in that map's picture cells.
insert into public.map_memory (campaign_id, location_id, seen)
select state.campaign_id, map_place.id, string_agg(distinct cell, ';' order by cell)
  from public.encounter_state state
  join public.encounters encounter on encounter.id = state.encounter_id
  join public.locations place on place.id = encounter.location_id
  join public.locations map_place
    on map_place.id = case when private.location_is_interior(place.location_type) then place.parent_id else place.id end
  cross join lateral unnest(string_to_array(state.fog_mask, ';')) cell
 where nullif(state.fog_mask, '') is not null
   and cell ~ '^-?\d+,-?\d+$'
   and map_place.campaign_id = state.campaign_id
 group by state.campaign_id, map_place.id
on conflict (campaign_id, location_id) do nothing;

-- The projection loses fog_mask: a column of a returned table cannot be dropped in place, so the function is made anew
-- with the same body, grants and behaviour otherwise.
drop function public.get_player_encounter_state(uuid);

create function public.get_player_encounter_state(p_campaign_id uuid)
 RETURNS TABLE(id uuid, encounter_id uuid, campaign_id uuid, user_id uuid, is_running boolean, current_round integer, active_combatant_index integer, combatants_live jsonb, started_at timestamp with time zone, updated_at timestamp with time zone, events_fired jsonb, active_combatant_instance_id text, magical_darkness jsonb, location_id uuid, fired_player_events jsonb, faction_colors jsonb, door_states jsonb)
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
    ), '[]'::jsonb),
    target.door_states                   -- which doors stand open is visible to all, like the leaf itself
  from target;
$function$;

revoke all on function public.get_player_encounter_state(uuid) from public;
revoke execute on function public.get_player_encounter_state(uuid) from anon;
grant execute on function public.get_player_encounter_state(uuid) to authenticated, service_role;

alter table public.encounter_state drop column fog_mask;
