-- #1011: what the quest model could not say while authoring *Before the Count*
-- (the Sugarwell demo's Understage quest, #912). Seven gaps, one migration,
-- because most of them change the same engine functions and each of those is
-- redefined here exactly once.
--
--  1. Timers, in two kinds (the maintainer's call: "both, separately"):
--     * quest_clocks: named progress clocks with N segments. The DM ticks one
--       (tick_quest_clock), or a rule does (the tick_clock verb). A clock that
--       fills fires the rules watching it (on_clock_id). Clocks never tick on
--       their own: the database can compare two in-world dates but cannot
--       count days across a custom calendar's months, and deadlines are the
--       calendar's job anyway.
--     * Objective due dates (due_year/month/day). When the campaign's date
--       moves past one, a still-pending objective of an active quest fails,
--       under an assert transition, and its rules cascade.
--  2. A route gate holds any number of conditions, combined by the route's
--     gate_mode ('all' or 'any'). Each condition is an objective and the SET
--     of statuses that satisfies it, so "unless her trust is broken" is
--     {dormant, pending, complete} and dormant is nameable at last.
--  3. Settled is final for rules: complete and fail move only an open
--     (dormant or pending) objective. The cascade is seeded only by an
--     objective that actually moved, so a no-op rule cannot re-trigger the
--     rules watching it. The DM's own assert and `previous` are unchanged.
--  4. converge_mode = 'all' waits for every open THREAD that can still reach
--     the beat, not for a walk down every authored incoming route. Alternative
--     endings no longer need a funnel beat, an optional thread that was never
--     spawned (or has ended, or has gone somewhere the join is unreachable
--     from) no longer strands the join, and every runtime move re-checks the
--     waiting joins of its quest.
--  5. Three world verbs: move_npc (target_npc_id + target_location_id),
--     add_companion (target_npc_id), shift_faction_standing (target_faction_id,
--     on the NPC ladder, against the new factions.party_standing). Each
--     records what `previous` needs to undo it.
--  6. (Client only: the run cockpit prompts the DM when the ledger settles.)
--  7. create_calendar_event files an event without event_type under 'quest'
--     instead of failing on calendar_events.event_type's NOT NULL at fire time.

-- ── 1. Clocks ──────────────────────────────────────────────────────────────

create table public.quest_clocks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  quest_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  segments integer not null check (segments between 2 and 12),
  filled integer not null default 0,
  sort_order integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quest_clocks_filled_in_range check (filled between 0 and segments),
  constraint quest_clocks_quest_fkey foreign key (quest_id, campaign_id)
    references public.quests (id, campaign_id) on delete cascade,
  constraint quest_clocks_id_quest_key unique (id, quest_id)
);

create index quest_clocks_quest_idx on public.quest_clocks (quest_id);
create index quest_clocks_campaign_idx on public.quest_clocks (campaign_id);

create trigger quest_clocks_updated_at
  before update on public.quest_clocks
  for each row execute procedure update_updated_at();

alter table public.quest_clocks enable row level security;

-- DM-only quest state, like quest_threads: a player never reads a clock row.
create policy "quest_clocks_select" on public.quest_clocks for select using (private.is_campaign_dm(campaign_id));
create policy "quest_clocks_insert" on public.quest_clocks for insert with check (private.is_campaign_dm(campaign_id));
create policy "quest_clocks_update" on public.quest_clocks for update using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "quest_clocks_delete" on public.quest_clocks for delete using (private.is_campaign_dm(campaign_id));

-- `filled` moves only through tick_quest_clock or a rule, which is what makes
-- a clock that fills fire its rules. Same shape as quest_objectives.status.
revoke insert, update on public.quest_clocks from anon, authenticated;
grant insert (id, campaign_id, quest_id, label, segments, sort_order) on public.quest_clocks to authenticated;
grant update (label, segments, sort_order) on public.quest_clocks to authenticated;

-- DM-only rows ring the campaign doorbell rather than travel as payloads
-- (20260810000012), exactly as quest_threads does.
create trigger quest_clocks_signal_insert after insert on public.quest_clocks
  referencing new table as changed for each statement execute function public.signal_campaign_change();
create trigger quest_clocks_signal_update after update on public.quest_clocks
  referencing new table as changed for each statement execute function public.signal_campaign_change();
create trigger quest_clocks_signal_delete after delete on public.quest_clocks
  referencing old table as changed for each statement execute function public.signal_campaign_change();

-- A demo copy carries its clocks (they are authored content, like threads).
insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('quest_clocks', 1, true, 'Authored quest clocks (#1011).');

-- ── 2. Objective due dates ─────────────────────────────────────────────────

alter table public.quest_objectives
  add column due_year integer,
  add column due_month integer check (due_month >= 1),
  add column due_day integer check (due_day >= 1),
  add constraint quest_objectives_due_all_or_none check (num_nulls(due_year, due_month, due_day) in (0, 3));

grant update (due_year, due_month, due_day) on public.quest_objectives to authenticated;

-- ── 3. Compound route gates ────────────────────────────────────────────────

alter table public.quest_beat_edges
  add column gate_mode text not null default 'all' check (gate_mode in ('all', 'any'));

alter table public.quest_beat_edge_gates drop constraint quest_beat_edge_gates_pkey;
alter table public.quest_beat_edge_gates
  add column id uuid not null default gen_random_uuid() primary key,
  add column statuses text[];
update public.quest_beat_edge_gates set statuses = array[status];
alter table public.quest_beat_edge_gates
  alter column statuses set not null,
  drop column status,
  add constraint quest_beat_edge_gates_statuses_check check (
    statuses <@ array['dormant', 'pending', 'complete', 'failed']::text[]
    and cardinality(statuses) between 1 and 3
  ),
  add constraint quest_beat_edge_gates_condition_key unique (edge_id, objective_id);

-- ── 4. Faction standing ────────────────────────────────────────────────────

alter table public.factions
  add column party_standing public.npc_relationship not null default 'unknown';

-- ── 5. Rules: new conditions, targets and verbs ────────────────────────────

alter table public.quest_consequences
  add column on_clock_id uuid,
  add column target_clock_id uuid,
  add column target_location_id uuid references public.locations (id) on delete cascade,
  add column target_faction_id uuid references public.factions (id) on delete cascade,
  add constraint quest_consequences_on_clock_fkey foreign key (on_clock_id, quest_id)
    references public.quest_clocks (id, quest_id) on delete cascade,
  add constraint quest_consequences_target_clock_fkey foreign key (target_clock_id, quest_id)
    references public.quest_clocks (id, quest_id) on delete cascade;

alter table public.quest_consequences drop constraint quest_consequences_one_condition;
alter table public.quest_consequences add constraint quest_consequences_one_condition check (
  num_nonnulls(on_beat_id, on_edge_id, on_objective_id, on_location_id, on_clock_id) + on_quest_settled::int = 1
);

alter table public.quest_consequences drop constraint quest_consequences_action_check;
alter table public.quest_consequences add constraint quest_consequences_action_check check (action = any (array[
  'raise', 'reveal', 'complete', 'fail', 'tick_clock',
  'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
  'grant_knowledge', 'owe_favor', 'award_milestone', 'give_handout',
  'move_npc', 'add_companion', 'shift_faction_standing'
]));

alter table public.quest_consequences drop constraint quest_consequences_npc_pair;
alter table public.quest_consequences add constraint quest_consequences_npc_pair check (
  (action = any (array['shift_npc_relationship', 'owe_favor', 'move_npc', 'add_companion'])) = (target_npc_id is not null)
);
alter table public.quest_consequences
  add constraint quest_consequences_clock_pair check ((action = 'tick_clock') = (target_clock_id is not null)),
  add constraint quest_consequences_location_pair check ((action = 'move_npc') = (target_location_id is not null)),
  add constraint quest_consequences_faction_pair check ((action = 'shift_faction_standing') = (target_faction_id is not null)),
  -- A step is a whole number: the perform arms cast it with ::int, so a
  -- fractional or huge step passing a bare "is a number" check would raise at
  -- fire time -- inside the deadline trigger, that blocks the date change.
  add constraint quest_consequences_clock_step_payload check (
    action <> 'tick_clock' or coalesce((action_payload ->> 'step') ~ '^-?[1-9][0-9]{0,3}$', false)
  ),
  add constraint quest_consequences_faction_shift_payload check (
    action <> 'shift_faction_standing'
    or coalesce(action_payload ->> 'to' = any (array['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful']), false)
    or coalesce((action_payload ->> 'step') ~ '^-?[0-9]{1,4}$', false)
  );

-- The NPC shift had the same "any number" check (20260908210324); it gets
-- the same whole-number rule. No production row violates it (checked before
-- this migration was written).
alter table public.quest_consequences drop constraint quest_consequences_relationship_shift_payload;
alter table public.quest_consequences add constraint quest_consequences_relationship_shift_payload check (
  action <> 'shift_npc_relationship'
  or coalesce(action_payload ->> 'to' = any (array['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful']), false)
  or coalesce((action_payload ->> 'step') ~ '^-?[0-9]{1,4}$', false)
);

-- Every target a rule names lives in its quest's campaign. The handout guard
-- (20261004110516) checked one column; a rule could still name another
-- campaign's NPC, place or faction, which no verb would act on (each perform
-- arm re-scopes to the event's campaign) but whose NAME the run context
-- returned: an existence-and-name oracle across campaigns. One guard now
-- covers all four, at write time. No production row names a foreign NPC
-- (checked before this migration was written).
drop trigger quest_consequences_document_in_campaign on public.quest_consequences;
drop function private.quest_consequence_document_in_campaign();

create function private.quest_consequence_targets_in_campaign()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_campaign uuid;
  v_owner uuid;
begin
  select q.campaign_id, q.user_id into v_campaign, v_owner from public.quests q where q.id = new.quest_id;

  if new.target_document_id is not null and not exists (
    select 1 from public.scriptorium_documents d
     where d.id = new.target_document_id and d.campaign_id = v_campaign and d.user_id = v_owner
  ) then
    raise exception 'A quest can only give a handout from its own campaign' using errcode = '23514';
  end if;
  if new.target_npc_id is not null and not exists (
    select 1 from public.npcs n where n.id = new.target_npc_id and n.campaign_id = v_campaign
  ) then
    raise exception 'A quest rule can only name an NPC of its own campaign' using errcode = '23514';
  end if;
  if new.target_location_id is not null and not exists (
    select 1 from public.locations l where l.id = new.target_location_id and l.campaign_id = v_campaign
  ) then
    raise exception 'A quest rule can only name a place of its own campaign' using errcode = '23514';
  end if;
  if new.target_faction_id is not null and not exists (
    select 1 from public.factions f where f.id = new.target_faction_id and f.campaign_id = v_campaign
  ) then
    raise exception 'A quest rule can only name a faction of its own campaign' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke execute on function private.quest_consequence_targets_in_campaign() from public, anon, authenticated;

create trigger quest_consequences_targets_in_campaign
  before insert or update of target_document_id, target_npc_id, target_location_id, target_faction_id, quest_id
  on public.quest_consequences
  for each row execute procedure private.quest_consequence_targets_in_campaign();

create index quest_consequences_clock_idx on public.quest_consequences (on_clock_id) where on_clock_id is not null;

-- The one-rule-per-(condition, action, target) indexes learn the new targets,
-- and the clock condition gets one of its own.
drop index public.quest_consequences_beat_rule_uniq;
drop index public.quest_consequences_edge_rule_uniq;
drop index public.quest_consequences_location_rule_uniq;
create unique index quest_consequences_beat_rule_uniq on public.quest_consequences (
  on_beat_id, action,
  coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_quest_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_npc_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_document_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_clock_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_location_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_faction_id, '00000000-0000-0000-0000-000000000000')
) where on_beat_id is not null and action <> all (array['create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone']);
create unique index quest_consequences_edge_rule_uniq on public.quest_consequences (
  on_edge_id, action,
  coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_quest_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_npc_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_document_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_clock_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_location_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_faction_id, '00000000-0000-0000-0000-000000000000')
) where on_edge_id is not null and action <> all (array['create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone']);
create unique index quest_consequences_location_rule_uniq on public.quest_consequences (
  on_location_id, on_location_fact, action,
  coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_quest_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_npc_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_document_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_clock_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_location_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_faction_id, '00000000-0000-0000-0000-000000000000')
) where on_location_id is not null and action <> all (array['create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone']);
create unique index quest_consequences_clock_rule_uniq on public.quest_consequences (
  on_clock_id, action,
  coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_quest_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_npc_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_document_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_clock_id, '00000000-0000-0000-0000-000000000000'), coalesce(target_location_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(target_faction_id, '00000000-0000-0000-0000-000000000000')
) where on_clock_id is not null and action <> all (array['create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone']);

-- What each new verb leaves in the log, so `previous` can put it back.
alter table public.quest_consequence_events
  add column target_clock_id uuid,
  add column previous_clock_filled integer,
  add column target_location_id uuid,
  add column previous_location_id uuid,
  add column npc_moved boolean not null default false,
  -- No FK: like favor_id and milestone_id, a created row's id the undo deletes by.
  add column companion_id uuid,
  add column target_faction_id uuid,
  add column previous_standing public.npc_relationship;

-- ── Helpers ────────────────────────────────────────────────────────────────

-- The world verbs: performed by perform_quest_consequence, now or after
-- after_days. Ledger verbs and tick_clock are engine state and move inline.
create function private.quest_action_is_world(p_action text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_action = any (array[
    'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
    'grant_knowledge', 'owe_favor', 'award_milestone', 'give_handout',
    'move_npc', 'add_companion', 'shift_faction_standing'
  ]);
$$;

-- A route's gate, evaluated: null when the route has no conditions, else its
-- mode, whether it is open, and each condition with whether it is met. The
-- run context reports it and assert_edge_gate_open enforces it, so the two
-- can never disagree.
create function private.edge_gate_state(p_edge_id uuid)
returns jsonb
language sql
stable
set search_path to ''
as $$
  select case when count(g.id) = 0 then null else jsonb_build_object(
    'mode', e.gate_mode,
    'is_open', case e.gate_mode
                 when 'any' then bool_or(o.status = any (g.statuses))
                 else bool_and(o.status = any (g.statuses))
               end,
    'conditions', jsonb_agg(jsonb_build_object(
      'objective_id', g.objective_id, 'objective', o.description,
      'statuses', to_jsonb(g.statuses), 'current_status', o.status,
      'met', o.status = any (g.statuses)
    ) order by g.created_at, g.id)
  ) end
  from public.quest_beat_edges e
  left join public.quest_beat_edge_gates g on g.edge_id = e.id
  left join public.quest_objectives o on o.id = g.objective_id
  where e.id = p_edge_id
  group by e.id, e.gate_mode;
$$;

create or replace function private.assert_edge_gate_open(p_edge_id uuid)
returns void
language plpgsql
set search_path to 'public', 'private'
as $function$
declare
  v_state jsonb := private.edge_gate_state(p_edge_id);
  v_needs text;
  v_now text;
begin
  if v_state is null or (v_state ->> 'is_open')::boolean then
    return;
  end if;

  select string_agg(format('"%s" to be %s', c ->> 'objective',
           (select string_agg(s, ' or ') from jsonb_array_elements_text(c -> 'statuses') s)),
           case when v_state ->> 'mode' = 'any' then ', or ' else ', and ' end),
         string_agg(format('"%s" is %s', c ->> 'objective', c ->> 'current_status'), ', ')
    into v_needs, v_now
    from jsonb_array_elements(v_state -> 'conditions') c;

  if jsonb_array_length(v_state -> 'conditions') = 1 then
    -- One condition reads as it always has.
    raise exception 'That route needs %, and it is %', v_needs,
      v_state -> 'conditions' -> 0 ->> 'current_status'
      using errcode = '23514';
  end if;
  raise exception 'That route needs %; now %', v_needs, v_now using errcode = '23514';
end;
$function$;

-- ── Converge (#1011 gap 4) ─────────────────────────────────────────────────

-- Can a cursor at p_from still walk to p_to? Every route kind counts (a
-- parallel route spawns a thread that may arrive), gates are ignored (a
-- closed gate can open), archived beats are not walked.
create function private.quest_beat_reaches(p_quest_id uuid, p_from uuid, p_to uuid)
returns boolean
language sql
stable
set search_path to ''
as $$
  with recursive reach(beat_id) as (
    select e.target_beat_id
      from public.quest_beat_edges e
      join public.quest_beats b on b.id = e.target_beat_id and b.kind <> 'archived'
     where e.quest_id = p_quest_id and e.source_beat_id = p_from
    union
    select e.target_beat_id
      from reach r
      join public.quest_beat_edges e on e.source_beat_id = r.beat_id and e.quest_id = p_quest_id
      join public.quest_beats b on b.id = e.target_beat_id and b.kind <> 'archived'
  )
  select exists (select 1 from reach where beat_id = p_to);
$$;

-- Is a converge-all join at p_beat_id still waiting on someone? It is while
-- any other open thread of the quest (live, or parked at a different join)
-- could still reach it. Threads already parked at this join are the ones
-- being waited FOR, not on.
create function private.quest_join_blocked(p_quest_id uuid, p_beat_id uuid, p_exclude_thread_id uuid)
returns boolean
language sql
stable
set search_path to ''
as $$
  select exists (
    select 1
      from public.quest_threads th
      join public.quest_runtime_state s on s.thread_id = th.id and s.quest_id = th.quest_id
     where th.quest_id = p_quest_id
       and th.id is distinct from p_exclude_thread_id
       and th.status in ('live', 'waiting')
       and s.status <> 'ended'
       and s.current_beat_id is not null
       and not (s.status = 'waiting' and s.current_beat_id = p_beat_id)
       and private.quest_beat_reaches(p_quest_id, s.current_beat_id, p_beat_id)
  );
$$;

drop function private.compute_arrival_status(uuid, uuid);

create function private.compute_arrival_status(p_quest_id uuid, p_to_beat_id uuid, p_thread_id uuid)
returns text
language sql
stable
set search_path to 'public', 'private'
as $$
  select case
    when b.converge_mode = 'all' and (
      private.quest_join_blocked(p_quest_id, p_to_beat_id, p_thread_id)
      or exists (
        select 1 from public.quest_runtime_state s
         where s.quest_id = p_quest_id and s.current_beat_id = p_to_beat_id
           and s.status = 'waiting' and s.thread_id <> p_thread_id
      )
    )
    then 'waiting'
    else 'running'
  end
  from public.quest_beats b
  where b.id = p_to_beat_id;
$$;

-- Merge every waiting join of the quest that nothing can still reach: the
-- earliest arrival (by seq) survives and runs on, the rest are merged into
-- it, and the beat's arrival rules fire once, on the survivor's arrival.
-- A join with a single waiting thread "merges" into that thread alone, which
-- is how a join is released when the thread it waited on ends elsewhere.
-- Repeats until a pass merges nothing, since ending a merged thread can
-- release another join.
create function private.settle_converge_joins(p_campaign_id uuid, p_quest_id uuid, p_quest_title text, p_hold uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_join record;
  v_merged boolean;
  v_round integer := 0;
  v_survivor_thread_id uuid;
  v_survivor_transition_id uuid;
  v_loser record;
begin
  loop
    v_merged := false;

    for v_join in
      select distinct s.current_beat_id as beat_id, b.title
        from public.quest_runtime_state s
        join public.quest_threads th on th.id = s.thread_id
        join public.quest_beats b on b.id = s.current_beat_id
       where s.campaign_id = p_campaign_id and s.quest_id = p_quest_id
         and s.status = 'waiting' and th.status = 'waiting'
    loop
      continue when private.quest_join_blocked(p_quest_id, v_join.beat_id, null);

      select th.id, arr.id
        into v_survivor_thread_id, v_survivor_transition_id
        from public.quest_threads th
        join public.quest_runtime_state s
          on s.thread_id = th.id and s.campaign_id = p_campaign_id and s.quest_id = p_quest_id
        join lateral (
          select t.id, t.seq from public.quest_beat_transitions t
           where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
             and t.to_beat_id = v_join.beat_id and t.thread_id = th.id
           order by t.seq desc
           limit 1
        ) arr on true
       where th.campaign_id = p_campaign_id and th.quest_id = p_quest_id
         and s.current_beat_id = v_join.beat_id and s.status = 'waiting' and th.status = 'waiting'
       order by arr.seq asc
       limit 1;

      continue when v_survivor_thread_id is null;

      update public.quest_runtime_state
         set status = 'running', version = version + 1, updated_by = auth.uid()
       where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = v_survivor_thread_id;
      update public.quest_threads set status = 'live' where id = v_survivor_thread_id;

      for v_loser in
        select th.id as thread_id
          from public.quest_threads th
          join public.quest_runtime_state s
            on s.thread_id = th.id and s.campaign_id = p_campaign_id and s.quest_id = p_quest_id
         where th.campaign_id = p_campaign_id and th.quest_id = p_quest_id
           and s.current_beat_id = v_join.beat_id and s.status = 'waiting' and th.status = 'waiting'
           and th.id <> v_survivor_thread_id
      loop
        update public.quest_threads
           set status = 'merged', merged_into_thread_id = v_survivor_thread_id, closed_at = now()
         where id = v_loser.thread_id;
        update public.quest_runtime_state
           set status = 'ended', version = version + 1, updated_by = auth.uid()
         where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = v_loser.thread_id;
        insert into public.quest_beat_transitions (
          campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
          transition_kind, reason, provenance, thread_id,
          from_quest_title, from_beat_title, to_quest_title, to_beat_title
        ) values (
          p_campaign_id, p_quest_id, v_join.beat_id, null, null,
          'end', 'Merged into another thread', jsonb_build_object('merged_into', v_survivor_thread_id), v_loser.thread_id,
          p_quest_title, v_join.title, null, null
        );
      end loop;

      perform private.apply_quest_consequences(
        p_campaign_id, p_quest_id, v_survivor_transition_id, v_join.beat_id, null, '{}'::uuid[], null, p_hold
      );
      v_merged := true;
    end loop;

    exit when not v_merged;
    v_round := v_round + 1;
    exit when v_round > 16;
  end loop;
end;
$function$;

-- A thread arriving: run the beat's rules now, or park it at a converge-all
-- join (its route's own rules still fire) and let the joins settle.
create or replace function private.settle_thread_arrival(p_campaign_id uuid, p_quest_id uuid, p_quest_title text, p_thread_id uuid, p_transition_id uuid, p_to_beat_id uuid, p_to_beat_title text, p_edge_id uuid, p_hold uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_status text;
begin
  select status into v_status from public.quest_runtime_state
   where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id;

  if v_status is distinct from 'waiting' then
    perform private.apply_quest_consequences(
      p_campaign_id, p_quest_id, p_transition_id, p_to_beat_id, p_edge_id, '{}'::uuid[], null, p_hold
    );
    return;
  end if;

  update public.quest_threads set status = 'waiting' where id = p_thread_id and status = 'live';

  -- The thread is parked, but it did walk its route: the route's own
  -- `on_edge_id` rules are the route's, not the beat's, and fire now. Only
  -- the beat's arrival rules wait for the merge.
  if p_edge_id is not null then
    perform private.apply_quest_consequences(
      p_campaign_id, p_quest_id, p_transition_id, null, p_edge_id, '{}'::uuid[], null, p_hold
    );
  end if;

  perform private.settle_converge_joins(p_campaign_id, p_quest_id, p_quest_title, p_hold);
end;
$function$;

-- ── Clocks: filling one ────────────────────────────────────────────────────

-- Set a clock's fill (clamped). Filling it up fires the rules watching it,
-- under an assert transition, exactly as an asserted objective or a place's
-- fact does. Shared by tick_quest_clock and a held tick_clock rule fired late.
create function private.set_quest_clock_filled(p_clock_id uuid, p_filled integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_clock public.quest_clocks%rowtype;
  v_new integer;
  v_title text;
  v_tid uuid;
  v_settled_before boolean;
begin
  select * into v_clock from public.quest_clocks where id = p_clock_id for update;
  if not found then
    raise exception 'Clock not found' using errcode = 'P0002';
  end if;

  v_new := least(greatest(coalesce(p_filled, v_clock.filled), 0), v_clock.segments);
  if v_new = v_clock.filled then
    return jsonb_build_object('changed', false, 'filled', v_new, 'segments', v_clock.segments, 'filled_up', false);
  end if;

  update public.quest_clocks set filled = v_new where id = p_clock_id;

  if v_new = v_clock.segments and v_clock.filled < v_clock.segments then
    select title into v_title from public.quests where id = v_clock.quest_id;
    v_settled_before := private.quest_ledger_settled(v_clock.quest_id);
    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, to_quest_id, transition_kind, reason, created_by, to_quest_title, provenance
    ) values (
      v_clock.campaign_id, v_clock.quest_id, v_clock.quest_id, 'assert',
      coalesce(nullif(btrim(p_reason), ''), v_clock.label || ' filled'),
      auth.uid(), v_title,
      jsonb_build_object('clock_id', v_clock.id)
    ) returning id into v_tid;

    perform private.apply_quest_consequences(
      v_clock.campaign_id, v_clock.quest_id, v_tid, null, null, '{}'::uuid[], v_settled_before, '{}'::uuid[],
      null, null, v_clock.id
    );
    return jsonb_build_object('changed', true, 'filled', v_new, 'segments', v_clock.segments, 'filled_up', true, 'transition_id', v_tid);
  end if;

  return jsonb_build_object('changed', true, 'filled', v_new, 'segments', v_clock.segments, 'filled_up', false);
end;
$function$;

-- ── 6. The consequence engine ───────────────────────────────────────────────
drop function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[], uuid, text);
CREATE OR REPLACE FUNCTION private.apply_quest_consequences(p_campaign_id uuid, p_quest_id uuid, p_transition_id uuid, p_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_changed_objective_ids uuid[] DEFAULT '{}'::uuid[], p_settled_before boolean DEFAULT NULL::boolean, p_hold uuid[] DEFAULT '{}'::uuid[], p_location_id uuid DEFAULT NULL::uuid, p_location_fact text DEFAULT NULL::text, p_clock_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_settled_before boolean;
  v_rule record;
  v_prev_status text;
  v_prev_visible boolean;
  v_event_id uuid;
  v_changed uuid[] := coalesce(p_changed_objective_ids, '{}');
  v_hold uuid[] := coalesce(p_hold, '{}');
  v_fired boolean;
  v_round integer := 0;
  v_today record;
  -- Clocks that filled during this transition: the caller's (tick_quest_clock)
  -- and any a tick_clock rule fills in the cascade below (#1011).
  v_filled_clocks uuid[] := case when p_clock_id is null then '{}'::uuid[] else array[p_clock_id] end;
  v_prev_filled integer;
  v_new_filled integer;
  v_segments integer;
  v_moved boolean;
begin
  v_settled_before := coalesce(p_settled_before, private.quest_ledger_settled(p_quest_id));
  select current_year, current_month, current_day into v_today
    from public.campaigns where id = p_campaign_id;

  loop
    v_fired := false;

    for v_rule in
      select c.*
        from public.quest_consequences c
       where c.quest_id = p_quest_id
         and not exists (
           select 1 from public.quest_consequence_events e
            where e.transition_id = p_transition_id and e.consequence_id = c.id
         )
         and (
           (v_round = 0 and (
              (p_beat_id is not null and c.on_beat_id = p_beat_id)
              or (p_edge_id is not null and c.on_edge_id = p_edge_id)
              -- #869: a place's fact, named by the caller like a beat or an
              -- edge is -- round 0 only, since nothing the engine itself does
              -- ever asserts a location fact.
              or (p_location_id is not null
                  and c.on_location_id = p_location_id
                  and c.on_location_fact = p_location_fact)
           ))
           -- #1011: a clock that filled, named by the caller in round 0 or
           -- filled by a tick_clock rule in an earlier round.
           or (c.on_clock_id is not null and c.on_clock_id = any(v_filled_clocks))
           or (
              c.on_objective_id = any(v_changed)
              and c.on_objective_status = (
                select o.status from public.quest_objectives o where o.id = c.on_objective_id
              )
           )
         )
       order by c.created_at, c.id
    loop
      v_fired := true;
      v_prev_status := null;
      v_prev_visible := null;
      v_prev_filled := null;
      v_moved := false;

      -- A held rule is logged as having applied to this beat/edge — the DM
      -- untucked it deliberately — but changes nothing, performs nothing, and
      -- does not seed the cascade with an objective that never actually moved.
      if v_rule.id = any(v_hold) then
        insert into public.quest_consequence_events (
          campaign_id, quest_id, transition_id, consequence_id, action,
          target_objective_id, target_npc_id, target_quest_id, target_document_id,
          target_clock_id, target_location_id, target_faction_id,
          action_payload, after_days, fires_on_year, fires_on_month, fires_on_day,
          held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id),
          v_rule.target_clock_id, v_rule.target_location_id, v_rule.target_faction_id,
          v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day,
          now()
        );
        continue;
      end if;

      if v_rule.action in ('raise', 'reveal', 'complete', 'fail') then
        select status, is_player_visible into v_prev_status, v_prev_visible
          from public.quest_objectives where id = v_rule.target_objective_id;

        -- #1011: settled is final for rules. complete and fail move only an
        -- objective that is still open (dormant or pending); one that has
        -- already settled keeps its result. The DM can still set it by hand
        -- (assert_quest_objective_status) or undo the step that settled it.
        update public.quest_objectives
           set status = case v_rule.action
                 when 'raise' then case when status = 'dormant' then 'pending' else status end
                 when 'reveal' then case when status = 'dormant' then 'pending' else status end
                 when 'complete' then case when status in ('dormant', 'pending') then 'complete' else status end
                 when 'fail' then case when status in ('dormant', 'pending') then 'failed' else status end
               end,
               is_player_visible = case when v_rule.action = 'reveal' then true else is_player_visible end
         where id = v_rule.target_objective_id;

        -- Moved = its status or its visibility changed. A reveal that only
        -- shows a pending objective still counts (quest_consequences.test.sql
        -- pins that); a complete that hit a settled objective does not.
        v_moved := exists (
          select 1 from public.quest_objectives o
           where o.id = v_rule.target_objective_id
             and (o.status is distinct from v_prev_status or o.is_player_visible is distinct from v_prev_visible)
        );
      elsif v_rule.action = 'tick_clock' then
        -- A clock is engine state like an objective: it moves now, inside the
        -- transition, and filling it seeds the next cascade round.
        select filled, segments into v_prev_filled, v_segments
          from public.quest_clocks where id = v_rule.target_clock_id;
        v_new_filled := least(greatest(
          v_prev_filled + coalesce((v_rule.action_payload ->> 'step')::int, 1), 0), v_segments);
        update public.quest_clocks set filled = v_new_filled where id = v_rule.target_clock_id;
        if v_new_filled = v_segments and v_prev_filled < v_segments
           and not (v_rule.target_clock_id = any(v_filled_clocks)) then
          v_filled_clocks := v_filled_clocks || v_rule.target_clock_id;
        end if;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, target_document_id, previous_status, previous_is_player_visible,
        target_clock_id, previous_clock_filled, target_location_id, target_faction_id,
        action_payload, after_days, fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id), v_prev_status, v_prev_visible,
        v_rule.target_clock_id, v_prev_filled, v_rule.target_location_id, v_rule.target_faction_id,
        v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      -- World actions perform now when due immediately. The three verbs added
      -- by #852 (grant_knowledge, owe_favor, award_milestone) join the four
      -- that already performed this way — they are world actions too, just
      -- ones with somewhere specific to write.
      if v_rule.after_days = 0 and private.quest_action_is_world(v_rule.action) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;

      if v_moved and not (v_rule.target_objective_id = any(v_changed)) then
        v_changed := v_changed || v_rule.target_objective_id;
      end if;
    end loop;

    exit when not v_fired;
    v_round := v_round + 1;
    if v_round > 8 then
      raise exception 'consequence cascade exceeded 8 rounds on quest % — check for a rule loop', p_quest_id;
    end if;
  end loop;

  if not v_settled_before and private.quest_ledger_settled(p_quest_id) then
    for v_rule in
      select c.* from public.quest_consequences c
       where c.quest_id = p_quest_id and c.on_quest_settled
         and not exists (
           select 1 from public.quest_consequence_events e
            where e.transition_id = p_transition_id and e.consequence_id = c.id
         )
       order by c.created_at, c.id
    loop
      if v_rule.id = any(v_hold) then
        insert into public.quest_consequence_events (
          campaign_id, quest_id, transition_id, consequence_id, action,
          target_objective_id, target_npc_id, target_quest_id, target_document_id,
          target_clock_id, target_location_id, target_faction_id, action_payload, after_days,
          fires_on_year, fires_on_month, fires_on_day, held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id),
          v_rule.target_clock_id, v_rule.target_location_id, v_rule.target_faction_id, v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day, now()
        );
        continue;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, target_document_id,
        target_clock_id, target_location_id, target_faction_id, action_payload, after_days,
        fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id),
        v_rule.target_clock_id, v_rule.target_location_id, v_rule.target_faction_id, v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      if v_rule.after_days = 0 and private.quest_action_is_world(v_rule.action) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;
    end loop;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION private.perform_quest_consequence(p_event_id uuid, p_year integer, p_month integer, p_day integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_ev  public.quest_consequence_events%rowtype;
  v_q   public.quests%rowtype;
  v_id  uuid;
  v_prev_rel public.npc_relationship;
  v_ladder text[] := array['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful'];
  v_idx int;
  v_step int;
  v_to text;
  v_prev_quest_status public.quest_status_enum;
  v_text text;
  v_prev_status text;
  v_prev_visible boolean;
  v_doc record;
  v_added uuid[];
  v_prev_location uuid;
  v_npc public.npcs%rowtype;
  v_prev_standing public.npc_relationship;
  v_clock public.quest_clocks%rowtype;
  v_tid uuid;
begin
  select * into v_ev from public.quest_consequence_events where id = p_event_id;
  if not found or v_ev.performed_at is not null or v_ev.undone_at is not null then
    return;
  end if;
  select * into v_q from public.quests where id = v_ev.quest_id;

  if v_ev.action in ('raise', 'reveal', 'complete', 'fail') then
    -- Only reached for a HELD ledger verb being fired from the log: a normal
    -- one already moved the objective inline in apply_quest_consequences.
    -- Recording previous_status/previous_is_player_visible here, at the
    -- moment it actually happens, is what lets `previous` undo it correctly
    -- later — a held event's own columns are null until this runs.
    select status, is_player_visible into v_prev_status, v_prev_visible
      from public.quest_objectives where id = v_ev.target_objective_id;

    update public.quest_objectives
       set status = case v_ev.action
             when 'raise' then case when status = 'dormant' then 'pending' else status end
             when 'reveal' then case when status = 'dormant' then 'pending' else status end
             when 'complete' then case when status in ('dormant', 'pending') then 'complete' else status end
             when 'fail' then case when status in ('dormant', 'pending') then 'failed' else status end
           end,
           is_player_visible = case when v_ev.action = 'reveal' then true else is_player_visible end
     where id = v_ev.target_objective_id;

    update public.quest_consequence_events
       set previous_status = v_prev_status, previous_is_player_visible = v_prev_visible
     where id = p_event_id;

  elsif v_ev.action = 'create_calendar_event' then
    insert into public.calendar_events (
      user_id, campaign_id, title, description, event_type,
      harptos_year, harptos_month, harptos_day, linked_quest_id, player_visible
    ) values (
      v_q.user_id, v_ev.campaign_id,
      coalesce(nullif(btrim(v_ev.action_payload ->> 'title'), ''), v_q.title),
      v_ev.action_payload ->> 'description',
      -- #1011: event_type is NOT NULL; a rule written without one (an AI
      -- spine, an import) files under quest rather than failing at fire time.
      coalesce(nullif(btrim(v_ev.action_payload ->> 'event_type'), ''), 'quest'),
      p_year, p_month, p_day, v_ev.quest_id,
      false
    ) returning id into v_id;
    update public.quest_consequence_events set calendar_event_id = v_id where id = p_event_id;

  elsif v_ev.action = 'send_broadcast' then
    insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
    values (v_ev.campaign_id, v_q.user_id, 'Grimoire',
            coalesce(nullif(btrim(v_ev.action_payload ->> 'message'), ''),
                     'Something has changed in ' || v_q.title || '.'),
            'system')
    returning id into v_id;
    update public.quest_consequence_events set message_id = v_id where id = p_event_id;

  elsif v_ev.action = 'shift_npc_relationship' then
    select n.relationship into v_prev_rel
      from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;

    v_to := v_ev.action_payload ->> 'to';
    if v_to is not null then
      -- The absolute form: "becomes helpful". Unlike a step it applies from
      -- `unknown` too — the DM is stating the stance outright, not moving it
      -- from one they never set — and it records the previous value
      -- (`unknown` included) so `previous` puts it back exactly.
      if v_to <> all (v_ladder) then
        raise exception 'shift_npc_relationship: unknown stance %', v_to using errcode = '22023';
      end if;
      if v_prev_rel is not null and v_prev_rel::text <> v_to then
        update public.npcs
           set relationship = v_to::public.npc_relationship
         where id = v_ev.target_npc_id;
        update public.quest_consequence_events
           set previous_relationship = v_prev_rel
         where id = p_event_id;
      end if;
    else
      v_step := coalesce((v_ev.action_payload ->> 'step')::int, 0);
      if v_prev_rel is not null and v_prev_rel <> 'unknown' and v_step <> 0 then
        v_idx := array_position(v_ladder, v_prev_rel::text);
        v_idx := least(greatest(v_idx + v_step, 1), array_length(v_ladder, 1));
        update public.npcs
           set relationship = v_ladder[v_idx]::public.npc_relationship
         where id = v_ev.target_npc_id;
        update public.quest_consequence_events
           set previous_relationship = v_prev_rel
         where id = p_event_id;
      end if;
    end if;

  elsif v_ev.action = 'unlock_quest' then
    select q.status into v_prev_quest_status
      from public.quests q
     where q.id = v_ev.target_quest_id and q.campaign_id = v_ev.campaign_id;

    if v_prev_quest_status = 'undiscovered' then
      update public.quests set status = 'active' where id = v_ev.target_quest_id;
      -- The bridge's target quest is entered sideways: its own entry beat is
      -- the rumour the party has now caused, so surface it the same way a
      -- quest arrived at by cursor would (see the enum-rebuild comment above).
      update public.quest_beats b
         set visibility = 'rumored'
        from public.quests q
       where q.id = v_ev.target_quest_id and q.entry_beat_id = b.id and b.visibility = 'hidden';
      update public.quest_consequence_events
         set previous_quest_status = v_prev_quest_status
       where id = p_event_id;
    end if;

  elsif v_ev.action = 'grant_knowledge' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'grant_knowledge requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.player_journal_entries (
      user_id, campaign_id, title, content, category, is_private,
      ref_type, ref_id, ref_label
    ) values (
      v_q.user_id, v_ev.campaign_id, left(btrim(v_text), 120), v_text, 'discovery', false,
      'quest', v_ev.quest_id, v_q.title
    ) returning id into v_id;
    update public.quest_consequence_events set journal_entry_id = v_id where id = p_event_id;

  elsif v_ev.action = 'owe_favor' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'owe_favor requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.npc_favors (campaign_id, npc_id, quest_id, text, source_event_id, created_by)
    values (v_ev.campaign_id, v_ev.target_npc_id, v_ev.quest_id, v_text, p_event_id, auth.uid())
    returning id into v_id;
    update public.quest_consequence_events set favor_id = v_id where id = p_event_id;

  elsif v_ev.action = 'award_milestone' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'award_milestone requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.party_milestones (campaign_id, quest_id, text, source_event_id, created_by)
    values (v_ev.campaign_id, v_ev.quest_id, v_text, p_event_id, auth.uid())
    returning id into v_id;
    update public.quest_consequence_events set milestone_id = v_id where id = p_event_id;

    insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
    values (v_ev.campaign_id, v_q.user_id, 'Grimoire', '🏅 ' || v_text, 'system')
    returning id into v_id;
    update public.quest_consequence_events set message_id = v_id where id = p_event_id;

  elsif v_ev.action = 'give_handout' then
    -- The handout reaches the whole party, through the same reveal path as a
    -- DM's own share_handout (20261004105821), so a handout a quest gives
    -- reveals exactly what one handed over by hand does. Scoped to the
    -- event's campaign: this runs as definer, and a rule naming another
    -- campaign's document must change nothing. A handout moved out of the
    -- campaign since the rule was written is simply not given.
    select d.id, d.content, d.player_visible_to into v_doc
      from public.scriptorium_documents d
     where d.id = v_ev.target_document_id and d.campaign_id = v_ev.campaign_id
       and d.user_id = v_q.user_id;
    if found then
      v_added := array(
        select pm.id from public.party_members pm
         where pm.campaign_id = v_ev.campaign_id
        except
        select x from unnest(v_doc.player_visible_to) x);
      perform private.apply_handout_reveals(
        v_ev.campaign_id, v_doc.content, v_doc.player_visible_to || v_added, false);
      -- Nobody new: no write, or updated_at would relight every holder's dot.
      if cardinality(v_added) > 0 then
        update public.scriptorium_documents
           set player_visible_to = v_doc.player_visible_to || v_added
         where id = v_doc.id;
      end if;
      -- The undo handle: only the recipients this event added, so undoing it
      -- never takes the handout from someone the DM gave it to by hand.
      update public.quest_consequence_events set handout_member_ids = v_added where id = p_event_id;
    end if;

  elsif v_ev.action = 'tick_clock' then
    -- Only reached for a HELD tick fired from the log; an unheld one moved
    -- the clock inline in apply_quest_consequences. Filling it here fires
    -- its rules under an assert transition of their own, as a tick from the
    -- run cockpit does.
    select * into v_clock from public.quest_clocks
     where id = v_ev.target_clock_id and campaign_id = v_ev.campaign_id;
    if found then
      update public.quest_consequence_events set previous_clock_filled = v_clock.filled where id = p_event_id;
      perform private.set_quest_clock_filled(
        v_clock.id, v_clock.filled + coalesce((v_ev.action_payload ->> 'step')::int, 1), null);
    end if;

  elsif v_ev.action = 'move_npc' then
    -- #1011. Scoped to the event's campaign on both ends: a definer must not
    -- move another campaign's NPC, or into another campaign's place.
    select n.location_id into v_prev_location
      from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;
    if found and exists (
      select 1 from public.locations l
       where l.id = v_ev.target_location_id and l.campaign_id = v_ev.campaign_id
    ) then
      update public.npcs set location_id = v_ev.target_location_id where id = v_ev.target_npc_id;
      update public.quest_consequence_events
         set previous_location_id = v_prev_location, npc_moved = true
       where id = p_event_id;
    end if;

  elsif v_ev.action = 'add_companion' then
    -- #1011. The same row CompanionForm seeds from an NPC: name, portrait,
    -- and the leading numbers of its stat block's HP, AC and speed. It joins
    -- the party unassigned; the DM gives it an owner on the Party page.
    select * into v_npc from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;
    if found then
      insert into public.companions (
        user_id, campaign_id, name, companion_type, source_type, source_npc_id,
        max_hp, current_hp, ac, speed, portrait_url, portrait_focal_point
      ) values (
        v_q.user_id, v_ev.campaign_id, v_npc.name, 'ally', 'npc', v_npc.id,
        coalesce(substring(v_npc.stat_block ->> 'hit_points' from '(\d+)')::int, 1),
        coalesce(substring(v_npc.stat_block ->> 'hit_points' from '(\d+)')::int, 1),
        coalesce(substring(v_npc.stat_block ->> 'armor_class' from '(\d+)')::int, 10),
        coalesce(substring(v_npc.stat_block ->> 'speed' from '(\d+)')::int, 30),
        v_npc.portrait_url, v_npc.portrait_focal_point
      ) returning id into v_id;
      update public.quest_consequence_events set companion_id = v_id where id = p_event_id;
    end if;

  elsif v_ev.action = 'shift_faction_standing' then
    -- #1011: the party's standing with a faction, on the NPC ladder and with
    -- the same two payload forms as shift_npc_relationship.
    select f.party_standing into v_prev_standing
      from public.factions f
     where f.id = v_ev.target_faction_id and f.campaign_id = v_ev.campaign_id;

    v_to := v_ev.action_payload ->> 'to';
    if v_to is not null then
      if v_to <> all (v_ladder) then
        raise exception 'shift_faction_standing: unknown stance %', v_to using errcode = '22023';
      end if;
      if v_prev_standing is not null and v_prev_standing::text <> v_to then
        update public.factions set party_standing = v_to::public.npc_relationship where id = v_ev.target_faction_id;
        update public.quest_consequence_events set previous_standing = v_prev_standing where id = p_event_id;
      end if;
    else
      v_step := coalesce((v_ev.action_payload ->> 'step')::int, 0);
      if v_prev_standing is not null and v_prev_standing <> 'unknown' and v_step <> 0 then
        v_idx := array_position(v_ladder, v_prev_standing::text);
        v_idx := least(greatest(v_idx + v_step, 1), array_length(v_ladder, 1));
        update public.factions set party_standing = v_ladder[v_idx]::public.npc_relationship where id = v_ev.target_faction_id;
        update public.quest_consequence_events set previous_standing = v_prev_standing where id = p_event_id;
      end if;
    end if;
  end if;

  update public.quest_consequence_events
     set performed_at = now(), held_at = null,
         performed_on_year = p_year, performed_on_month = p_month, performed_on_day = p_day
   where id = p_event_id;
end $function$;

-- ── 7. The runtime ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transition_quest_runtime(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid, p_command text, p_expected_version bigint, p_target_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_push_return boolean DEFAULT false, p_provenance jsonb DEFAULT '{}'::jsonb, p_spawn_edge_ids uuid[] DEFAULT '{}'::uuid[], p_hold_consequence_ids uuid[] DEFAULT '{}'::uuid[], p_dispatch_loot_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
  v_thread public.quest_threads;
  v_merged_into_label text;
  v_from_beat_id uuid;
  v_to_beat_id uuid;
  v_kind text;
  v_status text;
  v_visit_stack jsonb;
  v_visit_index integer;
  v_return_stack jsonb;
  v_return_target jsonb;
  v_quest_title text;
  v_from_beat_title text;
  v_to_beat_title text;
  v_provenance jsonb := coalesce(p_provenance, '{}'::jsonb);
  v_transition_id uuid;
  v_undo_transition_id uuid;
  v_hold uuid[] := coalesce(p_hold_consequence_ids, '{}');
  v_spawn uuid[] := coalesce(p_spawn_edge_ids, '{}');
  v_dispatch uuid[] := coalesce(p_dispatch_loot_ids, '{}');
  v_spawn_edge_id uuid;
  v_spawn_edge public.quest_beat_edges;
  v_spawn_target_title text;
  v_new_thread_id uuid;
  v_new_thread_label text;
  v_spawn_transition_id uuid;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  if p_command is null or p_command not in ('start', 'advance', 'previous', 'jump', 'return', 'improv', 'pause', 'resume', 'end') then
    raise exception 'Unknown quest runtime command: %', p_command;
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'An expected runtime version is required';
  end if;
  if jsonb_typeof(v_provenance) <> 'object' then
    raise exception 'Runtime provenance must be an object';
  end if;
  if cardinality(v_spawn) > 0 and p_command <> 'advance' then
    raise exception 'Spawning a parallel thread is only valid on advance' using errcode = '23514';
  end if;
  if cardinality(v_dispatch) > 0 and p_command <> 'advance' then
    raise exception 'Loot can only be dispatched on advance' using errcode = '23514';
  end if;

  select q.title into v_quest_title
  from public.quests q
  where q.id = p_quest_id and q.campaign_id = p_campaign_id;
  if not found then
    raise exception 'That quest is not in this campaign';
  end if;

  select * into v_thread from public.quest_threads
   where id = p_thread_id and quest_id = p_quest_id and campaign_id = p_campaign_id;
  if not found then
    raise exception 'That thread does not belong to this quest' using errcode = 'P0002';
  end if;
  if v_thread.status = 'merged' then
    select label into v_merged_into_label from public.quest_threads where id = v_thread.merged_into_thread_id;
    raise exception 'This thread was merged into %', coalesce(v_merged_into_label, 'another thread')
      using errcode = '23514';
  end if;

  -- The lock and the version are per thread: two co-DMs running two different
  -- threads of the same quest no longer contend.
  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text || ':' || p_quest_id::text || ':' || p_thread_id::text, 0));
  insert into public.quest_runtime_state (campaign_id, quest_id, thread_id)
  values (p_campaign_id, p_quest_id, p_thread_id)
  on conflict (campaign_id, quest_id, thread_id) do nothing;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id
  for update;

  if v_state.version <> p_expected_version then
    raise exception 'Quest runtime changed; expected version %, current version %', p_expected_version, v_state.version
      using errcode = '40001';
  end if;

  v_from_beat_id := v_state.current_beat_id;
  v_to_beat_id := v_from_beat_id;
  v_status := v_state.status;
  v_visit_stack := v_state.visit_stack;
  v_visit_index := v_state.visit_index;
  v_return_stack := v_state.return_stack;

  if p_command = 'start' then
    if p_target_beat_id is null then
      raise exception 'Start requires a target beat';
    end if;
    v_to_beat_id := p_target_beat_id;
    v_kind := 'enter';
    v_status := 'running';
    v_visit_stack := '[]'::jsonb;
    v_visit_index := -1;
    v_return_stack := '[]'::jsonb;
  elsif p_command = 'advance' then
    if v_state.status <> 'running' or v_from_beat_id is null or p_edge_id is null then
      raise exception 'Advance requires a running beat and authored edge';
    end if;
    declare
      v_edge public.quest_beat_edges;
    begin
      select * into v_edge
        from public.quest_beat_edges e
       where e.id = p_edge_id
         and e.campaign_id = p_campaign_id
         and e.quest_id = p_quest_id
         and e.source_beat_id = v_from_beat_id;
      if not found then raise exception 'That edge is not an outgoing choice'; end if;
      if v_edge.route_kind = 'parallel' then
        raise exception 'a parallel route is walked by spawning, not by advancing' using errcode = '23514';
      end if;
      v_to_beat_id := v_edge.target_beat_id;
    end;

    perform private.assert_edge_gate_open(p_edge_id);
    v_kind := 'forward';
    v_provenance := v_provenance || jsonb_build_object('edge_id', p_edge_id);
  elsif p_command = 'previous' then
    if v_state.status not in ('running', 'paused', 'waiting') or v_visit_index <= 0 then
      raise exception 'There is no previous visited beat';
    end if;
    v_visit_index := v_visit_index - 1;
    v_to_beat_id := (v_visit_stack -> v_visit_index ->> 'beat_id')::uuid;
    v_kind := 'previous';
    v_status := 'running';
  elsif p_command in ('jump', 'improv') then
    if v_from_beat_id is null or p_target_beat_id is null then
      raise exception '% requires a current and target beat', initcap(p_command);
    end if;
    if nullif(btrim(p_reason), '') is null then
      raise exception '% requires a reason', initcap(p_command);
    end if;
    v_to_beat_id := p_target_beat_id;
    v_kind := p_command;
    v_status := 'running';
    if p_push_return then
      v_return_stack := v_return_stack || jsonb_build_array(jsonb_build_object('beat_id', v_from_beat_id));
    end if;
  elsif p_command = 'return' then
    if jsonb_array_length(v_return_stack) = 0 then
      raise exception 'There is no saved return point';
    end if;
    v_return_target := v_return_stack -> (jsonb_array_length(v_return_stack) - 1);
    v_return_stack := v_return_stack - (jsonb_array_length(v_return_stack) - 1);
    v_to_beat_id := (v_return_target ->> 'beat_id')::uuid;
    v_kind := 'return';
    v_status := 'running';
  elsif p_command = 'pause' then
    if v_state.status <> 'running' or v_from_beat_id is null then
      raise exception 'Only a running quest session can be paused';
    end if;
    v_kind := 'pause';
    v_status := 'paused';
  elsif p_command = 'resume' then
    if v_state.status <> 'paused' or v_from_beat_id is null then
      raise exception 'Only a paused quest session can be resumed';
    end if;
    v_kind := 'resume';
    v_status := 'running';
  elsif p_command = 'end' then
    if v_from_beat_id is null then raise exception 'There is no quest session to end'; end if;
    v_kind := 'end';
    v_status := 'ended';
    v_to_beat_id := null;
  end if;

  if v_to_beat_id is not null and not exists (
    select 1 from public.quest_beats b
    where b.id = v_to_beat_id
      and b.quest_id = p_quest_id
      and b.campaign_id = p_campaign_id
      and b.kind <> 'archived'
      and (p_command <> 'improv' or b.is_improvised)
  ) then
    raise exception 'Target beat is not eligible in this quest';
  end if;

  -- Converge check: after computing the target of advance/jump/return/improv
  -- (never start, which is not a route being walked), a converge-all beat
  -- parks the arriving thread while another open thread of the quest can
  -- still reach it (#1011; it used to count authored incoming routes).
  if v_kind in ('forward', 'jump', 'return', 'improv') and v_to_beat_id is not null then
    v_status := private.compute_arrival_status(p_quest_id, v_to_beat_id, p_thread_id);
  end if;

  if p_command in ('start', 'advance', 'jump', 'return', 'improv') then
    select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb)
      into v_visit_stack
    from jsonb_array_elements(v_visit_stack) with ordinality entries(value, ordinal)
    where ordinal <= v_visit_index + 1;
    v_visit_stack := v_visit_stack || jsonb_build_array(jsonb_build_object('beat_id', v_to_beat_id));
    v_visit_index := v_visit_index + 1;
  end if;

  select b.title into v_from_beat_title from public.quest_beats b
  where b.id = v_from_beat_id and b.quest_id = p_quest_id;
  select b.title into v_to_beat_title from public.quest_beats b
  where b.id = v_to_beat_id and b.quest_id = p_quest_id;

  update public.quest_runtime_state
  set current_beat_id = v_to_beat_id,
      return_stack = v_return_stack,
      visit_stack = v_visit_stack,
      visit_index = v_visit_index,
      status = v_status,
      version = version + 1,
      updated_by = auth.uid()
  where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id and version = p_expected_version;

  if not found then
    raise exception 'Quest runtime changed while applying command' using errcode = '40001';
  end if;

  insert into public.quest_beat_transitions (
    campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
    transition_kind, reason, runtime_version, provenance, thread_id,
    from_quest_title, from_beat_title, to_quest_title, to_beat_title
  ) values (
    p_campaign_id,
    case when v_from_beat_id is null then null else p_quest_id end, v_from_beat_id,
    case when v_to_beat_id is null then null else p_quest_id end, v_to_beat_id,
    v_kind, nullif(btrim(p_reason), ''), p_expected_version + 1, v_provenance, p_thread_id,
    case when v_from_beat_id is null then null else v_quest_title end, v_from_beat_title,
    case when v_to_beat_id is null then null else v_quest_title end, v_to_beat_title
  )
  returning id into v_transition_id;

  if v_kind = 'previous' then
    -- Undo the newest not-yet-undone arrival at the beat being left, ON THIS
    -- THREAD. A sibling thread's history is untouched.
    select t.id into v_undo_transition_id
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id
      and t.to_quest_id = p_quest_id
      and t.to_beat_id = v_from_beat_id
      and t.thread_id = p_thread_id
      and t.id <> v_transition_id
      and t.transition_kind <> 'assert'
      and exists (
        select 1 from public.quest_consequence_events ev
         where ev.transition_id = t.id and ev.undone_at is null
      )
    order by t.created_at desc, t.id desc
    limit 1;

    if v_undo_transition_id is not null then
      update public.quest_objectives o
      set status = first_event.previous_status,
          is_player_visible = first_event.previous_is_player_visible
      from (
        select distinct on (ev.target_objective_id)
          ev.target_objective_id, ev.previous_status, ev.previous_is_player_visible
        from public.quest_consequence_events ev
        where ev.transition_id = v_undo_transition_id
          and ev.target_objective_id is not null
          and ev.undone_at is null
          -- A still-held event never touched the objective, so its
          -- previous_status is null — restoring it would blank the objective
          -- rather than leave it alone.
          and not (ev.held_at is not null and ev.performed_at is null)
        order by ev.target_objective_id, ev.seq
      ) first_event
      where o.id = first_event.target_objective_id;

      update public.npcs n
      set relationship = first_npc.previous_relationship
      from (
        select distinct on (ev.target_npc_id)
          ev.target_npc_id, ev.previous_relationship
        from public.quest_consequence_events ev
        where ev.transition_id = v_undo_transition_id
          and ev.target_npc_id is not null
          and ev.previous_relationship is not null
          and ev.undone_at is null
        order by ev.target_npc_id, ev.seq
      ) first_npc
      where n.id = first_npc.target_npc_id;

      -- Undo takes an unlocked quest back to undiscovered only while it is
      -- still active: a quest the DM has since completed or failed is not
      -- yanked back by an undo elsewhere. Visibility is deliberately NOT
      -- reverted — a rumour heard is not unheard; the DM can hide the beat
      -- again by hand if that is truly what they want.
      update public.quests q
      set status = first_quest.previous_quest_status
      from (
        select distinct on (ev.target_quest_id)
          ev.target_quest_id, ev.previous_quest_status
        from public.quest_consequence_events ev
        where ev.transition_id = v_undo_transition_id
          and ev.target_quest_id is not null
          and ev.previous_quest_status is not null
          and ev.undone_at is null
        order by ev.target_quest_id, ev.seq
      ) first_quest
      where q.id = first_quest.target_quest_id
        and q.status = 'active';

      -- #1011's state: a clock back to where the first event found it, an NPC
      -- back to their old place, a companion the rule added removed, a
      -- faction's standing restored.
      update public.quest_clocks k
      set filled = first_clock.previous_clock_filled
      from (
        select distinct on (ev.target_clock_id)
          ev.target_clock_id, ev.previous_clock_filled
        from public.quest_consequence_events ev
        where ev.transition_id = v_undo_transition_id
          and ev.target_clock_id is not null
          and ev.previous_clock_filled is not null
          and ev.undone_at is null
        order by ev.target_clock_id, ev.seq
      ) first_clock
      where k.id = first_clock.target_clock_id;

      update public.npcs n
      set location_id = first_move.previous_location_id
      from (
        select distinct on (ev.target_npc_id)
          ev.target_npc_id, ev.previous_location_id
        from public.quest_consequence_events ev
        where ev.transition_id = v_undo_transition_id
          and ev.action = 'move_npc'
          and ev.npc_moved
          and ev.undone_at is null
        order by ev.target_npc_id, ev.seq
      ) first_move
      where n.id = first_move.target_npc_id;

      delete from public.companions
       where id in (select ev.companion_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.companion_id is not null);

      update public.factions f
      set party_standing = first_standing.previous_standing
      from (
        select distinct on (ev.target_faction_id)
          ev.target_faction_id, ev.previous_standing
        from public.quest_consequence_events ev
        where ev.transition_id = v_undo_transition_id
          and ev.target_faction_id is not null
          and ev.previous_standing is not null
          and ev.undone_at is null
        order by ev.target_faction_id, ev.seq
      ) first_standing
      where f.id = first_standing.target_faction_id;

      delete from public.calendar_events
       where id in (select ev.calendar_event_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.calendar_event_id is not null);
      delete from public.campaign_messages
       where id in (select ev.message_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.message_id is not null);
      delete from public.player_journal_entries
       where id in (select ev.journal_entry_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.journal_entry_id is not null);
      delete from public.npc_favors
       where id in (select ev.favor_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.favor_id is not null);
      delete from public.party_milestones
       where id in (select ev.milestone_id from public.quest_consequence_events ev
                     where ev.transition_id = v_undo_transition_id and ev.milestone_id is not null);
      -- give_handout: withdraw it from the recipients that event added. What
      -- it revealed stays revealed, as with unlock_quest's rumour above: the
      -- party has read the handout, and reading is not undone.
      -- Grouped per document first: two events giving one handout in a single
      -- transition (a beat rule and an edge rule) would otherwise each match,
      -- and UPDATE ... FROM applies only one of them.
      update public.scriptorium_documents d
         set player_visible_to = array(
               select x from unnest(d.player_visible_to) x
               except
               select y from unnest(given.member_ids) y)
        from (
          select ev.target_document_id, array_agg(m) as member_ids
            from public.quest_consequence_events ev
            cross join lateral unnest(ev.handout_member_ids) m
           where ev.transition_id = v_undo_transition_id
             and ev.target_document_id is not null
             and ev.undone_at is null
           group by ev.target_document_id
        ) given
       where given.target_document_id = d.id;

      update public.quest_consequence_events
         set undone_at = now()
       where transition_id = v_undo_transition_id and undone_at is null;
    end if;

    -- A thread that was parked waiting for a merge is, again, simply running.
    update public.quest_threads set status = 'live' where id = p_thread_id and status = 'waiting';
  elsif v_kind = 'enter' then
    -- A quest ended and run again restarts on its Main thread: `end` closed
    -- the thread, so `start` reopens it, or the thread bar would show a row
    -- that is closed and running at once.
    update public.quest_threads set status = 'live', closed_at = null
     where id = p_thread_id and status = 'closed';
    -- start never converges (nothing has been "walked" into it).
    perform private.apply_quest_consequences(
      p_campaign_id, p_quest_id, v_transition_id, v_to_beat_id, null, '{}'::uuid[], null, v_hold
    );
  elsif v_kind in ('forward', 'jump', 'return', 'improv') then
    perform private.settle_thread_arrival(
      p_campaign_id, p_quest_id, v_quest_title, p_thread_id, v_transition_id, v_to_beat_id, v_to_beat_title,
      case when p_command = 'advance' then p_edge_id end,
      v_hold
    );
  elsif v_kind = 'end' then
    update public.quest_threads set status = 'closed', closed_at = now()
     where id = p_thread_id and status <> 'closed';
  end if;

  -- Spawn: parallel routes out of the beat the thread was standing on BEFORE
  -- this move, opened as their own threads with their own running cursors.
  if cardinality(v_spawn) > 0 then
    foreach v_spawn_edge_id in array v_spawn loop
      select * into v_spawn_edge
        from public.quest_beat_edges e
       where e.id = v_spawn_edge_id
         and e.campaign_id = p_campaign_id
         and e.quest_id = p_quest_id
         and e.source_beat_id = v_from_beat_id;
      if not found or v_spawn_edge.route_kind <> 'parallel' then
        raise exception 'That edge is not an outgoing parallel route from the current beat' using errcode = '23514';
      end if;
      perform private.assert_edge_gate_open(v_spawn_edge_id);

      select title into v_spawn_target_title from public.quest_beats where id = v_spawn_edge.target_beat_id;
      v_new_thread_label := coalesce(nullif(btrim(v_spawn_edge.thread_label), ''), v_spawn_target_title);

      -- A brand new thread is always 'live' at the THREAD level — 'waiting' is
      -- a quest_threads value too, but it describes a thread parked mid-life,
      -- not one just opened. settle_thread_arrival below flips it to 'waiting'
      -- itself, from the RUNTIME row's status, if this spawn parks immediately.
      insert into public.quest_threads (
        campaign_id, quest_id, label, status, opened_by_edge_id, parent_thread_id, created_by
      ) values (
        p_campaign_id, p_quest_id, v_new_thread_label, 'live',
        v_spawn_edge_id, p_thread_id, auth.uid()
      ) returning id into v_new_thread_id;

      insert into public.quest_runtime_state (
        campaign_id, quest_id, thread_id, current_beat_id, status,
        visit_stack, visit_index, return_stack, version, updated_by
      ) values (
        p_campaign_id, p_quest_id, v_new_thread_id, v_spawn_edge.target_beat_id,
        private.compute_arrival_status(p_quest_id, v_spawn_edge.target_beat_id, v_new_thread_id),
        jsonb_build_array(jsonb_build_object('beat_id', v_spawn_edge.target_beat_id)), 0, '[]'::jsonb, 1, auth.uid()
      );

      insert into public.quest_beat_transitions (
        campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
        transition_kind, reason, runtime_version, provenance, thread_id,
        from_quest_title, from_beat_title, to_quest_title, to_beat_title
      ) values (
        p_campaign_id, p_quest_id, v_from_beat_id, p_quest_id, v_spawn_edge.target_beat_id,
        'enter', nullif(btrim(p_reason), ''), 1,
        jsonb_build_object('spawned_by_edge_id', v_spawn_edge_id, 'parent_thread_id', p_thread_id, 'edge_id', v_spawn_edge_id),
        v_new_thread_id,
        v_quest_title, v_from_beat_title, v_quest_title, v_spawn_target_title
      ) returning id into v_spawn_transition_id;

      perform private.settle_thread_arrival(
        p_campaign_id, p_quest_id, v_quest_title, v_new_thread_id, v_spawn_transition_id,
        v_spawn_edge.target_beat_id, v_spawn_target_title, v_spawn_edge_id, v_hold
      );
    end loop;
  end if;

  -- #1011: any move can release a converge-all join: a thread that arrived,
  -- one that ended, one that walked somewhere the join is no longer reachable
  -- from. Settle every waiting join of the quest now.
  perform private.settle_converge_joins(p_campaign_id, p_quest_id, v_quest_title, v_hold);

  -- Dispatch: undispatched loot already staged on the beat just reached.
  if cardinality(v_dispatch) > 0 then
    if exists (
      select 1 from unnest(v_dispatch) e(id)
       where not exists (
         select 1 from public.loot_placements l
          where l.id = e.id and l.beat_id = v_to_beat_id and l.dispatched_at is null
       )
    ) then
      raise exception 'One or more loot entries are not undispatched loot on the target beat' using errcode = '23514';
    end if;
    perform public.dispatch_loot(v_dispatch);
  end if;

  return public.get_quest_runtime_context(p_campaign_id, p_quest_id, p_thread_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.open_quest_thread(p_campaign_id uuid, p_quest_id uuid, p_beat_id uuid, p_label text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_beat public.quest_beats;
  v_quest_title text;
  v_thread_id uuid;
  v_transition_id uuid;
  v_arrival_status text;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;
  if nullif(btrim(p_label), '') is null then
    raise exception 'A thread needs a label' using errcode = '22023';
  end if;

  select q.title into v_quest_title from public.quests q where q.id = p_quest_id and q.campaign_id = p_campaign_id;
  if not found then
    raise exception 'That quest is not in this campaign';
  end if;

  select * into v_beat from public.quest_beats
   where id = p_beat_id and quest_id = p_quest_id and campaign_id = p_campaign_id and kind <> 'archived';
  if not found then
    raise exception 'Target beat is not eligible in this quest';
  end if;

  insert into public.quest_threads (campaign_id, quest_id, label, status, created_by)
  values (p_campaign_id, p_quest_id, btrim(p_label), 'live', auth.uid())
  returning id into v_thread_id;

  v_arrival_status := private.compute_arrival_status(p_quest_id, p_beat_id, v_thread_id);

  insert into public.quest_runtime_state (
    campaign_id, quest_id, thread_id, current_beat_id, status,
    visit_stack, visit_index, return_stack, version, updated_by
  ) values (
    p_campaign_id, p_quest_id, v_thread_id, p_beat_id, v_arrival_status,
    jsonb_build_array(jsonb_build_object('beat_id', p_beat_id)), 0, '[]'::jsonb, 1, auth.uid()
  );

  insert into public.quest_beat_transitions (
    campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
    transition_kind, reason, runtime_version, provenance, thread_id,
    to_quest_title, to_beat_title
  ) values (
    p_campaign_id, null, null, p_quest_id, p_beat_id,
    'enter', nullif(btrim(p_reason), ''), 1, jsonb_build_object('surface', 'thread-open'), v_thread_id,
    v_quest_title, v_beat.title
  ) returning id into v_transition_id;

  perform private.settle_thread_arrival(
    p_campaign_id, p_quest_id, v_quest_title, v_thread_id, v_transition_id, p_beat_id, v_beat.title, null, '{}'::uuid[]
  );

  return public.get_quest_runtime_context(p_campaign_id, p_quest_id, v_thread_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_quest_thread(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_thread public.quest_threads;
  v_merged_into_label text;
  v_state public.quest_runtime_state;
  v_has_runtime boolean;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_thread from public.quest_threads
   where id = p_thread_id and quest_id = p_quest_id and campaign_id = p_campaign_id;
  if not found then
    raise exception 'That thread does not belong to this quest' using errcode = 'P0002';
  end if;
  if v_thread.status = 'merged' then
    select label into v_merged_into_label from public.quest_threads where id = v_thread.merged_into_thread_id;
    raise exception 'This thread was merged into %', coalesce(v_merged_into_label, 'another thread')
      using errcode = '23514';
  end if;

  select * into v_state from public.quest_runtime_state
   where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id;
  v_has_runtime := found;

  if v_has_runtime and v_state.current_beat_id is not null and v_state.status <> 'ended' then
    -- Reuses the fully-guarded `end` command, which also closes the thread
    -- record (see transition_quest_runtime) — so the update below is only
    -- needed for a thread that never had a cursor to end.
    perform public.transition_quest_runtime(
      p_campaign_id => p_campaign_id, p_quest_id => p_quest_id, p_thread_id => p_thread_id,
      p_command => 'end', p_expected_version => v_state.version, p_reason => p_reason
    );
  end if;

  update public.quest_threads set status = 'closed', closed_at = now()
   where id = p_thread_id and status <> 'closed';

  -- #1011: a thread that never had a cursor is closed here rather than by
  -- `end`, which settles joins itself; a join it was blocking may now merge.
  perform private.settle_converge_joins(
    p_campaign_id, p_quest_id,
    (select title from public.quests where id = p_quest_id), '{}'::uuid[]);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_quest_runtime_context(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
  v_previous jsonb;
  v_return jsonb;
  v_thread jsonb;
  v_threads jsonb;
  v_held jsonb;
  v_outgoing jsonb;
  v_path jsonb;
  v_found boolean;
  -- The thread to read: the caller's, or the quest's default (#972).
  v_tid uuid := p_thread_id;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- No thread named: the quest's default, the one `defaultThreadId`
  -- (src/lib/quests/threads.ts) picks, the oldest live or waiting thread. The
  -- run cockpit used to read the threads first only to learn this id, a round
  -- trip before the read it wanted. `thread` in the result says which was
  -- chosen; it is null when the quest has no open thread.
  if v_tid is null then
    select t.id into v_tid
      from public.quest_threads t
     where t.quest_id = p_quest_id and t.campaign_id = p_campaign_id
       and t.status in ('live', 'waiting')
     order by t.created_at, t.id
     limit 1;
  end if;

  select jsonb_build_object(
    'id', t.id, 'label', t.label, 'status', t.status,
    'opened_by_edge_id', t.opened_by_edge_id, 'parent_thread_id', t.parent_thread_id,
    'merged_into_thread_id', t.merged_into_thread_id, 'created_at', t.created_at
  ) into v_thread
  from public.quest_threads t
  where t.id = v_tid and t.quest_id = p_quest_id and t.campaign_id = p_campaign_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'label', t.label, 'status', t.status,
    'opened_by_edge_id', t.opened_by_edge_id, 'parent_thread_id', t.parent_thread_id,
    'merged_into_thread_id', t.merged_into_thread_id, 'created_at', t.created_at,
    'current_beat_id', s.current_beat_id,
    'current_beat_title', b.title,
    'runtime_status', s.status,
    'version', s.version
  ) order by t.created_at), '[]'::jsonb)
  into v_threads
  from public.quest_threads t
  left join public.quest_runtime_state s on s.thread_id = t.id and s.campaign_id = p_campaign_id and s.quest_id = p_quest_id
  left join public.quest_beats b on b.id = s.current_beat_id and b.quest_id = p_quest_id
  where t.quest_id = p_quest_id and t.campaign_id = p_campaign_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', ev.id, 'consequence_id', ev.consequence_id, 'action', ev.action,
    'target_objective_id', ev.target_objective_id, 'target_npc_id', ev.target_npc_id,
    'target_quest_id', ev.target_quest_id, 'target_document_id', ev.target_document_id,
    'target_clock_id', ev.target_clock_id, 'target_location_id', ev.target_location_id,
    'target_faction_id', ev.target_faction_id,
    'action_payload', ev.action_payload,
    'after_days', ev.after_days, 'held_at', ev.held_at,
    'beat_id', tr.to_beat_id, 'beat_title', tr.to_beat_title
  ) order by ev.held_at), '[]'::jsonb)
  into v_held
  from public.quest_consequence_events ev
  left join public.quest_beat_transitions tr on tr.id = ev.transition_id
  where ev.quest_id = p_quest_id and ev.campaign_id = p_campaign_id
    and ev.held_at is not null and ev.performed_at is null and ev.undone_at is null;

  select * into v_state from public.quest_runtime_state
   where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = v_tid;
  v_found := found;

  if not v_found then
    return jsonb_build_object(
      'state', null, 'current', null, 'previous', null,
      'outgoing', '[]'::jsonb, 'return_target', null, 'path_so_far', '[]'::jsonb,
      'thread', v_thread, 'threads', v_threads, 'held', v_held
    );
  end if;

  if v_state.visit_index > 0 then
    v_previous := v_state.visit_stack -> (v_state.visit_index - 1);
  end if;
  if jsonb_array_length(v_state.return_stack) > 0 then
    v_return := v_state.return_stack -> (jsonb_array_length(v_state.return_stack) - 1);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'edge_id', e.id,
    'quest_id', e.quest_id,
    'beat_id', b.id,
    'beat_title', b.title,
    'beat_kind', b.kind,
    'route_kind', e.route_kind,
    'thread_label', e.thread_label,
    'converge_mode', b.converge_mode,
    'site', (
      select jsonb_build_object(
        'location_id', l.id, 'name', l.name,
        'room_count', (select count(*) from public.locations r where r.parent_id = l.id and private.location_is_interior(r.location_type)),
        'location_type', l.location_type
      )
      from public.locations l
      where l.id = b.staged_at_location_id
        and private.location_can_hold_rooms(l.location_type)
    ),
    'gate', private.edge_gate_state(e.id),
    'effects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', qc.action,
        'objective', tobj.description,
        'after_days', qc.after_days
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      where qc.on_edge_id = e.id
    ), '[]'::jsonb),
    'payoff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'consequence_id', qc.id, 'action', qc.action,
        'target_objective_id', qc.target_objective_id, 'target_objective', tobj.description,
        'target_npc_id', qc.target_npc_id, 'target_npc', tnpc.name,
        'target_quest_id', qc.target_quest_id, 'target_quest', tquest.title,
        'target_document_id', qc.target_document_id, 'target_document', tdoc.title,
        'target_clock_id', qc.target_clock_id, 'target_clock', tclock.label,
        'target_location_id', qc.target_location_id, 'target_location', tloc.name,
        'target_faction_id', qc.target_faction_id, 'target_faction', tfaction.name,
        'action_payload', qc.action_payload, 'after_days', qc.after_days,
        'on_edge', qc.on_edge_id is not null
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      left join public.npcs tnpc on tnpc.id = qc.target_npc_id and tnpc.campaign_id = p_campaign_id
      left join public.quests tquest on tquest.id = qc.target_quest_id and tquest.campaign_id = p_campaign_id
      left join public.scriptorium_documents tdoc on tdoc.id = qc.target_document_id and tdoc.campaign_id = p_campaign_id
      left join public.quest_clocks tclock on tclock.id = qc.target_clock_id
      left join public.locations tloc on tloc.id = qc.target_location_id and tloc.campaign_id = p_campaign_id
      left join public.factions tfaction on tfaction.id = qc.target_faction_id and tfaction.campaign_id = p_campaign_id
      where qc.on_edge_id = e.id or qc.on_beat_id = b.id
    ), '[]'::jsonb),
    'loot', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lp.id, 'kind', lp.kind, 'label', lp.label, 'quantity', lp.quantity, 'item_id', lp.item_id
      ) order by lp.sort_order, lp.created_at)
      from public.loot_placements lp
      where lp.beat_id = b.id and lp.dispatched_at is null
    ), '[]'::jsonb)
  ) order by e.created_at), '[]'::jsonb)
  into v_outgoing
  from public.quest_beat_edges e
  join public.quest_beats b on b.id = e.target_beat_id
  where e.source_beat_id = v_state.current_beat_id;

  select coalesce(jsonb_agg(recent.entry order by recent.created_at, recent.id), '[]'::jsonb)
  into v_path
  from (
    select t.id, t.created_at, jsonb_build_object(
      'id', t.id, 'kind', t.transition_kind,
      'from_quest_id', t.from_quest_id, 'from_beat_id', t.from_beat_id,
      'from_quest_title', t.from_quest_title, 'from_beat_title', t.from_beat_title,
      'to_quest_id', t.to_quest_id, 'to_beat_id', t.to_beat_id,
      'to_quest_title', t.to_quest_title, 'to_beat_title', t.to_beat_title,
      'reason', t.reason, 'runtime_version', t.runtime_version, 'provenance', t.provenance,
      'created_at', t.created_at
    ) entry
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id
      and (t.thread_id = v_tid or t.thread_id is null)
      and (t.to_quest_id = p_quest_id or t.from_quest_id = p_quest_id)
    order by t.created_at desc, t.id desc
    limit 100
  ) recent;

  return jsonb_build_object(
    'state', to_jsonb(v_state),
    'current', (
      select to_jsonb(b) from public.quest_beats b
      where b.id = v_state.current_beat_id and b.quest_id = p_quest_id
    ),
    'previous', v_previous,
    'outgoing', coalesce(v_outgoing, '[]'::jsonb),
    'return_target', v_return,
    'path_so_far', v_path,
    'thread', v_thread,
    'threads', v_threads,
    'held', v_held
  );
end;
$function$;


-- ── 8. Ticking a clock from the run cockpit ────────────────────────────────

create function public.tick_quest_clock(p_clock_id uuid, p_step integer default 1, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_clock public.quest_clocks%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  select * into v_clock from public.quest_clocks where id = p_clock_id;
  if not found or not coalesce(private.is_campaign_dm(v_clock.campaign_id), false) then
    raise exception 'Not authorized';
  end if;
  if p_step is null or p_step = 0 then
    raise exception 'A tick needs a non-zero step' using errcode = '22023';
  end if;

  return private.set_quest_clock_filled(p_clock_id, v_clock.filled + p_step, p_reason);
end;
$function$;

revoke execute on function public.tick_quest_clock(uuid, integer, text) from public, anon;
grant execute on function public.tick_quest_clock(uuid, integer, text) to authenticated, service_role;

-- ── 9. Deadlines: the calendar moving past a due date ──────────────────────

-- When a campaign's date moves forward, every still-pending objective of an
-- active quest whose due date is now in the past fails, one assert
-- transition per quest, and its rules cascade. Only forward moves: winding
-- the calendar back un-fails nothing (the DM can, by hand). A due date is
-- inclusive: an objective due on the 14th fails when the date becomes the 15th.
-- Dates compare as (year, month, day) tuples, which holds for any calendar.
create function private.fail_overdue_objectives()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_quest record;
  v_ids uuid[];
  v_tid uuid;
  v_settled_before boolean;
begin
  if new.current_year is null or new.current_month is null or new.current_day is null
     or old.current_year is null or old.current_month is null or old.current_day is null
     or (new.current_year, new.current_month, new.current_day)
        <= (old.current_year, old.current_month, old.current_day) then
    return new;
  end if;

  for v_quest in
    select distinct q.id, q.title
      from public.quests q
      join public.quest_objectives o on o.quest_id = q.id
     where q.campaign_id = new.id
       and q.status = 'active'
       and o.status = 'pending'
       and o.due_year is not null
       and (o.due_year, o.due_month, o.due_day) < (new.current_year, new.current_month, new.current_day)
  loop
    select array_agg(o.id order by o.sort_order, o.id) into v_ids
      from public.quest_objectives o
     where o.quest_id = v_quest.id
       and o.status = 'pending'
       and o.due_year is not null
       and (o.due_year, o.due_month, o.due_day) < (new.current_year, new.current_month, new.current_day);

    v_settled_before := private.quest_ledger_settled(v_quest.id);

    update public.quest_objectives set status = 'failed' where id = any (v_ids);

    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, to_quest_id, transition_kind, reason, created_by, to_quest_title, provenance
    ) values (
      new.id, v_quest.id, v_quest.id, 'assert', 'Deadline passed',
      coalesce(auth.uid(), new.user_id), v_quest.title,
      jsonb_build_object('deadline', true, 'objective_ids', to_jsonb(v_ids),
        'date', jsonb_build_array(new.current_year, new.current_month, new.current_day))
    ) returning id into v_tid;

    perform private.apply_quest_consequences(
      new.id, v_quest.id, v_tid, null, null, v_ids, v_settled_before
    );
  end loop;

  return new;
end;
$function$;

create trigger campaigns_fail_overdue_objectives
  after update of current_year, current_month, current_day on public.campaigns
  for each row execute procedure private.fail_overdue_objectives();

-- ── 10. Players see the party's standing ───────────────────────────────────

-- The projection returns setof factions positionally, so the new column has
-- to be named here. Players see the standing, as they see an NPC's
-- relationship through get_player_visible_npcs: it is the party's own.
create or replace function public.get_player_visible_factions(p_campaign_id uuid, p_preview_member_id uuid default null::uuid)
returns setof factions
language sql
stable security definer
set search_path to 'public', 'private'
as $function$
  select
    f.id,
    f.user_id,
    f.name,
    f.faction_type,
    private.withhold_secret_blocks(f.description),
    f.emblem_url,
    f.alignment,
    f.tags,
    f.created_at,
    f.updated_at,
    f.player_visible_to,
    f.campaign_id,
    f.ai_provenance,
    f.setting_source,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    f.party_standing
  from factions f
  where f.campaign_id = p_campaign_id
    and (
      private.faction_is_visible_to_caller(f.id)
      or (
        private.is_campaign_dm(f.campaign_id)
        and case
          when p_preview_member_id is not null then
            p_preview_member_id = any (f.player_visible_to)
            or exists (
              select 1 from faction_party_members fpm
               where fpm.faction_id = f.id
                 and fpm.party_member_id = p_preview_member_id
            )
          else
            array_length(f.player_visible_to, 1) is not null
            or exists (select 1 from faction_party_members fpm where fpm.faction_id = f.id)
        end
      )
    )
$function$;

-- ── 11. Execute grants ─────────────────────────────────────────────────────

-- A trigger function needs no EXECUTE grant, and set_quest_clock_filled is
-- reached only from definer functions. settle_converge_joins keeps its grant:
-- close_quest_thread is an invoker function and calls it.
revoke execute on function private.fail_overdue_objectives() from public, anon, authenticated;
revoke execute on function private.set_quest_clock_filled(uuid, integer, text) from public, anon, authenticated;
revoke execute on function private.settle_converge_joins(uuid, uuid, text, uuid[]) from public, anon;
grant execute on function private.settle_converge_joins(uuid, uuid, text, uuid[]) to authenticated, service_role;
revoke execute on function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[], uuid, text, uuid) from public, anon;
grant execute on function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[], uuid, text, uuid) to authenticated, service_role;
