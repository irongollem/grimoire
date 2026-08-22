-- Migration: per_quest_runtime_cursor
-- Re-keys the quest runtime cursor from one row per campaign to one row per quest.

-- `quest_runtime_state` was keyed on campaign_id alone, so a campaign had
-- exactly one live position across every quest. That models a party as standing
-- in one scene — but the cursor tracks *narrative position in a chain*, not
-- where the party is standing, and a party is routinely mid-progress on several
-- chains at once. Two ordinary shapes it could not represent:
--
--   * A main quest suspended on "find out who the killer is" while the party
--     asks around town, picks up a side quest, and walks that chain end to end.
--     The main quest has not advanced but is still *at* that beat.
--   * Two givers whose quests converge on the same cave — one for a relic, one
--     for the lair boss. Quests cannot join, so both chains are genuinely being
--     advanced at once, in the same scene. There is no jump and no return.
--
-- Three bugs fall out of the single cursor, and all three close here:
--
--   1. `previous` read visit_stack[visit_index - 1] and took whatever quest_id
--      sat there, with no check that it matched the quest in play. Stepping back
--      inside the side quest silently returned to the murder mystery.
--   2. `end` nulled the cursor, discarding the suspended quest's position along
--      with the finished one's. Next session it had to be re-found by hand.
--   3. The cockpit is mounted per-quest from its route but read the campaign
--      cursor, so opening Run on quest A while the cursor sat in quest B
--      rendered B's beat, branches, attachments and loot under A's URL.
--
-- This is a strict generalisation, not a trade-off. A dungeon crawl whose beats
-- are physical rooms is nearly always one quest — the N=1 case, one live cursor,
-- room to room along authored edges, behaviourally identical to before minus
-- bug 1. There is no mode toggle.
--
-- Back keeps undo-stack semantics, truncation included: it means "undo my last
-- navigation", not "replay the session". A DM who wants a beat the back path no
-- longer covers uses Jump, which records an explicit transition with a reason
-- instead of quietly rewriting where the cursor has been. Do NOT rebuild the
-- back path from quest_beat_transitions to "preserve" truncated entries — that
-- makes the path un-rewindable, since you could never step back out of a beat
-- you had stepped back into. The transition log remains the authoritative
-- record of everything the party actually did, so the truncation loses nothing.
--
-- Quest nesting stays a sort hint. A parent's cursor does not aggregate its
-- children's progress, and completing every child does not advance the parent.
-- Sub-quests get an ordinary row here like any other quest.

-- ── 1. Capture the positions buried in the campaign-wide stacks ──────────────

-- Computed before the key changes, because the old primary key forbids the
-- second row per campaign that the split produces.
--
-- Note this RECOVERS positions rather than merely preserving them: `end` nulled
-- the cursor but left visit_stack populated, so an ended session still carries
-- every quest the party had open, and each one lands here at its last beat.
create temporary table _per_quest_cursor as
with entries as (
  select
    s.campaign_id,
    s.current_quest_id,
    s.status as campaign_status,
    s.return_stack,
    s.updated_by,
    s.created_at,
    b.quest_id,
    b.id as beat_id,
    e.ordinal
  from public.quest_runtime_state s
  cross join lateral jsonb_array_elements(s.visit_stack) with ordinality e(value, ordinal)
  -- Beats deleted since the visit are dropped so the foreign key below holds.
  join public.quest_beats b
    on b.id = (e.value ->> 'beat_id')::uuid
   and b.quest_id = (e.value ->> 'quest_id')::uuid
   and b.campaign_id = s.campaign_id
  -- Entries past the cursor are rewound-forward positions. Redo does not
  -- survive the re-key; where each quest actually stands does.
  where e.ordinal <= s.visit_index + 1
)
select
  e.campaign_id,
  e.quest_id,
  (array_agg(e.beat_id order by e.ordinal desc))[1] as current_beat_id,
  jsonb_agg(jsonb_build_object('beat_id', e.beat_id) order by e.ordinal) as visit_stack,
  (count(*) - 1)::integer as visit_index,
  -- Only the quest the campaign was actually running stays running. Everything
  -- else was suspended, which is what `paused` now means per chain — and an
  -- ended session becomes every quest paused at its last beat, which is exactly
  -- the campaign end-session semantics this migration introduces.
  case
    when e.campaign_status = 'running' and e.quest_id = e.current_quest_id then 'running'
    else 'paused'
  end as status,
  -- Cross-quest return entries are dropped: each quest now remembers itself, so
  -- returning to another chain is navigation rather than a stack pop. Only
  -- within-quest jump targets still need a return point.
  (
    select coalesce(jsonb_agg(jsonb_build_object('beat_id', r.value ->> 'beat_id') order by r.ordinal), '[]'::jsonb)
    from jsonb_array_elements(e.return_stack) with ordinality r(value, ordinal)
    where (r.value ->> 'quest_id')::uuid = e.quest_id
  ) as return_stack,
  e.updated_by,
  e.created_at
from entries e
group by e.campaign_id, e.quest_id, e.campaign_status, e.current_quest_id,
         e.return_stack, e.updated_by, e.created_at;

-- ── 2. Re-key the table ──────────────────────────────────────────────────────

delete from public.quest_runtime_state;

alter table public.quest_runtime_state
  drop constraint quest_runtime_state_current_fkey,
  drop constraint quest_runtime_state_cursor_complete,
  drop constraint quest_runtime_state_visit_index_check,
  drop constraint quest_runtime_state_pkey,
  drop column current_quest_id;

alter table public.quest_runtime_state
  add column quest_id uuid not null;

alter table public.quest_runtime_state
  add constraint quest_runtime_state_pkey primary key (campaign_id, quest_id),
  -- Keyed through the composite so a quest can never hold a cursor in a
  -- campaign it does not belong to.
  add constraint quest_runtime_state_quest_fkey
    foreign key (quest_id, campaign_id)
    references public.quests(id, campaign_id) on delete cascade,
  -- The cursor beat may vanish (archive detaches, delete cascades) while the
  -- quest's row survives holding its stack, so only the beat is nulled.
  add constraint quest_runtime_state_current_fkey
    foreign key (current_beat_id, quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id)
    on delete set null (current_beat_id),
  add constraint quest_runtime_state_visit_index_check check (
    (jsonb_array_length(visit_stack) = 0 and visit_index = -1)
    or (visit_index >= 0 and visit_index < jsonb_array_length(visit_stack))
  );

-- A stack entry is now just a beat: the quest is the row's own key, so carrying
-- a quest_id inside every entry could only ever disagree with it.
comment on column public.quest_runtime_state.visit_stack is
  'Ordered beat_id objects for this quest only. Undo-stack semantics: navigating forward from a rewound position truncates.';
comment on column public.quest_runtime_state.quest_id is
  'The chain this cursor belongs to. One row per quest the party has open; quests do not interact.';

insert into public.quest_runtime_state (
  campaign_id, quest_id, current_beat_id, visit_stack, visit_index,
  status, return_stack, version, updated_by, created_at
)
select
  campaign_id, quest_id, current_beat_id, visit_stack, visit_index,
  status, return_stack, 0, updated_by, created_at
from _per_quest_cursor;

drop table _per_quest_cursor;

create index quest_runtime_state_live_idx
  on public.quest_runtime_state (campaign_id, status)
  where current_beat_id is not null;

-- ── 3. Reading one chain, and seeing which chains are open ───────────────────

-- Signatures are replaced rather than added to, per 20260810000013, so the
-- audited SECURITY DEFINER surface does not grow a second copy of each function.
drop function public.get_quest_runtime_context(uuid);

create function public.get_quest_runtime_context(p_campaign_id uuid, p_quest_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, private
as $$
declare
  v_state public.quest_runtime_state;
  v_previous jsonb;
  v_return jsonb;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id;

  if not found then
    return jsonb_build_object(
      'state', null,
      'current', null,
      'previous', null,
      'outgoing', '[]'::jsonb,
      'return_target', null,
      'path_so_far', '[]'::jsonb
    );
  end if;

  if v_state.visit_index > 0 then
    v_previous := v_state.visit_stack -> (v_state.visit_index - 1);
  end if;
  if jsonb_array_length(v_state.return_stack) > 0 then
    v_return := v_state.return_stack -> (jsonb_array_length(v_state.return_stack) - 1);
  end if;

  return jsonb_build_object(
    'state', to_jsonb(v_state),
    'current', (
      select to_jsonb(b) from public.quest_beats b
      where b.id = v_state.current_beat_id and b.quest_id = p_quest_id
    ),
    'previous', v_previous,
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'edge_id', e.id,
        'label', e.label,
        'quest_id', e.quest_id,
        'beat_id', b.id,
        'beat_title', b.title,
        'beat_kind', b.kind
      ) order by e.created_at)
      from public.quest_beat_edges e
      join public.quest_beats b on b.id = e.target_beat_id
      where e.source_beat_id = v_state.current_beat_id
    ), '[]'::jsonb),
    'return_target', v_return,
    -- The cockpit polls every five seconds. Keep the recent path bounded while
    -- the full audit remains in quest_beat_transitions. Historical rows can be
    -- cross-quest jumps, so match either end rather than only the destination.
    'path_so_far', coalesce((
      select jsonb_agg(recent.entry order by recent.created_at, recent.id)
      from (
        select t.id, t.created_at, jsonb_build_object(
          'id', t.id,
          'kind', t.transition_kind,
          'from_quest_id', t.from_quest_id,
          'from_beat_id', t.from_beat_id,
          'from_quest_title', t.from_quest_title,
          'from_beat_title', t.from_beat_title,
          'to_quest_id', t.to_quest_id,
          'to_beat_id', t.to_beat_id,
          'to_quest_title', t.to_quest_title,
          'to_beat_title', t.to_beat_title,
          'reason', t.reason,
          'runtime_version', t.runtime_version,
          'provenance', t.provenance,
          'created_at', t.created_at
        ) entry
        from public.quest_beat_transitions t
        where t.campaign_id = p_campaign_id
          and (t.to_quest_id = p_quest_id or t.from_quest_id = p_quest_id)
        order by t.created_at desc, t.id desc
        limit 100
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_quest_runtime_context(uuid, uuid) from public, anon;
grant execute on function public.get_quest_runtime_context(uuid, uuid) to authenticated, service_role;

-- What the cockpit's rail and the campaign dashboard both need: the set of
-- chains the party currently has open. This is the query that was impossible to
-- write before, because "live" was a single row rather than a set.
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
  updated_at timestamptz
)
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  -- quests.status is quest_status_enum; the projection hands out text so the
  -- client shares one type with every other quest surface.
  select q.id, q.title, q.status::text, b.id, b.title, b.kind, s.status, s.version, s.updated_at
  from public.quest_runtime_state s
  join public.quests q on q.id = s.quest_id and q.campaign_id = s.campaign_id
  join public.quest_beats b on b.id = s.current_beat_id and b.quest_id = s.quest_id
  where s.campaign_id = p_campaign_id
    and s.status in ('running', 'paused')
  order by (s.status = 'running') desc, s.updated_at desc;
end;
$$;

revoke execute on function public.get_campaign_live_quests(uuid) from public, anon;
grant execute on function public.get_campaign_live_quests(uuid) to authenticated, service_role;

comment on function public.get_campaign_live_quests(uuid) is
  'Every chain the party currently has open, running first. One row per quest holding a cursor.';

-- ── 4. Movement, now scoped to a single chain ────────────────────────────────

drop function public.transition_quest_runtime(uuid, text, bigint, uuid, uuid, uuid, text, boolean, jsonb);

create function public.transition_quest_runtime(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_command text,
  p_expected_version bigint,
  p_target_beat_id uuid default null,
  p_edge_id uuid default null,
  p_reason text default null,
  p_push_return boolean default false,
  p_provenance jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql security definer
set search_path = public, private
as $$
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
            when 'complete' then 'complete'
            when 'fail' then 'failed'
            else status
          end,
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
$$;

revoke execute on function public.transition_quest_runtime(uuid, uuid, text, bigint, uuid, uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.transition_quest_runtime(uuid, uuid, text, bigint, uuid, uuid, text, boolean, jsonb) to authenticated, service_role;

comment on function public.transition_quest_runtime(uuid, uuid, text, bigint, uuid, uuid, text, boolean, jsonb) is
  'Atomically applies a version-checked DM runtime command to one quest''s cursor, appends its immutable history row, and applies or reverses the objective effects authored on the beat or branch involved.';

-- Closing the table for the night: every running chain pauses where it stands.
-- The old campaign-wide `end` nulled the cursor, which is what discarded the
-- suspended quest's position along with the finished one's.
create function public.end_campaign_quest_session(p_campaign_id uuid)
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

  with paused as (
    update public.quest_runtime_state
    set status = 'paused', version = version + 1, updated_by = auth.uid()
    where campaign_id = p_campaign_id and status = 'running'
    -- RETURNING hands back the post-update version. Re-reading the table in a
    -- sibling CTE would see the statement-start snapshot and record the version
    -- each row had *before* the pause, which is the one number every other
    -- command in this file gets right.
    returning quest_id, current_beat_id, version
  ),
  logged as (
    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
      transition_kind, reason, runtime_version, provenance,
      from_quest_title, from_beat_title, to_quest_title, to_beat_title
    )
    select
      p_campaign_id, p.quest_id, p.current_beat_id, p.quest_id, p.current_beat_id,
      'pause', 'Session ended', p.version, jsonb_build_object('surface', 'campaign-session-end'),
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
  'Pauses every running chain in the campaign at its current beat. Positions are preserved, never cleared.';

-- ── 5. Improvisation and the jump picker follow the chain ────────────────────

drop function public.improvise_quest_runtime(uuid, bigint, text, text, text, text, text, boolean, boolean, text);

create function public.improvise_quest_runtime(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_expected_version bigint,
  p_title text,
  p_kind text default 'neutral',
  p_dm_lead text default null,
  p_reveal_text text default null,
  p_reason text default null,
  p_push_return boolean default true,
  p_keep_edge boolean default false,
  p_edge_label text default 'Improvised'
)
returns jsonb
language plpgsql security definer
set search_path = public, private
as $$
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
  if nullif(btrim(p_reason), '') is null then raise exception 'An improv reason is required'; end if;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id and quest_id = p_quest_id;
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
      quest_id, campaign_id, source_beat_id, target_beat_id, label
    ) values (
      v_source.quest_id, p_campaign_id, v_source.id, v_created.id,
      coalesce(nullif(btrim(p_edge_label), ''), 'Improvised')
    );
  end if;

  v_context := public.transition_quest_runtime(
    p_campaign_id => p_campaign_id,
    p_quest_id => p_quest_id,
    p_command => 'improv',
    p_expected_version => p_expected_version,
    p_target_beat_id => v_created.id,
    p_reason => p_reason,
    p_push_return => p_push_return,
    p_provenance => jsonb_build_object('surface', 'quest-run-improv', 'kept_edge', p_keep_edge)
  );

  return jsonb_build_object('context', v_context, 'beat', to_jsonb(v_created));
end;
$$;

revoke execute on function public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean, text) to authenticated, service_role;

comment on function public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean, text) is
  'Atomically creates a hidden improvised beat in one quest, optionally keeps an authored edge, and enters it in runtime history.';

-- Jump moves *this* chain's cursor, so its picker offers only this chain's
-- beats. Reaching another quest is navigation to that quest's own Run surface,
-- which needs no runtime write and no reason — see get_campaign_live_quests.
drop function public.search_quest_runtime_jump_targets(uuid, text, integer);

create function public.search_quest_runtime_jump_targets(
  p_campaign_id uuid,
  p_quest_id uuid,
  p_search text default '',
  p_limit integer default 30
)
returns table (
  quest_id uuid,
  beat_id uuid,
  quest_title text,
  beat_title text,
  beat_kind text,
  is_improvised boolean
)
language plpgsql stable security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select q.id, b.id, q.title, b.title, b.kind, b.is_improvised
  from public.quest_beats b
  join public.quests q on q.id = b.quest_id
  where b.campaign_id = p_campaign_id
    and b.quest_id = p_quest_id
    and b.kind <> 'archived'
    -- The overview sits outside the edge graph, so parking the cursor there
    -- would strand the cockpit with no outgoing branches.
    and not b.is_overview
    and (
      nullif(btrim(p_search), '') is null
      or b.title ilike '%' || p_search || '%'
    )
  order by b.title, b.created_at
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke execute on function public.search_quest_runtime_jump_targets(uuid, uuid, text, integer) from public, anon;
grant execute on function public.search_quest_runtime_jump_targets(uuid, uuid, text, integer) to authenticated, service_role;

-- ── 6. Archiving the beat a chain is standing on ─────────────────────────────

drop function public.archive_quest_beat(uuid, bigint, uuid, boolean);

create function public.archive_quest_beat(
  p_beat_id uuid,
  p_expected_runtime_version bigint default null,
  p_replacement_beat_id uuid default null,
  p_end_runtime boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_beat public.quest_beats;
  v_replacement public.quest_beats;
  v_state public.quest_runtime_state;
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

  -- Only this beat's own chain can be standing on it, so the guard no longer
  -- consults — or blocks on — a campaign-wide row.
  select * into v_state
  from public.quest_runtime_state
  where campaign_id = v_beat.campaign_id and quest_id = v_beat.quest_id
  for update;

  if p_expected_runtime_version is not null
     and (not found or v_state.version <> p_expected_runtime_version) then
    raise exception 'Quest runtime changed; reload before removing this beat' using errcode = '40001';
  end if;

  if v_state.current_beat_id = p_beat_id then
    if p_expected_runtime_version is null then
      raise exception 'Current beat removal requires its runtime version' using errcode = '22023';
    end if;
    if p_end_runtime and p_replacement_beat_id is not null then
      raise exception 'Choose either a replacement beat or end the runtime' using errcode = '22023';
    elsif p_end_runtime then
      perform public.transition_quest_runtime(
        p_campaign_id => v_beat.campaign_id,
        p_quest_id => v_beat.quest_id,
        p_command => 'end',
        p_expected_version => p_expected_runtime_version
      );
    elsif p_replacement_beat_id is not null then
      -- The replacement moves this chain's cursor, so it has to be in this
      -- chain. A cross-quest replacement was reachable before and would now
      -- mean silently advancing a quest the DM was not looking at.
      select * into v_replacement
      from public.quest_beats
      where id = p_replacement_beat_id
        and campaign_id = v_beat.campaign_id
        and quest_id = v_beat.quest_id
        and kind <> 'archived';
      if not found or v_replacement.id = p_beat_id then
        raise exception 'Replacement beat not found or not usable' using errcode = '22023';
      end if;
      perform public.transition_quest_runtime(
        p_campaign_id => v_beat.campaign_id,
        p_quest_id => v_beat.quest_id,
        p_command => 'jump',
        p_expected_version => p_expected_runtime_version,
        p_target_beat_id => v_replacement.id,
        p_reason => 'Current beat removed from authored flow'
      );
    else
      raise exception 'Choose a replacement beat or end the runtime' using errcode = '22023';
    end if;
  elsif p_replacement_beat_id is not null or p_end_runtime then
    raise exception 'The beat is no longer current; reload before removing it' using errcode = '40001';
  end if;

  delete from public.quest_beat_attachments where beat_id = p_beat_id;
  delete from public.quest_beat_edges where source_beat_id = p_beat_id or target_beat_id = p_beat_id;
  update public.quest_beats set kind = 'archived', visibility = 'hidden' where id = p_beat_id;
end;
$$;

revoke all on function public.archive_quest_beat(uuid, bigint, uuid, boolean) from public;
revoke execute on function public.archive_quest_beat(uuid, bigint, uuid, boolean) from anon;
grant execute on function public.archive_quest_beat(uuid, bigint, uuid, boolean) to authenticated;
