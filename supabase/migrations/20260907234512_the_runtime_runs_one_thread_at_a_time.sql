-- The runtime runs one thread at a time. Story #852, epic #850.
--
-- 20260907232245 landed the schema half: quest_runtime_state is keyed on
-- (campaign_id, quest_id, thread_id), quest_threads exists, edges carry
-- route_kind/thread_label, beats carry converge_mode, and three verbs
-- (grant_knowledge, owe_favor, award_milestone) have somewhere to write. This
-- migration is the engine that reads it: every runtime RPC becomes
-- thread-scoped, a parallel route spawns a thread, a converge-all beat parks
-- and then merges the threads that reach it, a payoff can be held instead of
-- fired, and loot can be dispatched as part of the same move that reaches it.
--
-- Design source: the maintainer's Quest System Redesign canvas, `Runner`
-- board — "beats read the ledger, the DM never wires a branch at the table."
-- Implemented as specified; nothing here is a reinterpretation of the design.

-- ── 0. Every quest gets a Main thread the moment it exists ──────────────────
--
-- `start` requires the thread it is given to already exist in `quest_threads`
-- for that quest. The schema migration backfilled a "Main" thread for every
-- quest that already had a runtime row; this is the forward-going half of
-- that, mirroring the precedent `create_quest_overview_beat` already set
-- (20260810214210) for a beat every quest is born with. Without it, a freshly
-- created quest would have nowhere to point `start` at all.

create or replace function private.create_quest_main_thread()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.campaign_id is not null then
    insert into public.quest_threads (campaign_id, quest_id, label, status, created_by)
    values (new.campaign_id, new.id, 'Main', 'live', new.user_id);
  end if;
  return new;
end;
$$;

revoke all on function private.create_quest_main_thread() from public, anon, authenticated;

create trigger create_quest_main_thread
  after insert on public.quests
  for each row execute function private.create_quest_main_thread();

comment on function private.create_quest_main_thread() is
  'Every quest is born with one thread, "Main", so `start` always has a thread to point at. Mirrors create_quest_overview_beat (#780).';

-- And every quest that already exists gets one too. The schema migration
-- backfilled Main only where a runtime row existed, which is every quest that
-- has ever been RUN; a quest that was only ever written has no cursor and so
-- had no thread — and `start` would have nowhere to point.
insert into public.quest_threads (campaign_id, quest_id, label, status, created_by, created_at)
select q.campaign_id, q.id, 'Main', 'live', q.user_id, q.created_at
  from public.quests q
 where q.campaign_id is not null
   and not exists (select 1 from public.quest_threads t where t.quest_id = q.id);

-- ── 0.5. A converge merge needs a real arrival order ─────────────────────────
--
-- Two different threads can each write their own arrival transition inside
-- the same wall-clock transaction (this migration's own tests do; two co-DMs
-- racing two threads into the same beat could too), and `created_at` is the
-- transaction's start time — identical for both. #787 hit exactly this shape
-- for quest_consequence_events and fixed it with a monotonic `seq`; a
-- converge-all merge has to pick "whichever thread arrived first" just as
-- precisely, so quest_beat_transitions gets the same column.

alter table public.quest_beat_transitions
  add column if not exists seq bigint generated always as identity;

create index if not exists quest_beat_transitions_seq_idx on public.quest_beat_transitions (seq);

comment on column public.quest_beat_transitions.seq is
  'Monotonic arrival order, independent of created_at (which two transitions in one transaction can share — #787''s lesson applied here). Used to find the earliest-arrived thread when a converge-all beat merges (#852).';

-- ── 1. Small private helpers shared by the functions below ──────────────────

-- Whether a route's gate, if it has one, is currently open. Shared by advance
-- (the existing check) and spawn (the same check, on a parallel route).
create or replace function private.assert_edge_gate_open(p_edge_id uuid)
returns void
language plpgsql
set search_path = public, private
as $$
declare
  v_gate record;
begin
  select g.status as required, o.status as current, o.description as objective
    into v_gate
    from public.quest_beat_edge_gates g
    join public.quest_objectives o on o.id = g.objective_id
   where g.edge_id = p_edge_id;
  if found and v_gate.current is distinct from v_gate.required then
    raise exception 'That route needs "%" to be %, and it is %',
      v_gate.objective, v_gate.required, v_gate.current
      using errcode = '23514';
  end if;
end;
$$;

revoke execute on function private.assert_edge_gate_open(uuid) from public, anon, authenticated;

comment on function private.assert_edge_gate_open(uuid) is
  'Raises 23514 naming the objective when a route''s gate is closed. Shared by advance and spawn.';

-- Whether a thread landing at a beat should park (converge_mode = all and more
-- than one authored incoming route) or simply carry on. Computed once, before
-- the runtime row is written, so the row is born in the right status instead
-- of being written twice.
create or replace function private.compute_arrival_status(p_quest_id uuid, p_to_beat_id uuid)
returns text
language sql
stable
set search_path = public, private
as $$
  select case
    when b.converge_mode = 'all' and (
      select count(*) from public.quest_beat_edges e
       where e.target_beat_id = p_to_beat_id and e.quest_id = p_quest_id
    ) > 1
    then 'waiting'
    else 'running'
  end
  from public.quest_beats b
  where b.id = p_to_beat_id;
$$;

revoke execute on function private.compute_arrival_status(uuid, uuid) from public, anon, authenticated;

comment on function private.compute_arrival_status(uuid, uuid) is
  'running, unless the target is a converge-all beat with more than one authored incoming route, in which case waiting.';

-- What happens once a transition has already been written and its runtime row
-- already carries the right status (running or waiting, from
-- compute_arrival_status above). A plain arrival just fires its consequences.
-- A parked (waiting) arrival marks the thread waiting, then checks whether
-- every incoming route into the beat has now been walked by a live-or-waiting
-- thread — this arrival's own edge counts immediately, which is what lets a
-- thread merge into itself on its own first visit. If every route is
-- satisfied, the earliest-arrived waiting thread survives as the running
-- cursor, every other waiting thread there is folded into it, and the beat's
-- arrival rules fire exactly once, on the survivor's ORIGINAL arrival
-- transition — not on whichever transition happened to complete the set.
create or replace function private.settle_thread_arrival(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_quest_title text,
  p_thread_id uuid,
  p_transition_id uuid,
  p_to_beat_id uuid,
  p_to_beat_title text,
  p_edge_id uuid,
  p_hold uuid[]
) returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_status text;
  v_edge_ids uuid[];
  v_check_edge uuid;
  v_all_satisfied boolean;
  v_survivor_thread_id uuid;
  v_survivor_transition_id uuid;
  v_loser record;
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
  -- the beat's arrival rules wait for the merge below.
  if p_edge_id is not null then
    perform private.apply_quest_consequences(
      p_campaign_id, p_quest_id, p_transition_id, null, p_edge_id, '{}'::uuid[], null, p_hold
    );
  end if;

  select coalesce(array_agg(id), '{}') into v_edge_ids
    from public.quest_beat_edges
   where target_beat_id = p_to_beat_id and quest_id = p_quest_id;

  v_all_satisfied := true;
  foreach v_check_edge in array v_edge_ids loop
    if not exists (
      select 1
        from public.quest_beat_transitions t
        join public.quest_threads th on th.id = t.thread_id
       where t.campaign_id = p_campaign_id
         and t.to_quest_id = p_quest_id
         and t.to_beat_id = p_to_beat_id
         and (t.provenance ->> 'edge_id') = v_check_edge::text
         and th.status in ('live', 'waiting')
    ) then
      v_all_satisfied := false;
      exit;
    end if;
  end loop;

  if not v_all_satisfied then
    return;
  end if;

  -- Ordered by seq, not created_at: two threads can each write their arrival
  -- transition inside the same wall-clock transaction, in which case
  -- created_at ties and the tiebreak would fall to a random uuid (#787's
  -- lesson, applied here) — seq is the one column guaranteed to say which
  -- arrival actually happened first.
  select th.id, arr.id
    into v_survivor_thread_id, v_survivor_transition_id
    from public.quest_threads th
    join public.quest_runtime_state s
      on s.thread_id = th.id and s.campaign_id = p_campaign_id and s.quest_id = p_quest_id
    join lateral (
      select t.id, t.seq from public.quest_beat_transitions t
       where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
         and t.to_beat_id = p_to_beat_id and t.thread_id = th.id
       order by t.seq asc
       limit 1
    ) arr on true
   where th.campaign_id = p_campaign_id and th.quest_id = p_quest_id
     and s.current_beat_id = p_to_beat_id and th.status = 'waiting'
   order by arr.seq asc
   limit 1;

  if v_survivor_thread_id is null then
    return;
  end if;

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
       and s.current_beat_id = p_to_beat_id and th.status = 'waiting'
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
      p_campaign_id, p_quest_id, p_to_beat_id, null, null,
      'end', 'Merged into another thread', jsonb_build_object('merged_into', v_survivor_thread_id), v_loser.thread_id,
      p_quest_title, p_to_beat_title, null, null
    );
  end loop;

  perform private.apply_quest_consequences(
    p_campaign_id, p_quest_id, v_survivor_transition_id, p_to_beat_id, null, '{}'::uuid[], null, p_hold
  );
end;
$$;

revoke execute on function private.settle_thread_arrival(uuid, uuid, text, uuid, uuid, uuid, text, uuid, uuid[]) from public, anon, authenticated;

comment on function private.settle_thread_arrival(uuid, uuid, text, uuid, uuid, uuid, text, uuid, uuid[]) is
  'Fires arrival rules for a plain arrival, or parks/merges a converge-all arrival, firing rules once on the surviving thread''s original arrival transition.';

-- ── 2. The consequence engine gains a hold ───────────────────────────────────
--
-- Drop-then-create rather than create-or-replace: a new trailing parameter on
-- a PL/pgSQL function creates a silent second overload instead of replacing
-- the original (the trap this epic's own migrations have hit before).

drop function if exists private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean);

create function private.apply_quest_consequences(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_transition_id uuid,
  p_beat_id uuid default null,
  p_edge_id uuid default null,
  p_changed_objective_ids uuid[] default '{}',
  p_settled_before boolean default null,
  p_hold uuid[] default '{}'
) returns void
language plpgsql
security definer
set search_path = public, private
as $function$
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
           ))
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

      -- A held rule is logged as having applied to this beat/edge — the DM
      -- untucked it deliberately — but changes nothing, performs nothing, and
      -- does not seed the cascade with an objective that never actually moved.
      if v_rule.id = any(v_hold) then
        insert into public.quest_consequence_events (
          campaign_id, quest_id, transition_id, consequence_id, action,
          target_objective_id, target_npc_id, target_quest_id,
          action_payload, after_days, fires_on_year, fires_on_month, fires_on_day,
          held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id,
          v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day,
          now()
        );
        continue;
      end if;

      if v_rule.action in ('raise', 'reveal', 'complete', 'fail') then
        select status, is_player_visible into v_prev_status, v_prev_visible
          from public.quest_objectives where id = v_rule.target_objective_id;

        update public.quest_objectives
           set status = case v_rule.action
                 when 'raise' then case when status = 'dormant' then 'pending' else status end
                 when 'reveal' then case when status = 'dormant' then 'pending' else status end
                 when 'complete' then 'complete'
                 when 'fail' then 'failed'
               end,
               is_player_visible = case when v_rule.action = 'reveal' then true else is_player_visible end
         where id = v_rule.target_objective_id;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, previous_status, previous_is_player_visible,
        action_payload, after_days, fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, v_prev_status, v_prev_visible,
        v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      -- World actions perform now when due immediately. The three verbs added
      -- by #852 (grant_knowledge, owe_favor, award_milestone) join the four
      -- that already performed this way — they are world actions too, just
      -- ones with somewhere specific to write.
      if v_rule.after_days = 0 and v_rule.action in (
        'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
        'grant_knowledge', 'owe_favor', 'award_milestone'
      ) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;

      if v_rule.target_objective_id is not null
         and not (v_rule.target_objective_id = any(v_changed)) then
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
          target_objective_id, target_npc_id, target_quest_id, action_payload, after_days,
          fires_on_year, fires_on_month, fires_on_day, held_at
        ) values (
          p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
          v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, v_rule.action_payload, v_rule.after_days,
          v_today.current_year, v_today.current_month, v_today.current_day, now()
        );
        continue;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, action_payload, after_days,
        fires_on_year, fires_on_month, fires_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day
      ) returning id into v_event_id;

      if v_rule.after_days = 0 and v_rule.action in (
        'create_calendar_event', 'send_broadcast', 'shift_npc_relationship', 'unlock_quest',
        'grant_knowledge', 'owe_favor', 'award_milestone'
      ) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;
    end loop;
  end if;
end $function$;

comment on function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[]) is
  'The one rule engine: fires a beat/edge/objective-became/ledger-settled rule at most once per transition, unless its id is held (#852), in which case it is logged and does nothing.';

revoke execute on function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[]) from public, anon, authenticated;

-- ── 3. perform_quest_consequence gains the three verbs and the ledger arms ──

create or replace function private.perform_quest_consequence(p_event_id uuid, p_year integer, p_month integer, p_day integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'private'
as $function$
declare
  v_ev  public.quest_consequence_events%rowtype;
  v_q   public.quests%rowtype;
  v_id  uuid;
  v_prev_rel public.npc_relationship;
  v_ladder text[] := array['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful'];
  v_idx int;
  v_step int;
  v_prev_quest_status public.quest_status_enum;
  v_text text;
  v_prev_status text;
  v_prev_visible boolean;
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
             when 'complete' then 'complete'
             when 'fail' then 'failed'
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
      v_ev.action_payload ->> 'event_type',
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

  elsif v_ev.action = 'unlock_quest' then
    select q.status into v_prev_quest_status
      from public.quests q
     where q.id = v_ev.target_quest_id and q.campaign_id = v_ev.campaign_id;

    if v_prev_quest_status = 'undiscovered' then
      update public.quests set status = 'rumor' where id = v_ev.target_quest_id;
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
  end if;

  update public.quest_consequence_events
     set performed_at = now(), held_at = null,
         performed_on_year = p_year, performed_on_month = p_month, performed_on_day = p_day
   where id = p_event_id;
end $function$;

comment on function private.perform_quest_consequence(uuid, integer, integer, integer) is
  'Performs a due or held consequence event: the four world actions, the three #852 verbs (journal/favor/milestone), or — for a held ledger verb — the objective move itself. Clears held_at.';

-- ── 4. transition_quest_runtime: thread-scoped, converging, spawning ────────

drop function if exists public.transition_quest_runtime(uuid, uuid, text, bigint, uuid, uuid, text, boolean, jsonb);

create function public.transition_quest_runtime(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_thread_id uuid,
  p_command text,
  p_expected_version bigint,
  p_target_beat_id uuid default null,
  p_edge_id uuid default null,
  p_reason text default null,
  p_push_return boolean default false,
  p_provenance jsonb default '{}'::jsonb,
  p_spawn_edge_ids uuid[] default '{}',
  p_hold_consequence_ids uuid[] default '{}',
  p_dispatch_loot_ids uuid[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
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
  -- with more than one authored incoming route parks the arriving thread
  -- instead of running it straight through.
  if v_kind in ('forward', 'jump', 'return', 'improv') and v_to_beat_id is not null then
    v_status := private.compute_arrival_status(p_quest_id, v_to_beat_id);
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
        and q.status = 'rumor';

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
        private.compute_arrival_status(p_quest_id, v_spawn_edge.target_beat_id),
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

revoke execute on function public.transition_quest_runtime(uuid, uuid, uuid, text, bigint, uuid, uuid, text, boolean, jsonb, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.transition_quest_runtime(uuid, uuid, uuid, text, bigint, uuid, uuid, text, boolean, jsonb, uuid[], uuid[], uuid[]) to authenticated, service_role;

comment on function public.transition_quest_runtime(uuid, uuid, uuid, text, bigint, uuid, uuid, text, boolean, jsonb, uuid[], uuid[], uuid[]) is
  'Atomically applies a version-checked DM runtime command to one THREAD''s cursor: parks/merges a converge-all arrival, optionally spawns parallel threads and dispatches staged loot, and applies or reverses consequences (#852).';

-- ── 5. get_quest_runtime_context: thread + siblings + held payoffs ─────────

drop function if exists public.get_quest_runtime_context(uuid, uuid);

create function public.get_quest_runtime_context(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = public, private
as $$
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
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'id', t.id, 'label', t.label, 'status', t.status,
    'opened_by_edge_id', t.opened_by_edge_id, 'parent_thread_id', t.parent_thread_id,
    'merged_into_thread_id', t.merged_into_thread_id, 'created_at', t.created_at
  ) into v_thread
  from public.quest_threads t
  where t.id = p_thread_id and t.quest_id = p_quest_id and t.campaign_id = p_campaign_id;

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
    'target_quest_id', ev.target_quest_id, 'action_payload', ev.action_payload,
    'after_days', ev.after_days, 'held_at', ev.held_at,
    'beat_id', tr.to_beat_id, 'beat_title', tr.to_beat_title
  ) order by ev.held_at), '[]'::jsonb)
  into v_held
  from public.quest_consequence_events ev
  left join public.quest_beat_transitions tr on tr.id = ev.transition_id
  where ev.quest_id = p_quest_id and ev.campaign_id = p_campaign_id
    and ev.held_at is not null and ev.performed_at is null and ev.undone_at is null;

  select * into v_state from public.quest_runtime_state
   where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id;
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
        'room_count', (select count(*) from public.locations r where r.parent_id = l.id and r.location_type = 'room')
      )
      from public.locations l
      where l.id = b.staged_at_location_id
        and private.location_can_hold_rooms(l.location_type)
    ),
    'gate', (
      select jsonb_build_object(
        'objective_id', g.objective_id, 'objective', o.description,
        'required_status', g.status, 'current_status', o.status,
        'is_open', o.status = g.status
      )
      from public.quest_beat_edge_gates g
      join public.quest_objectives o on o.id = g.objective_id
      where g.edge_id = e.id
    ),
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
        'action_payload', qc.action_payload, 'after_days', qc.after_days,
        'on_edge', qc.on_edge_id is not null
      ) order by qc.created_at)
      from public.quest_consequences qc
      left join public.quest_objectives tobj on tobj.id = qc.target_objective_id
      left join public.npcs tnpc on tnpc.id = qc.target_npc_id
      left join public.quests tquest on tquest.id = qc.target_quest_id
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
      and (t.thread_id = p_thread_id or t.thread_id is null)
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
$$;

revoke execute on function public.get_quest_runtime_context(uuid, uuid, uuid) from public, anon;
grant execute on function public.get_quest_runtime_context(uuid, uuid, uuid) to authenticated, service_role;

comment on function public.get_quest_runtime_context(uuid, uuid, uuid) is
  'The DM-authorized projection of one thread''s cursor: its own state, every sibling thread of the quest, the routes and loot it can reach next, and the quest''s held payoffs.';

-- ── 6. assert_quest_runtime: thread-scoped prep-time corrections ───────────

drop function if exists public.assert_quest_runtime(uuid, uuid, uuid[], boolean, text);

create function public.assert_quest_runtime(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_thread_id uuid,
  p_beat_ids uuid[],
  p_place_cursor boolean default true,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = 'public', 'private'
as $$
declare
  v_state   public.quest_runtime_state%rowtype;
  v_quest   public.quests%rowtype;
  v_thread  public.quest_threads%rowtype;
  v_beat_id uuid;
  v_prev    uuid;
  v_tid     uuid;
  v_applied integer := 0;
  v_titles  jsonb := '[]'::jsonb;
  v_title   text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_quest from public.quests
   where id = p_quest_id and campaign_id = p_campaign_id;
  if not found then
    raise exception 'Quest not found in this campaign' using errcode = 'P0002';
  end if;

  select * into v_thread from public.quest_threads
   where id = p_thread_id and quest_id = p_quest_id and campaign_id = p_campaign_id;
  if not found then
    raise exception 'That thread does not belong to this quest' using errcode = 'P0002';
  end if;

  if p_beat_ids is null or array_length(p_beat_ids, 1) is null then
    raise exception 'Nothing to assert' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_beat_ids) as b(id)
     where not exists (
       select 1 from public.quest_beats qb
        where qb.id = b.id and qb.quest_id = p_quest_id and qb.campaign_id = p_campaign_id
     )
  ) then
    raise exception 'Every asserted beat must belong to this quest' using errcode = '23503';
  end if;

  select * into v_state from public.quest_runtime_state
   where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = p_thread_id;

  select t.to_beat_id into v_prev
    from public.quest_beat_transitions t
   where t.to_quest_id = p_quest_id
     and t.campaign_id = p_campaign_id
     and t.to_beat_id is not null
     and t.thread_id = p_thread_id
   order by t.created_at desc, t.id desc
   limit 1;

  if v_prev is null then
    v_prev := v_state.current_beat_id;
  end if;

  foreach v_beat_id in array p_beat_ids loop
    select title into v_title from public.quest_beats where id = v_beat_id;

    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
      transition_kind, reason, created_by, to_quest_title, to_beat_title, thread_id
    ) values (
      p_campaign_id,
      case when v_prev is null then null else p_quest_id end, v_prev,
      p_quest_id, v_beat_id,
      'assert', nullif(btrim(p_reason), ''), auth.uid(), v_quest.title, v_title, p_thread_id
    ) returning id into v_tid;

    perform private.apply_quest_consequences(p_campaign_id, p_quest_id, v_tid, v_beat_id, null);

    v_titles := v_titles || to_jsonb(coalesce(v_title, ''));
    v_prev := v_beat_id;
    v_applied := v_applied + 1;
  end loop;

  if p_place_cursor then
    if v_state.quest_id is null then
      insert into public.quest_runtime_state (
        campaign_id, quest_id, thread_id, current_beat_id, status, updated_by,
        visit_stack, visit_index, return_stack, version
      ) values (
        p_campaign_id, p_quest_id, p_thread_id, v_prev,
        'paused', auth.uid(),
        jsonb_build_array(v_prev), 0, '[]'::jsonb, 1
      );
    else
      update public.quest_runtime_state
         set current_beat_id = v_prev,
             visit_stack = coalesce(visit_stack, '[]'::jsonb) || jsonb_build_array(v_prev),
             visit_index = jsonb_array_length(coalesce(visit_stack, '[]'::jsonb)),
             version = version + 1,
             updated_by = auth.uid()
       where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = p_thread_id;
    end if;
  end if;

  return jsonb_build_object(
    'asserted', v_applied,
    'beats', v_titles,
    'cursor_placed', p_place_cursor,
    'current_beat_id', case when p_place_cursor then v_prev else v_state.current_beat_id end
  );
end $$;

comment on function public.assert_quest_runtime(uuid, uuid, uuid, uuid[], boolean, text) is
  'Records beats as already played on one THREAD: appends assert transitions carrying thread_id, fires each beat''s consequences, and optionally places that thread''s cursor — without starting a session (#796, thread-scoped by #852).';

revoke execute on function public.assert_quest_runtime(uuid, uuid, uuid, uuid[], boolean, text) from public, anon;
grant execute on function public.assert_quest_runtime(uuid, uuid, uuid, uuid[], boolean, text) to authenticated, service_role;

-- ── 7. improvise_quest_runtime: thread-scoped ───────────────────────────────

drop function if exists public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean);

create function public.improvise_quest_runtime(
  p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid, p_expected_version bigint, p_title text,
  p_kind text default 'neutral'::text, p_dm_lead text default null::text, p_reveal_text text default null::text,
  p_reason text default null::text, p_push_return boolean default true, p_keep_edge boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_state public.quest_runtime_state;
  v_source public.quest_beats;
  v_created public.quest_beats;
  v_context jsonb;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;
  if nullif(btrim(p_title), '') is null then raise exception 'An improv title is required'; end if;
  p_reason := coalesce(nullif(btrim(p_reason), ''), btrim(p_title));

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id and thread_id = p_thread_id;
  if not found or v_state.current_beat_id is null or v_state.status <> 'running' then
    raise exception 'A running beat is required to improvise';
  end if;
  if v_state.version <> p_expected_version then
    raise exception 'Quest runtime changed; expected version %, current version %', p_expected_version, v_state.version
      using errcode = '40001';
  end if;
  select * into strict v_source from public.quest_beats where id = v_state.current_beat_id;

  insert into public.quest_beats (
    quest_id, campaign_id, title, kind, visibility, dm_content, reveal_text,
    presentation_hint, canvas_x, canvas_y, is_improvised
  ) values (
    v_source.quest_id, p_campaign_id, btrim(p_title), coalesce(nullif(btrim(p_kind), ''), 'neutral'),
    'hidden', nullif(p_dm_lead, ''), nullif(p_reveal_text, ''), 'Improvised at the table',
    v_source.canvas_x + 320, v_source.canvas_y + 160, true
  ) returning * into v_created;

  if p_keep_edge then
    insert into public.quest_beat_edges (
      quest_id, campaign_id, source_beat_id, target_beat_id
    ) values (
      v_source.quest_id, p_campaign_id, v_source.id, v_created.id
    );
  end if;

  v_context := public.transition_quest_runtime(
    p_campaign_id => p_campaign_id,
    p_quest_id => p_quest_id,
    p_thread_id => p_thread_id,
    p_command => 'improv',
    p_expected_version => p_expected_version,
    p_target_beat_id => v_created.id,
    p_reason => p_reason,
    p_push_return => p_push_return,
    p_provenance => jsonb_build_object('surface', 'quest-run-improv', 'kept_edge', p_keep_edge)
  );

  return jsonb_build_object('context', v_context, 'beat', to_jsonb(v_created));
end;
$function$;

comment on function public.improvise_quest_runtime(uuid, uuid, uuid, bigint, text, text, text, text, text, boolean, boolean) is
  'Atomically creates a hidden improvised beat, enters it on one THREAD, optionally keeps an authored edge. The title stands in as the reason when none is given (#824); thread-scoped by #852.';

revoke execute on function public.improvise_quest_runtime(uuid, uuid, uuid, bigint, text, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.improvise_quest_runtime(uuid, uuid, uuid, bigint, text, text, text, text, text, boolean, boolean) to authenticated, service_role;

-- ── 8. archive_quest_beat: every thread standing on the beat gets a say ────
--
-- The old p_expected_runtime_version scalar cannot describe "every thread
-- currently on this beat" once a beat can hold more than one, so it is
-- dropped rather than reshaped: the loop below reads each thread's row FOR
-- UPDATE at call time, which is itself the concurrency guard — a thread that
-- arrives on the beat after the caller loaded the page and is missing from
-- p_replacements is caught right here, as a legible 23514 naming it, rather
-- than a version mismatch the caller has to interpret.

drop function if exists public.archive_quest_beat(uuid, bigint, uuid, boolean);

create function public.archive_quest_beat(
  p_beat_id uuid,
  p_replacements jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_beat public.quest_beats;
  v_thread record;
  v_repl jsonb;
  v_target_beat_id uuid;
  v_replacement public.quest_beats;
  v_version bigint;
begin
  select * into v_beat
  from public.quest_beats
  where id = p_beat_id;

  if not found then
    raise exception 'Beat not found or not editable' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not coalesce(private.is_campaign_dm(v_beat.campaign_id), false) then
    raise exception 'Beat not found or not editable' using errcode = 'P0002';
  end if;

  if jsonb_typeof(coalesce(p_replacements, '[]'::jsonb)) <> 'array' then
    raise exception 'Replacements must be an array' using errcode = '22023';
  end if;

  for v_thread in
    select s.thread_id, s.version, t.label
      from public.quest_runtime_state s
      join public.quest_threads t on t.id = s.thread_id
     where s.campaign_id = v_beat.campaign_id
       and s.quest_id = v_beat.quest_id
       and s.current_beat_id = p_beat_id
       for update of s
  loop
    v_repl := null;
    select r into v_repl
      from jsonb_array_elements(coalesce(p_replacements, '[]'::jsonb)) r
     where (r ->> 'thread_id')::uuid = v_thread.thread_id
     limit 1;

    if v_repl is null then
      raise exception 'Thread "%" is standing on this beat and has no replacement', v_thread.label
        using errcode = '23514';
    end if;

    v_target_beat_id := nullif(v_repl ->> 'beat_id', '')::uuid;

    if v_target_beat_id is null then
      perform public.transition_quest_runtime(
        p_campaign_id => v_beat.campaign_id,
        p_quest_id => v_beat.quest_id,
        p_thread_id => v_thread.thread_id,
        p_command => 'end',
        p_expected_version => v_thread.version
      );
    else
      select * into v_replacement
      from public.quest_beats
      where id = v_target_beat_id
        and campaign_id = v_beat.campaign_id
        and quest_id = v_beat.quest_id
        and kind <> 'archived';
      if not found or v_replacement.id = p_beat_id then
        raise exception 'Replacement beat not found or not usable' using errcode = '22023';
      end if;
      perform public.transition_quest_runtime(
        p_campaign_id => v_beat.campaign_id,
        p_quest_id => v_beat.quest_id,
        p_thread_id => v_thread.thread_id,
        p_command => 'jump',
        p_expected_version => v_thread.version,
        p_target_beat_id => v_replacement.id,
        p_reason => 'Current beat removed from authored flow'
      );
    end if;
  end loop;

  delete from public.quest_beat_attachments where beat_id = p_beat_id;
  delete from public.quest_beat_edges where source_beat_id = p_beat_id or target_beat_id = p_beat_id;
  update public.quest_beats set kind = 'archived', visibility = 'hidden' where id = p_beat_id;
end;
$$;

comment on function public.archive_quest_beat(uuid, jsonb) is
  'Archives a beat. Every thread whose cursor sits on it must be named in p_replacements ([{thread_id, beat_id}], beat_id null ends that thread) or the call is refused (#852).';

revoke all on function public.archive_quest_beat(uuid, jsonb) from public;
revoke execute on function public.archive_quest_beat(uuid, jsonb) from anon;
grant execute on function public.archive_quest_beat(uuid, jsonb) to authenticated, service_role;

-- ── 9. Opening and closing a thread by hand ─────────────────────────────────

create function public.open_quest_thread(
  p_campaign_id uuid, p_quest_id uuid, p_beat_id uuid, p_label text, p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
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

  v_arrival_status := private.compute_arrival_status(p_quest_id, p_beat_id);

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
$$;

comment on function public.open_quest_thread(uuid, uuid, uuid, text, text) is
  'Opens a manual thread at a beat (the thread bar''s "Open a thread"): a fresh running cursor, no parent edge, arrival rules apply (#852).';

revoke execute on function public.open_quest_thread(uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.open_quest_thread(uuid, uuid, uuid, text, text) to authenticated, service_role;

create function public.close_quest_thread(
  p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid, p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, private
as $$
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
end;
$$;

comment on function public.close_quest_thread(uuid, uuid, uuid, text) is
  'Closes a thread from the thread bar. Delegates to the end command when it has a live cursor (which also stamps quest_threads); refuses a merged thread (#852).';

revoke execute on function public.close_quest_thread(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.close_quest_thread(uuid, uuid, uuid, text) to authenticated, service_role;

-- ── 10. get_campaign_live_quests: one row per open thread ───────────────────

drop function if exists public.get_campaign_live_quests(uuid);

create function public.get_campaign_live_quests(p_campaign_id uuid)
returns table (
  quest_id uuid,
  quest_title text,
  quest_status text,
  beat_id uuid,
  beat_title text,
  beat_kind text,
  runtime_status text,
  version bigint,
  updated_at timestamptz,
  thread_id uuid,
  thread_label text,
  thread_status text,
  sibling_count integer
)
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    q.id, q.title, q.status::text, b.id, b.title, b.kind, s.status, s.version, s.updated_at,
    t.id, t.label, t.status,
    (
      select count(*)::integer from public.quest_runtime_state s2
       where s2.campaign_id = p_campaign_id and s2.quest_id = q.id
         and s2.status in ('running', 'paused', 'waiting')
    ) as sibling_count
  from public.quest_runtime_state s
  join public.quests q on q.id = s.quest_id and q.campaign_id = s.campaign_id
  join public.quest_beats b on b.id = s.current_beat_id and b.quest_id = s.quest_id
  join public.quest_threads t on t.id = s.thread_id
  where s.campaign_id = p_campaign_id
    and s.status in ('running', 'paused', 'waiting')
  order by (s.status = 'running') desc, s.updated_at desc;
end;
$$;

revoke execute on function public.get_campaign_live_quests(uuid) from public, anon;
grant execute on function public.get_campaign_live_quests(uuid) to authenticated, service_role;

comment on function public.get_campaign_live_quests(uuid) is
  'Every open thread in the campaign, running first. sibling_count is how many live threads that thread''s quest has open at once (#852).';

-- ── 11. end_campaign_quest_session: pauses every running thread ────────────

create or replace function public.end_campaign_quest_session(p_campaign_id uuid)
returns integer
language plpgsql security definer
set search_path = public, private
as $$
declare
  v_paused integer;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- Waiting threads stay waiting: the story parked them, not the DM closing
  -- the table for the night, and they resume on their own when merged.
  with paused as (
    update public.quest_runtime_state
    set status = 'paused', version = version + 1, updated_by = auth.uid()
    where campaign_id = p_campaign_id and status = 'running'
    returning quest_id, thread_id, current_beat_id, version
  ),
  logged as (
    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
      transition_kind, reason, runtime_version, provenance, thread_id,
      from_quest_title, from_beat_title, to_quest_title, to_beat_title
    )
    select
      p_campaign_id, p.quest_id, p.current_beat_id, p.quest_id, p.current_beat_id,
      'pause', 'Session ended', p.version, jsonb_build_object('surface', 'campaign-session-end'), p.thread_id,
      q.title, b.title, q.title, b.title
    from paused p
    join public.quests q on q.id = p.quest_id
    left join public.quest_beats b on b.id = p.current_beat_id
    returning 1
  )
  select count(*)::integer into v_paused from logged;

  return v_paused;
end;
$$;

revoke execute on function public.end_campaign_quest_session(uuid) from public, anon;
grant execute on function public.end_campaign_quest_session(uuid) to authenticated, service_role;

comment on function public.end_campaign_quest_session(uuid) is
  'Pauses every running thread in the campaign at its current beat. Waiting threads (parked for a merge) are left waiting.';

-- ── 12. Players see a milestone the moment it is awarded ────────────────────
--
-- party_milestones is member-readable and the party screen lists it; without
-- the publication a milestone awarded at the table waits for a refetch.
alter publication supabase_realtime add table public.party_milestones;
