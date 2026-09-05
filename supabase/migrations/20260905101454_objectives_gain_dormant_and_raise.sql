-- Objectives gain a fourth state and a fourth verb. Story #792, epic #780.
--
-- An objective's life reads unknown -> known -> achieved-or-failed, which is
-- fine for the path actually taken and breaks on the branch never reached.
--
-- A beat that would raise "Carry the news home" is never played, because the
-- party went the other way. Nothing raises the objective and nothing resolves
-- it either. If unraised objectives sit `pending` forever then #794's premise —
-- quest complete is the whole ledger settling — can never fire on any quest
-- with a branch in it, which is every quest worth modelling. If they are simply
-- absent, the DM loses the record that the branch existed at all.
--
-- So: `dormant`, stored rather than derived. A derived "not reachable from
-- here" would re-walk the graph on every read, change its answer as the graph
-- is edited, and could not be asserted by prep (#796). A stored status is a
-- fact the ledger carries.
--
--   dormant -> pending (raised) -> achieved | failed
--
-- and `dormant` is reachable again from `pending` when a branch closes an
-- objective off without resolving it.
--
-- Three constraints come with it:
--
--  1. A dormant objective is by definition one the players have not been given,
--     so it may not be player-visible. Letting it be would leak the untaken
--     branch, which is the whole point of the state.
--  2. `is_player_visible` defaults to false. The old default was the wrong way
--     round for a ledger whose entries mostly start life unknown to the party,
--     and the check above turns that from a surprise into an error.
--  3. Quest completion asks whether every NON-dormant objective has settled.
--     Ignoring dormant entries is what makes a branching quest completable.
--     That lives in #794; this migration only makes the state available.
--
-- No backfill. Existing rows are `pending`/`complete`/`failed`, all of which
-- still satisfy the new check, and changing a column default does not touch
-- them. 42 objectives exist, 24 player-visible, none dormant.

alter table public.quest_objectives
  drop constraint if exists quest_objectives_status_check;

alter table public.quest_objectives
  add constraint quest_objectives_status_check
  check (status in ('dormant', 'pending', 'complete', 'failed'));

alter table public.quest_objectives
  alter column is_player_visible set default false;

alter table public.quest_objectives
  add constraint quest_objectives_dormant_is_hidden
  check (status <> 'dormant' or not is_player_visible);

comment on constraint quest_objectives_dormant_is_hidden on public.quest_objectives is
  'A dormant objective belongs to a branch the party has not been sent down. '
  'Showing it would leak the untaken branch, which is what the state exists to '
  'prevent (#792).';

-- ── The fourth verb ─────────────────────────────────────────────────────────
--
-- `raise` is what moves an objective out of `dormant`. It is deliberately not
-- `reveal`: raising makes the objective live for the DM, revealing tells the
-- party. An objective is routinely one without the other.

alter table public.quest_objective_effects
  drop constraint if exists quest_objective_effects_effect_check;

alter table public.quest_objective_effects
  add constraint quest_objective_effects_effect_check
  check (effect in ('raise', 'reveal', 'complete', 'fail'));

-- ── The runtime learns the verb ─────────────────────────────────────────────
--
-- Rebuilt from the LIVE definition (`pg_get_functiondef`), not from any of the
-- migrations that wrote it — this function has been replaced several times and
-- copying the wrong one silently reverts whatever the others fixed. The only
-- change is the effect arm inside the apply loop; everything else is byte for
-- byte what is running.
--
-- The undo path needs nothing: `quest_objective_effect_events` already records
-- `previous_status` and `previous_is_player_visible` per event, so rewinding a
-- transition restores a raised objective to `dormant` for free.

CREATE OR REPLACE FUNCTION public.transition_quest_runtime(p_campaign_id uuid, p_quest_id uuid, p_command text, p_expected_version bigint, p_target_beat_id uuid DEFAULT NULL::uuid, p_edge_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_push_return boolean DEFAULT false, p_provenance jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_state public.quest_runtime_state;
  v_from_beat_id uuid;
  v_to_beat_id uuid;
  v_kind text;
  v_status text;
  v_visit_stack jsonb;
  v_visit_index integer;
  v_return_stack jsonb;
  v_return_target jsonb;
  v_edge_label text;
  v_quest_title text;
  v_from_beat_title text;
  v_to_beat_title text;
  v_provenance jsonb := coalesce(p_provenance, '{}'::jsonb);
  v_transition_id uuid;
  v_undo_transition_id uuid;
  v_effect record;
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

  select q.title into v_quest_title
  from public.quests q
  where q.id = p_quest_id and q.campaign_id = p_campaign_id;
  if not found then
    raise exception 'That quest is not in this campaign';
  end if;

  -- Two co-DMs running two different chains no longer contend: the lock and the
  -- version are both per quest.
  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text || ':' || p_quest_id::text, 0));
  insert into public.quest_runtime_state (campaign_id, quest_id)
  values (p_campaign_id, p_quest_id)
  on conflict (campaign_id, quest_id) do nothing;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id
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
    select e.target_beat_id, e.label
      into v_to_beat_id, v_edge_label
    from public.quest_beat_edges e
    where e.id = p_edge_id
      and e.campaign_id = p_campaign_id
      and e.quest_id = p_quest_id
      and e.source_beat_id = v_from_beat_id;
    if not found then raise exception 'That edge is not an outgoing choice'; end if;
    v_kind := 'forward';
    v_provenance := v_provenance || jsonb_build_object('edge_id', p_edge_id, 'edge_label', v_edge_label);
  elsif p_command = 'previous' then
    -- Undo, not replay. The stack holds only this quest's beats now, so Back can
    -- no longer walk out of the chain the DM is running.
    if v_state.status not in ('running', 'paused') or v_visit_index <= 0 then
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
    -- Ending one chain leaves every other chain exactly where it stands. The
    -- campaign-wide equivalent is end_campaign_quest_session below, which
    -- pauses rather than clears so nothing is discarded.
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
  where campaign_id = p_campaign_id and quest_id = p_quest_id and version = p_expected_version;

  if not found then
    raise exception 'Quest runtime changed while applying command' using errcode = '40001';
  end if;

  insert into public.quest_beat_transitions (
    campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
    transition_kind, reason, runtime_version, provenance,
    from_quest_title, from_beat_title, to_quest_title, to_beat_title
  ) values (
    p_campaign_id,
    case when v_from_beat_id is null then null else p_quest_id end, v_from_beat_id,
    case when v_to_beat_id is null then null else p_quest_id end, v_to_beat_id,
    v_kind, nullif(btrim(p_reason), ''), p_expected_version + 1, v_provenance,
    case when v_from_beat_id is null then null else v_quest_title end, v_from_beat_title,
    case when v_to_beat_id is null then null else v_quest_title end, v_to_beat_title
  )
  returning id into v_transition_id;

  if v_kind = 'previous' then
    -- Undo the newest not-yet-undone arrival at the beat being left. Stepping
    -- back twice therefore unwinds two arrivals, in order.
    select t.id into v_undo_transition_id
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id
      and t.to_quest_id = p_quest_id
      and t.to_beat_id = v_from_beat_id
      and t.id <> v_transition_id
      and exists (select 1 from public.quest_objective_effect_events ev where ev.transition_id = t.id)
    order by t.created_at desc, t.id desc
    limit 1;

    if v_undo_transition_id is not null then
      -- `distinct on` takes the *first* event per objective: when one arrival
      -- fired two effects at the same objective, the state to restore is what
      -- stood before either of them, not what stood between them.
      update public.quest_objectives o
      set status = first_event.previous_status,
          is_player_visible = first_event.previous_is_player_visible
      from (
        select distinct on (ev.objective_id)
          ev.objective_id, ev.previous_status, ev.previous_is_player_visible
        from public.quest_objective_effect_events ev
        where ev.transition_id = v_undo_transition_id
        order by ev.objective_id, ev.created_at, ev.id
      ) first_event
      where o.id = first_event.objective_id;

      delete from public.quest_objective_effect_events where transition_id = v_undo_transition_id;
    end if;
  elsif p_command in ('start', 'advance', 'jump', 'return', 'improv') then
    for v_effect in
      select e.id as effect_id, e.objective_id, e.effect,
             o.status as previous_status, o.is_player_visible as previous_is_player_visible
      from public.quest_objective_effects e
      join public.quest_objectives o on o.id = e.objective_id
      join public.quests q on q.id = e.quest_id and q.campaign_id = p_campaign_id
      where e.trigger_beat_id = v_to_beat_id
         -- An edge rule fires only for the command that actually walks an edge.
         or (p_command = 'advance' and e.trigger_edge_id = p_edge_id)
      order by e.created_at, e.id
    loop
      update public.quest_objectives
      set status = case v_effect.effect
            -- `raise` wakes a dormant objective and does nothing to one already
            -- settled: a beat that raises "Carry the news home" must not undo an
            -- earlier failure of it if the party loops back through.
            when 'raise' then case when status = 'dormant' then 'pending' else status end
            when 'complete' then 'complete'
            when 'fail' then 'failed'
            else status
          end,
          -- `raise` deliberately does NOT reveal. An objective can be live for
          -- the DM while the party has not been told — that separation is the
          -- whole reason the two verbs are not one.
          is_player_visible = case when v_effect.effect = 'reveal' then true else is_player_visible end
      where id = v_effect.objective_id;

      insert into public.quest_objective_effect_events (
        campaign_id, transition_id, effect_id, objective_id, effect,
        previous_status, previous_is_player_visible
      ) values (
        p_campaign_id, v_transition_id, v_effect.effect_id, v_effect.objective_id, v_effect.effect,
        v_effect.previous_status, v_effect.previous_is_player_visible
      );
    end loop;
  end if;

  return public.get_quest_runtime_context(p_campaign_id, p_quest_id);
end;
$function$;
