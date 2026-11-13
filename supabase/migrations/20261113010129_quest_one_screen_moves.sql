-- Quest One Screen (#1183), story A: the server for marking what happened,
-- failed beats, and one Undo.
--
--   * private.undo_quest_transition_consequences: the consequence-undo block that
--     lived inline in transition_quest_runtime's `previous` branch, now callable
--     by Undo as well.
--   * A beat can be FAILED as well as arrived at: quest_beat_transitions.outcome,
--     quest_consequences.on_beat_outcome, and apply_quest_consequences' new
--     trailing p_beat_outcome.
--   * public.mark_quest_move / public.undo_quest_move replace
--     public.assert_quest_runtime, which is dropped.

-- ── 1. The undo block, extracted verbatim ──────────────────────────────────
CREATE OR REPLACE FUNCTION private.undo_quest_transition_consequences(p_transition_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  update public.quest_objectives o
  set status = first_event.previous_status,
      is_player_visible = first_event.previous_is_player_visible
  from (
    select distinct on (ev.target_objective_id)
      ev.target_objective_id, ev.previous_status, ev.previous_is_player_visible
    from public.quest_consequence_events ev
    where ev.transition_id = p_transition_id
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
    where ev.transition_id = p_transition_id
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
    where ev.transition_id = p_transition_id
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
    where ev.transition_id = p_transition_id
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
    where ev.transition_id = p_transition_id
      and ev.action = 'move_npc'
      and ev.npc_moved
      and ev.undone_at is null
    order by ev.target_npc_id, ev.seq
  ) first_move
  where n.id = first_move.target_npc_id;

  delete from public.companions
   where id in (select ev.companion_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.companion_id is not null);

  update public.factions f
  set party_standing = first_standing.previous_standing
  from (
    select distinct on (ev.target_faction_id)
      ev.target_faction_id, ev.previous_standing
    from public.quest_consequence_events ev
    where ev.transition_id = p_transition_id
      and ev.target_faction_id is not null
      and ev.previous_standing is not null
      and ev.undone_at is null
    order by ev.target_faction_id, ev.seq
  ) first_standing
  where f.id = first_standing.target_faction_id;

  delete from public.calendar_events
   where id in (select ev.calendar_event_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.calendar_event_id is not null);
  delete from public.campaign_messages
   where id in (select ev.message_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.message_id is not null);
  delete from public.player_journal_entries
   where id in (select ev.journal_entry_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.journal_entry_id is not null);
  delete from public.npc_favors
   where id in (select ev.favor_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.favor_id is not null);
  delete from public.party_milestones
   where id in (select ev.milestone_id from public.quest_consequence_events ev
                 where ev.transition_id = p_transition_id and ev.milestone_id is not null);
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
       where ev.transition_id = p_transition_id
         and ev.target_document_id is not null
         and ev.undone_at is null
       group by ev.target_document_id
    ) given
   where given.target_document_id = d.id;

  update public.quest_consequence_events
     set undone_at = now()
   where transition_id = p_transition_id and undone_at is null;
end;
$function$;

revoke execute on function private.undo_quest_transition_consequences(uuid) from public, anon, authenticated;

-- transition_quest_runtime: identical except the `previous` branch calls the
-- extracted function.
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
      perform private.undo_quest_transition_consequences(v_undo_transition_id);
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

-- ── 2. A beat can fail ──────────────────────────────────────────────────────
alter table public.quest_beat_transitions
  add column outcome text check (outcome in ('failed'));

alter table public.quest_consequences
  add column on_beat_outcome text not null default 'arrived'
    check (on_beat_outcome in ('arrived', 'failed'));

alter table public.quest_consequences
  add constraint quest_consequences_failed_needs_beat
    check (on_beat_outcome = 'arrived' or on_beat_id is not null);

-- A rule "on arrival, complete X" and a rule "on failure, complete X" on one beat
-- are different rules: the outcome joins the uniqueness key.
drop index public.quest_consequences_beat_rule_uniq;
create unique index quest_consequences_beat_rule_uniq on public.quest_consequences (
  on_beat_id, on_beat_outcome, action,
  coalesce(target_objective_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_quest_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_npc_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_document_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_clock_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(target_faction_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where on_beat_id is not null
    and action <> all (array['create_calendar_event', 'send_broadcast', 'grant_knowledge', 'award_milestone']);

-- No overload left behind: every existing caller passes at most the eleven
-- original arguments, so it resolves to the new signature via the default.
drop function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[], uuid, text, uuid);

CREATE OR REPLACE FUNCTION private.apply_quest_consequences(p_campaign_id uuid, p_quest_id uuid, p_transition_id uuid, p_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_changed_objective_ids uuid[] DEFAULT '{}'::uuid[], p_settled_before boolean DEFAULT NULL::boolean, p_hold uuid[] DEFAULT '{}'::uuid[], p_location_id uuid DEFAULT NULL::uuid, p_location_fact text DEFAULT NULL::text, p_clock_id uuid DEFAULT NULL::uuid, p_beat_outcome text DEFAULT 'arrived'::text)
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
              (p_beat_id is not null and c.on_beat_id = p_beat_id
               and c.on_beat_outcome = coalesce(p_beat_outcome, 'arrived'))
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
          from public.quest_clocks where id = v_rule.target_clock_id for update;
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
        action_payload, after_days, fires_on_year, fires_on_month, fires_on_day,
        performed_at, performed_on_year, performed_on_month, performed_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id), v_prev_status, v_prev_visible,
        v_rule.target_clock_id, v_prev_filled, v_rule.target_location_id, v_rule.target_faction_id,
        v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day,
        -- An engine-state verb has just applied above: it is performed now.
        case when private.quest_action_is_world(v_rule.action) then null else now() end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_year end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_month end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_day end
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

      v_prev_status := null;
      v_prev_visible := null;
      v_prev_filled := null;
      if v_rule.action in ('raise', 'reveal', 'complete', 'fail') then
        select status, is_player_visible into v_prev_status, v_prev_visible
          from public.quest_objectives where id = v_rule.target_objective_id;
        update public.quest_objectives
           set status = case v_rule.action
                 when 'raise' then case when status = 'dormant' then 'pending' else status end
                 when 'reveal' then case when status = 'dormant' then 'pending' else status end
                 when 'complete' then case when status in ('dormant', 'pending') then 'complete' else status end
                 when 'fail' then case when status in ('dormant', 'pending') then 'failed' else status end
               end,
               is_player_visible = case when v_rule.action = 'reveal' then true else is_player_visible end
         where id = v_rule.target_objective_id;
      elsif v_rule.action = 'tick_clock' then
        select filled, segments into v_prev_filled, v_segments
          from public.quest_clocks where id = v_rule.target_clock_id for update;
        update public.quest_clocks
           set filled = least(greatest(v_prev_filled + coalesce((v_rule.action_payload ->> 'step')::int, 1), 0), v_segments)
         where id = v_rule.target_clock_id;
      end if;

      insert into public.quest_consequence_events (
        campaign_id, quest_id, transition_id, consequence_id, action,
        target_objective_id, target_npc_id, target_quest_id, target_document_id,
        previous_status, previous_is_player_visible, previous_clock_filled,
        target_clock_id, target_location_id, target_faction_id, action_payload, after_days,
        fires_on_year, fires_on_month, fires_on_day,
        performed_at, performed_on_year, performed_on_month, performed_on_day
      ) values (
        p_campaign_id, p_quest_id, p_transition_id, v_rule.id, v_rule.action,
        v_rule.target_objective_id, v_rule.target_npc_id, v_rule.target_quest_id, private.handout_still_in_campaign(v_rule.target_document_id, p_campaign_id),
        v_prev_status, v_prev_visible, v_prev_filled,
        v_rule.target_clock_id, v_rule.target_location_id, v_rule.target_faction_id, v_rule.action_payload, v_rule.after_days,
        v_today.current_year, v_today.current_month, v_today.current_day,
        case when private.quest_action_is_world(v_rule.action) then null else now() end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_year end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_month end,
        case when private.quest_action_is_world(v_rule.action) then null else v_today.current_day end
      ) returning id into v_event_id;

      if v_rule.after_days = 0 and private.quest_action_is_world(v_rule.action) then
        perform private.perform_quest_consequence(
          v_event_id, v_today.current_year, v_today.current_month, v_today.current_day
        );
      end if;
    end loop;
  end if;
end $function$;

revoke execute on function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[], uuid, text, uuid, text) from public, anon;
grant execute on function private.apply_quest_consequences(uuid, uuid, uuid, uuid, uuid, uuid[], boolean, uuid[], uuid, text, uuid, text) to authenticated, service_role;


-- ── 3. mark_quest_move ──────────────────────────────────────────────────────
-- Records a move that already happened, as `assert` transitions: no session is
-- started and no status is touched (a fix to the record is not sitting down to
-- play). Kinds:
--   route       the party took an edge; arrival rules of the target and the
--               edge's own rules fire
--   party_here  the party is at a beat; its arrival rules fire once per thread
--   failed      the beat was failed; arrival fires first when the thread never
--               arrived, then only the fail-outcome rules fire
-- The beats on the shortest route from one beat to another, both ends
-- included, following quest_beat_edges forward (breadth first, so the
-- shortest). Null when the goal cannot be reached from the start.
CREATE OR REPLACE FUNCTION private.quest_beat_path(p_quest_id uuid, p_from uuid, p_to uuid)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_frontier uuid[] := array[p_from];
  v_seen uuid[] := array[p_from];
  v_parent jsonb := '{}'::jsonb;
  v_next uuid[];
  v_step record;
  v_path uuid[];
  v_cursor uuid;
begin
  if p_from is null or p_to is null then
    return null;
  end if;
  if p_from = p_to then
    return array[p_from];
  end if;

  while cardinality(v_frontier) > 0 and not (p_to = any(v_seen)) loop
    v_next := '{}';
    for v_step in
      select e.source_beat_id as source, e.target_beat_id as target
        from public.quest_beat_edges e
        join public.quest_beats b on b.id = e.target_beat_id and b.kind <> 'archived'
       where e.quest_id = p_quest_id
         and e.source_beat_id = any(v_frontier)
       order by e.created_at, e.id
    loop
      if not (v_step.target = any(v_seen)) then
        v_seen := v_seen || v_step.target;
        v_next := v_next || v_step.target;
        v_parent := v_parent || jsonb_build_object(v_step.target::text, v_step.source);
      end if;
    end loop;
    v_frontier := v_next;
  end loop;

  if not (p_to = any(v_seen)) then
    return null;
  end if;

  v_cursor := p_to;
  v_path := array[p_to];
  while v_cursor <> p_from loop
    v_cursor := (v_parent ->> v_cursor::text)::uuid;
    v_path := v_cursor || v_path;
  end loop;
  return v_path;
end $function$;

revoke execute on function private.quest_beat_path(uuid, uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_quest_move(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_thread_id uuid,
  p_kind text,
  p_edge_id uuid DEFAULT NULL::uuid,
  p_beat_id uuid DEFAULT NULL::uuid,
  p_session_id uuid DEFAULT NULL::uuid,
  p_place_party boolean DEFAULT false,
  p_dispatch_loot_ids uuid[] DEFAULT NULL::uuid[],
  p_move_party_to uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
-- Records a move that already happened, as `assert` transitions that fire the
-- consequences a played arrival would. Every transition one call writes
-- carries the same `move_id` in its provenance, so Undo takes the whole move
-- back at once. A move further along the story fills in the way there: the
-- beats on the shortest route from where the thread last was (or from the
-- quest's entry, when it has not started) that the thread has not reached.
declare
  v_quest public.quests%rowtype;
  v_thread public.quest_threads%rowtype;
  v_state public.quest_runtime_state%rowtype;
  v_edge public.quest_beat_edges%rowtype;
  v_target uuid;
  v_reach uuid;
  v_from uuid;
  v_prev uuid;
  v_title text;
  v_tid uuid;
  v_tids uuid[] := '{}';
  v_place boolean := coalesce(p_place_party, false);
  v_loot uuid[] := coalesce(p_dispatch_loot_ids, '{}');
  v_move_id uuid := gen_random_uuid();
  -- The thread the move lands on: the caller's, except that taking a
  -- parallel route opens a thread of its own, as Advance does at the table.
  v_move_thread uuid := p_thread_id;
  v_path uuid[];
  v_beat uuid;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  if p_kind is null or p_kind not in ('route', 'party_here', 'failed') then
    raise exception 'Unknown quest move: %', p_kind using errcode = '22023';
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
  if v_thread.status = 'merged' then
    raise exception 'This thread was merged into another thread' using errcode = '23514';
  end if;

  if p_kind = 'route' then
    select * into v_edge from public.quest_beat_edges
     where id = p_edge_id and quest_id = p_quest_id and campaign_id = p_campaign_id;
    if not found then
      raise exception 'That route does not belong to this quest' using errcode = '23503';
    end if;
    v_target := v_edge.target_beat_id;
    -- The way in leads to where the route leaves from.
    v_reach := v_edge.source_beat_id;
    if exists (select 1 from public.quest_beats b where b.id = v_target and b.kind = 'archived') then
      raise exception 'That route leads to an archived beat' using errcode = '23514';
    end if;
  else
    if not exists (
      select 1 from public.quest_beats b
       where b.id = p_beat_id and b.quest_id = p_quest_id and b.campaign_id = p_campaign_id
    ) then
      raise exception 'That beat does not belong to this quest' using errcode = '23503';
    end if;
    v_target := p_beat_id;
    v_reach := p_beat_id;
  end if;

  if cardinality(v_loot) > 0 and exists (
    select 1 from unnest(v_loot) e(id)
     where not exists (
       select 1 from public.loot_placements l
        where l.id = e.id and l.quest_id = p_quest_id and l.campaign_id = p_campaign_id
          and l.beat_id = v_target and l.dispatched_at is null
     )
  ) then
    raise exception 'One or more loot entries are not undispatched loot on the target beat' using errcode = '23514';
  end if;

  if p_move_party_to is not null and not exists (
    select 1 from public.locations lo where lo.id = p_move_party_to and lo.campaign_id = p_campaign_id
  ) then
    raise exception 'That place is not in this campaign' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text || ':' || p_quest_id::text || ':' || p_thread_id::text, 0));

  select * into v_state from public.quest_runtime_state
   where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = p_thread_id;

  -- Where the thread last was: its newest arrival, else its cursor. A thread
  -- that never started begins at the quest's entry.
  select t.to_beat_id into v_prev
    from public.quest_beat_transitions t
   where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
     and t.thread_id = p_thread_id and t.to_beat_id is not null
   order by t.seq desc
   limit 1;
  if v_prev is null then v_prev := v_state.current_beat_id; end if;

  -- Fill in the way to v_reach: each beat on the shortest route there that
  -- this thread has not reached, in story order. With no start, the route
  -- runs from the entry, which is then filled in too.
  v_path := private.quest_beat_path(p_quest_id, coalesce(v_prev, v_quest.entry_beat_id), v_reach);
  if v_path is not null then
    foreach v_beat in array v_path loop
      -- v_reach itself is the move's own arrival below, except on a route,
      -- where it is the source the route leaves from and is filled in here.
      continue when v_beat = v_reach and p_kind <> 'route';
      continue when exists (
        select 1 from public.quest_beat_transitions t
         where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
           and t.thread_id = p_thread_id and t.to_beat_id = v_beat
      );
      select title into v_title from public.quest_beats where id = v_beat;
      insert into public.quest_beat_transitions (
        campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
        transition_kind, created_by, from_quest_title, from_beat_title,
        to_quest_title, to_beat_title, thread_id, session_id, provenance
      ) values (
        p_campaign_id, case when v_prev is null then null else p_quest_id end, v_prev,
        p_quest_id, v_beat,
        'assert', auth.uid(), case when v_prev is null then null else v_quest.title end,
        (select title from public.quest_beats where id = v_prev),
        v_quest.title, v_title, p_thread_id, p_session_id,
        jsonb_build_object('by', 'mark', 'move_id', v_move_id, 'filled_in', true)
      ) returning id into v_tid;
      v_tids := v_tids || v_tid;
      perform private.apply_quest_consequences(p_campaign_id, p_quest_id, v_tid, v_beat, null);
      v_prev := v_beat;
    end loop;
  end if;

  select title into v_title from public.quest_beats where id = v_target;

  if p_kind = 'route' then
    v_from := v_edge.source_beat_id;
    if v_edge.route_kind = 'parallel' then
      insert into public.quest_threads (
        campaign_id, quest_id, label, status, opened_by_edge_id, parent_thread_id, created_by
      ) values (
        p_campaign_id, p_quest_id, coalesce(nullif(btrim(v_edge.thread_label), ''), v_title), 'live',
        p_edge_id, p_thread_id, auth.uid()
      ) returning id into v_move_thread;
      insert into public.quest_runtime_state (
        campaign_id, quest_id, thread_id, current_beat_id, status,
        visit_stack, visit_index, return_stack, version, updated_by
      ) values (
        p_campaign_id, p_quest_id, v_move_thread, v_target,
        private.compute_arrival_status(p_quest_id, v_target, v_move_thread),
        jsonb_build_array(jsonb_build_object('beat_id', v_target)), 0, '[]'::jsonb, 1, auth.uid()
      );
      -- The new thread already stands on the target; the caller's thread stays put.
      v_place := false;
    end if;
    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
      transition_kind, reason, created_by, from_quest_title, from_beat_title,
      to_quest_title, to_beat_title, thread_id, session_id, provenance
    ) values (
      p_campaign_id, p_quest_id, v_from, p_quest_id, v_target,
      'assert', null, auth.uid(), v_quest.title, (select title from public.quest_beats where id = v_from),
      v_quest.title, v_title, v_move_thread, p_session_id,
      jsonb_build_object('edge_id', p_edge_id, 'by', 'mark', 'move_id', v_move_id,
                         'opened_thread', v_move_thread <> p_thread_id)
    ) returning id into v_tid;
    v_tids := v_tids || v_tid;
    perform private.apply_quest_consequences(p_campaign_id, p_quest_id, v_tid, v_target, p_edge_id);
  else
    if not exists (
      select 1 from public.quest_beat_transitions t
       where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
         and t.thread_id = p_thread_id and t.to_beat_id = v_target
    ) then
      insert into public.quest_beat_transitions (
        campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
        transition_kind, created_by, from_quest_title, from_beat_title,
        to_quest_title, to_beat_title, thread_id, session_id, provenance
      ) values (
        p_campaign_id, case when v_prev is null then null else p_quest_id end, v_prev,
        p_quest_id, v_target,
        'assert', auth.uid(), case when v_prev is null then null else v_quest.title end,
        (select title from public.quest_beats where id = v_prev),
        v_quest.title, v_title, p_thread_id, p_session_id,
        jsonb_build_object('by', 'mark', 'move_id', v_move_id)
      ) returning id into v_tid;
      v_tids := v_tids || v_tid;
      perform private.apply_quest_consequences(p_campaign_id, p_quest_id, v_tid, v_target, null);
    end if;

    if p_kind = 'failed' then
      insert into public.quest_beat_transitions (
        campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
        transition_kind, created_by, from_quest_title, from_beat_title,
        to_quest_title, to_beat_title, thread_id, session_id, provenance, outcome
      ) values (
        p_campaign_id, p_quest_id, v_target, p_quest_id, v_target,
        'assert', auth.uid(), v_quest.title, v_title,
        v_quest.title, v_title, p_thread_id, p_session_id,
        jsonb_build_object('by', 'mark', 'move_id', v_move_id), 'failed'
      ) returning id into v_tid;
      v_tids := v_tids || v_tid;
      perform private.apply_quest_consequences(
        p_campaign_id, p_quest_id, v_tid, v_target, null,
        p_beat_outcome => 'failed'
      );
    end if;

    if p_kind = 'party_here' then v_place := true; end if;
  end if;

  if v_place then
    if v_state.quest_id is null then
      insert into public.quest_runtime_state (
        campaign_id, quest_id, thread_id, current_beat_id, status, updated_by,
        visit_stack, visit_index, return_stack, version
      ) values (
        p_campaign_id, p_quest_id, p_thread_id, v_target, 'running', auth.uid(),
        jsonb_build_array(jsonb_build_object('beat_id', v_target)), 0, '[]'::jsonb, 1
      );
    else
      update public.quest_runtime_state
         set current_beat_id = v_target,
             visit_stack = coalesce(visit_stack, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('beat_id', v_target)),
             visit_index = jsonb_array_length(coalesce(visit_stack, '[]'::jsonb)),
             version = version + 1,
             updated_by = auth.uid()
       where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = p_thread_id;
    end if;
  end if;

  if cardinality(v_loot) > 0 then
    perform public.dispatch_loot(v_loot);
  end if;

  if p_move_party_to is not null then
    update public.campaigns set current_location_id = p_move_party_to where id = p_campaign_id;
  end if;

  return jsonb_build_object(
    'transition_ids', to_jsonb(v_tids),
    'move_id', v_move_id,
    'thread_id', v_move_thread,
    'current_beat_id', (select s.current_beat_id from public.quest_runtime_state s
                         where s.quest_id = p_quest_id and s.campaign_id = p_campaign_id and s.thread_id = v_move_thread)
  );
end $function$;

revoke execute on function public.mark_quest_move(uuid, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid) from public, anon;
grant execute on function public.mark_quest_move(uuid, uuid, uuid, text, uuid, uuid, uuid, boolean, uuid[], uuid) to authenticated, service_role;

-- ── 4. undo_quest_move ──────────────────────────────────────────────────────
-- One Undo for the newest move on a thread. A marked move (`assert`) is taken
-- back by undoing its consequence events and deleting it; a played move runs
-- the existing `previous` verb at the thread's current version.
CREATE OR REPLACE FUNCTION public.undo_quest_move(p_campaign_id uuid, p_quest_id uuid, p_thread_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
-- Takes back the newest move: on p_thread_id when given, else the quest's
-- newest move on any thread (the toolbar's Undo). A marked move is every
-- transition sharing its `move_id` (the filled-in way there, a parallel
-- route's opened thread), taken back together; a played move is stepped
-- back exactly as the `previous` verb does.
declare
  v_thread public.quest_threads%rowtype;
  v_thread_id uuid;
  v_state public.quest_runtime_state%rowtype;
  v_last public.quest_beat_transitions%rowtype;
  v_row public.quest_beat_transitions%rowtype;
  v_move_id text;
  v_first_from uuid;
  v_opened uuid[] := '{}';
  v_new_cursor uuid;
  v_stack jsonb;
  v_closed uuid;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from public.quests where id = p_quest_id and campaign_id = p_campaign_id) then
    raise exception 'Quest not found in this campaign' using errcode = 'P0002';
  end if;
  if p_thread_id is not null then
    select * into v_thread from public.quest_threads
     where id = p_thread_id and quest_id = p_quest_id and campaign_id = p_campaign_id;
    if not found then
      raise exception 'That thread does not belong to this quest' using errcode = 'P0002';
    end if;
    if v_thread.status = 'merged' then
      raise exception 'This thread was merged into another thread' using errcode = '23514';
    end if;
  end if;

  select * into v_last from public.quest_beat_transitions t
   where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
     and t.thread_id is not null and t.to_beat_id is not null
     and (p_thread_id is null or t.thread_id = p_thread_id)
   order by t.seq desc
   limit 1;
  if not found then
    raise exception 'Nothing to undo' using errcode = 'P0002';
  end if;
  v_thread_id := v_last.thread_id;

  select * into v_thread from public.quest_threads where id = v_thread_id;
  if v_thread.status = 'merged' then
    raise exception 'This thread was merged into another thread' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text || ':' || p_quest_id::text || ':' || v_thread_id::text, 0));

  if v_last.transition_kind <> 'assert' then
    select * into v_state from public.quest_runtime_state
     where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = v_thread_id;
    if v_state.quest_id is null then
      raise exception 'Nothing to undo' using errcode = 'P0002';
    end if;
    -- A played move: exactly the `previous` verb, at the version just read.
    perform public.transition_quest_runtime(
      p_campaign_id, p_quest_id, v_thread_id, 'previous', v_state.version
    );
    return jsonb_build_object(
      'undone_transition_id', v_last.id,
      'current_beat_id', (select s.current_beat_id from public.quest_runtime_state s
                           where s.quest_id = p_quest_id and s.campaign_id = p_campaign_id and s.thread_id = v_thread_id)
    );
  end if;

  -- A marked move: every transition it wrote, newest first.
  v_move_id := v_last.provenance ->> 'move_id';
  for v_row in
    select * from public.quest_beat_transitions t
     where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
       and (t.id = v_last.id or (v_move_id is not null and t.provenance ->> 'move_id' = v_move_id))
     order by t.seq desc
  loop
    perform private.undo_quest_transition_consequences(v_row.id);
    delete from public.quest_beat_transitions where id = v_row.id;
    v_first_from := v_row.from_beat_id;
    if coalesce((v_row.provenance ->> 'opened_thread')::boolean, false) then
      v_opened := v_opened || v_row.thread_id;
    end if;
  end loop;

  -- A thread the move opened, with nothing else on it, closes again.
  foreach v_closed in array v_opened loop
    if not exists (select 1 from public.quest_beat_transitions t where t.thread_id = v_closed) then
      delete from public.quest_runtime_state where thread_id = v_closed;
      delete from public.quest_threads where id = v_closed;
      if v_closed = v_thread_id then
        return jsonb_build_object('undone_transition_id', v_last.id, 'current_beat_id', null, 'closed_thread_id', v_closed);
      end if;
    end if;
  end loop;

  select * into v_state from public.quest_runtime_state
   where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = v_thread_id
   for update;
  -- The cursor goes back only when it stands on a beat no remaining
  -- transition of this thread reaches: a failed mark leaves the party where
  -- it was, a party-here move does not.
  if v_state.quest_id is not null and v_state.current_beat_id is not null and not exists (
    select 1 from public.quest_beat_transitions t
     where t.thread_id = v_thread_id and t.to_beat_id = v_state.current_beat_id
  ) then
    select t.to_beat_id into v_new_cursor
      from public.quest_beat_transitions t
     where t.campaign_id = p_campaign_id and t.to_quest_id = p_quest_id
       and t.thread_id = v_thread_id and t.to_beat_id is not null
     order by t.seq desc
     limit 1;
    if v_new_cursor is null then v_new_cursor := v_first_from; end if;

    -- Drop visits no remaining transition reaches, keeping the stack consistent.
    v_stack := coalesce(v_state.visit_stack, '[]'::jsonb);
    while jsonb_array_length(v_stack) > 0 and not exists (
      select 1 from public.quest_beat_transitions t
       where t.thread_id = v_thread_id
         and t.to_beat_id = (v_stack -> (jsonb_array_length(v_stack) - 1) ->> 'beat_id')::uuid
    ) loop
      v_stack := v_stack - (jsonb_array_length(v_stack) - 1);
    end loop;
    if jsonb_array_length(v_stack) = 0 and v_new_cursor is not null then
      v_stack := jsonb_build_array(jsonb_build_object('beat_id', v_new_cursor));
    end if;

    update public.quest_runtime_state
       set current_beat_id = v_new_cursor,
           visit_stack = v_stack,
           visit_index = jsonb_array_length(v_stack) - 1,
           version = version + 1,
           updated_by = auth.uid()
     where quest_id = p_quest_id and campaign_id = p_campaign_id and thread_id = v_thread_id;
  end if;

  return jsonb_build_object(
    'undone_transition_id', v_last.id,
    'current_beat_id', (select s.current_beat_id from public.quest_runtime_state s
                         where s.quest_id = p_quest_id and s.campaign_id = p_campaign_id and s.thread_id = v_thread_id)
  );
end $function$;

revoke execute on function public.undo_quest_move(uuid, uuid, uuid) from public, anon;
grant execute on function public.undo_quest_move(uuid, uuid, uuid) to authenticated, service_role;

-- ── 5. assert_quest_runtime is replaced by mark_quest_move ─────────────────
drop function public.assert_quest_runtime(uuid, uuid, uuid, uuid[], boolean, text);

-- ── 6. The cockpit's jump picker is gone ────────────────────────────────────
-- The run cockpit is folded into the opened beat, and "Put the party here"
-- (mark_quest_move kind 'party_here') replaced its Jump panel, the only caller.
drop function public.search_quest_runtime_jump_targets(uuid, uuid, text, integer);
