-- Ending a session stops nothing, and a quest thread cannot be paused.
--
-- A quest thread had a `paused` status, and ending a session paused every
-- running thread (`end_campaign_quest_session`, #755). The server only lets a
-- thread advance while it is `running`, so every new session began with the
-- Advance dialog refusing ("Advance requires a running beat and authored
-- edge") until the DM found Resume. On 30 Oct 2026 every thread in production
-- with a cursor was paused and none was running. The maintainer's verdict:
-- pausing threads is useless. A thread holding a cursor is where the party
-- is in that story, whether or not anyone is at the table tonight.
--
-- Ending a session also forced every running encounter off, and the runner
-- then rebuilt the fight from the lobby with initiative blank, although the
-- row still held the round, the turn and every hit point. The maintainer
-- wants to carry a fight over between sessions, so ending a session no longer
-- touches `encounter_state`: a fight stays live until End combat, and the next
-- session's runner rehydrates it from the row.
--
-- So:
--   * `quest_runtime_state.status` loses `paused`; paused threads become
--     `running` (version untouched: nothing about the cursor changed, and an
--     open Advance dialog holding the old version should still go through).
--   * the `pause` and `resume` runtime commands and transition kinds go. Their
--     log rows moved no cursor and fired no consequence (checked: zero
--     `quest_consequence_events` hang off them), so they are deleted rather
--     than kept as a kind nothing can write.
--   * `end_campaign_quest_session` is dropped; `end_campaign_session` only
--     closes the session row and returns nothing.
--   * `assert_quest_runtime` creates a running thread, so Advance works right
--     after the DM records what already happened.
--   * `get_campaign_live_quests` reads running and waiting threads.

delete from public.quest_beat_transitions
 where transition_kind in ('pause', 'resume');

update public.quest_runtime_state
   set status = 'running'
 where status = 'paused';

alter table public.quest_runtime_state
  drop constraint quest_runtime_state_status_check,
  add constraint quest_runtime_state_status_check
    check (status in ('idle', 'running', 'waiting', 'ended'));

alter table public.quest_beat_transitions
  drop constraint quest_beat_transitions_transition_kind_check,
  add constraint quest_beat_transitions_transition_kind_check
    check (transition_kind in ('enter', 'forward', 'previous', 'jump', 'return', 'improv', 'end', 'assert'));

-- Ending a session closes it in the log, and that is all it does.
drop function public.end_campaign_session(uuid);
drop function public.end_campaign_quest_session(uuid);

create function public.end_campaign_session(p_campaign_id uuid)
 returns void
 language plpgsql
 set search_path to 'public', 'private'
as $function$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  -- Quest threads keep their cursor and a running fight stays live: the next
  -- session picks both up where the table left them. End combat ends a fight.
  update public.campaign_sessions
     set ended_at = now()
   where campaign_id = p_campaign_id and started_at is not null and ended_at is null;
end;
$function$;

revoke execute on function public.end_campaign_session(uuid) from public, anon;
grant execute on function public.end_campaign_session(uuid) to authenticated, service_role;

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

  if p_command is null or p_command not in ('start', 'advance', 'previous', 'jump', 'return', 'improv', 'end') then
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
    if v_state.status not in ('running', 'waiting') or v_visit_index <= 0 then
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
  -- from. Settle every waiting join of the quest now, once (settle_thread_arrival
  -- no longer does it itself).
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

CREATE OR REPLACE FUNCTION public.assert_quest_runtime(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid, p_beat_ids uuid[], p_place_cursor boolean DEFAULT true, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
        'running', auth.uid(),
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
end $function$;

CREATE OR REPLACE FUNCTION public.get_campaign_live_quests(p_campaign_id uuid)
 RETURNS TABLE(quest_id uuid, quest_title text, quest_status text, beat_id uuid, beat_title text, beat_kind text, runtime_status text, version bigint, updated_at timestamp with time zone, thread_id uuid, thread_label text, thread_status text, sibling_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
         and s2.status in ('running', 'waiting')
    ) as sibling_count
  from public.quest_runtime_state s
  join public.quests q on q.id = s.quest_id and q.campaign_id = s.campaign_id
  join public.quest_beats b on b.id = s.current_beat_id and b.quest_id = s.quest_id
  join public.quest_threads t on t.id = s.thread_id
  where s.campaign_id = p_campaign_id
    and s.status in ('running', 'waiting')
  order by (s.status = 'running') desc, s.updated_at desc;
end;
$function$;
