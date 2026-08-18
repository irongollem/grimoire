-- Objectives were a flat checklist hanging off the quest, disconnected from the
-- story flow that actually decides them. Running a session meant walking the
-- beats and then separately remembering which boxes that walk had ticked.
--
-- Two changes make the flow drive the checklist:
--
-- 1. An objective can fail. `is_done boolean` could not say so — a quest whose
--    lanes include "failed" had objectives that could only be done or not-yet,
--    so the one outcome a branching story exists to produce was unrepresentable.
--
-- 2. `quest_objective_effects` attaches an outcome to a *place in the flow*:
--    entering a beat, or taking a specific branch out of one. The branch matters
--    more than the beat — a quest fails because the party took the road, not
--    because they arrived somewhere — which is why an edge is a first-class
--    trigger and not a property of its target.
--
-- Note the direction: `quest_triggers` already fires *from* an objective being
-- done *to* a calendar event or broadcast. This is the opposite arrow, and the
-- two compose — reaching a beat completes an objective, which fires its trigger.

-- ── 1. Objectives gain a real outcome ────────────────────────────────────────

alter table public.quest_objectives
  add column status text not null default 'pending'
    check (status in ('pending', 'complete', 'failed'));

update public.quest_objectives
set status = case when is_done then 'complete' else 'pending' end;

alter table public.quest_objectives drop column is_done;

-- ── 2. Authored effects ──────────────────────────────────────────────────────

create table public.quest_objective_effects (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete cascade,
  objective_id uuid not null references public.quest_objectives(id) on delete cascade,
  -- Exactly one trigger. A beat effect fires on arrival; an edge effect fires
  -- only when that specific branch is taken.
  trigger_beat_id uuid references public.quest_beats(id) on delete cascade,
  trigger_edge_id uuid references public.quest_beat_edges(id) on delete cascade,
  effect text not null check (effect in ('reveal', 'complete', 'fail')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quest_objective_effects_one_trigger
    check (num_nonnulls(trigger_beat_id, trigger_edge_id) = 1)
);

create index quest_objective_effects_beat_idx on public.quest_objective_effects (trigger_beat_id);
create index quest_objective_effects_edge_idx on public.quest_objective_effects (trigger_edge_id);
create index quest_objective_effects_quest_idx on public.quest_objective_effects (quest_id);
-- Partial rather than one unique constraint over both columns, because NULL is
-- distinct in a plain unique index and the same rule could be authored twice.
create unique index quest_objective_effects_beat_uniq
  on public.quest_objective_effects (objective_id, trigger_beat_id, effect)
  where trigger_beat_id is not null;
create unique index quest_objective_effects_edge_uniq
  on public.quest_objective_effects (objective_id, trigger_edge_id, effect)
  where trigger_edge_id is not null;

create trigger quest_objective_effects_updated_at
  before update on public.quest_objective_effects
  for each row execute procedure update_updated_at();

alter table public.quest_objective_effects enable row level security;

-- Scoped through the owning quest, exactly as quest_objectives is: these rules
-- are DM authoring and have no player-visible projection of any kind.
create policy "quest_objective_effects_select" on public.quest_objective_effects
  for select using (exists (
    select 1 from public.quests q where q.id = quest_objective_effects.quest_id and (select auth.uid()) = q.user_id
  ));
create policy "quest_objective_effects_insert" on public.quest_objective_effects
  for insert with check (exists (
    select 1 from public.quests q where q.id = quest_objective_effects.quest_id and (select auth.uid()) = q.user_id
  ));
create policy "quest_objective_effects_update" on public.quest_objective_effects
  for update using (exists (
    select 1 from public.quests q where q.id = quest_objective_effects.quest_id and (select auth.uid()) = q.user_id
  ));
create policy "quest_objective_effects_delete" on public.quest_objective_effects
  for delete using (exists (
    select 1 from public.quests q where q.id = quest_objective_effects.quest_id and (select auth.uid()) = q.user_id
  ));

-- ── 3. What an effect actually did, so stepping back can undo it ─────────────

-- The runtime lets a DM step back through the visit stack, which at a table is
-- almost always a correction. An objective silently left completed by a beat
-- the party is no longer standing in would be a lie the DM cannot see, so each
-- application records what it overwrote and `previous` puts it back.
create table public.quest_objective_effect_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  transition_id uuid not null references public.quest_beat_transitions(id) on delete cascade,
  -- The rule may be deleted later; what it did to the objective still happened.
  effect_id uuid references public.quest_objective_effects(id) on delete set null,
  objective_id uuid not null references public.quest_objectives(id) on delete cascade,
  effect text not null,
  previous_status text not null,
  previous_is_player_visible boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quest_objective_effect_events_transition_idx on public.quest_objective_effect_events (transition_id);
create index quest_objective_effect_events_campaign_idx on public.quest_objective_effect_events (campaign_id, created_at desc);

create trigger quest_objective_effect_events_updated_at
  before update on public.quest_objective_effect_events
  for each row execute procedure update_updated_at();

alter table public.quest_objective_effect_events enable row level security;

-- Read-only to clients: this is runtime history, written solely by the
-- transition RPC, in the same spirit as quest_beat_transitions.
create policy "quest_objective_effect_events_select" on public.quest_objective_effect_events
  for select using (coalesce(private.is_campaign_member(campaign_id), false));

revoke insert, update, delete on public.quest_objective_effect_events from authenticated;

-- ── 4. The runtime applies and reverses them ─────────────────────────────────

create or replace function public.transition_quest_runtime(
  p_campaign_id uuid,
  p_command text,
  p_expected_version bigint,
  p_target_quest_id uuid default null,
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
  v_from_quest_id uuid;
  v_from_beat_id uuid;
  v_to_quest_id uuid;
  v_to_beat_id uuid;
  v_kind text;
  v_status text;
  v_visit_stack jsonb;
  v_visit_index integer;
  v_return_stack jsonb;
  v_return_target jsonb;
  v_edge_label text;
  v_from_quest_title text;
  v_from_beat_title text;
  v_to_quest_title text;
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

  perform pg_advisory_xact_lock(hashtextextended(p_campaign_id::text, 0));
  insert into public.quest_runtime_state (campaign_id)
  values (p_campaign_id)
  on conflict (campaign_id) do nothing;

  select * into v_state
  from public.quest_runtime_state
  where campaign_id = p_campaign_id
  for update;

  if v_state.version <> p_expected_version then
    raise exception 'Quest runtime changed; expected version %, current version %', p_expected_version, v_state.version
      using errcode = '40001';
  end if;

  v_from_quest_id := v_state.current_quest_id;
  v_from_beat_id := v_state.current_beat_id;
  v_to_quest_id := v_from_quest_id;
  v_to_beat_id := v_from_beat_id;
  v_status := v_state.status;
  v_visit_stack := v_state.visit_stack;
  v_visit_index := v_state.visit_index;
  v_return_stack := v_state.return_stack;

  if p_command = 'start' then
    if p_target_quest_id is null or p_target_beat_id is null then
      raise exception 'Start requires a target beat';
    end if;
    v_to_quest_id := p_target_quest_id;
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
    select e.quest_id, e.target_beat_id, e.label
      into v_to_quest_id, v_to_beat_id, v_edge_label
    from public.quest_beat_edges e
    where e.id = p_edge_id
      and e.campaign_id = p_campaign_id
      and e.source_beat_id = v_from_beat_id;
    if not found then raise exception 'That edge is not an outgoing choice'; end if;
    v_kind := 'forward';
    v_provenance := v_provenance || jsonb_build_object('edge_id', p_edge_id, 'edge_label', v_edge_label);
  elsif p_command = 'previous' then
    if v_state.status not in ('running', 'paused') or v_visit_index <= 0 then
      raise exception 'There is no previous visited beat';
    end if;
    v_visit_index := v_visit_index - 1;
    v_to_quest_id := (v_visit_stack -> v_visit_index ->> 'quest_id')::uuid;
    v_to_beat_id := (v_visit_stack -> v_visit_index ->> 'beat_id')::uuid;
    v_kind := 'previous';
    v_status := 'running';
  elsif p_command in ('jump', 'improv') then
    if v_from_beat_id is null or p_target_quest_id is null or p_target_beat_id is null then
      raise exception '% requires a current and target beat', initcap(p_command);
    end if;
    if nullif(btrim(p_reason), '') is null then
      raise exception '% requires a reason', initcap(p_command);
    end if;
    v_to_quest_id := p_target_quest_id;
    v_to_beat_id := p_target_beat_id;
    v_kind := p_command;
    v_status := 'running';
    if p_push_return then
      v_return_stack := v_return_stack || jsonb_build_array(jsonb_build_object(
        'quest_id', v_from_quest_id, 'beat_id', v_from_beat_id
      ));
    end if;
  elsif p_command = 'return' then
    if jsonb_array_length(v_return_stack) = 0 then
      raise exception 'There is no saved return point';
    end if;
    v_return_target := v_return_stack -> (jsonb_array_length(v_return_stack) - 1);
    v_return_stack := v_return_stack - (jsonb_array_length(v_return_stack) - 1);
    v_to_quest_id := (v_return_target ->> 'quest_id')::uuid;
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
    v_to_quest_id := null;
    v_to_beat_id := null;
  end if;

  if v_to_beat_id is not null and not exists (
    select 1 from public.quest_beats b
    where b.id = v_to_beat_id
      and b.quest_id = v_to_quest_id
      and b.campaign_id = p_campaign_id
      and b.kind <> 'archived'
      and (p_command <> 'improv' or b.is_improvised)
  ) then
    raise exception 'Target beat is not eligible in this campaign';
  end if;

  if p_command in ('start', 'advance', 'jump', 'return', 'improv') then
    select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb)
      into v_visit_stack
    from jsonb_array_elements(v_visit_stack) with ordinality entries(value, ordinal)
    where ordinal <= v_visit_index + 1;
    v_visit_stack := v_visit_stack || jsonb_build_array(jsonb_build_object(
      'quest_id', v_to_quest_id, 'beat_id', v_to_beat_id
    ));
    v_visit_index := v_visit_index + 1;
  end if;

  select q.title, b.title into v_from_quest_title, v_from_beat_title
  from public.quest_beats b join public.quests q on q.id = b.quest_id
  where b.id = v_from_beat_id and b.quest_id = v_from_quest_id;
  select q.title, b.title into v_to_quest_title, v_to_beat_title
  from public.quest_beats b join public.quests q on q.id = b.quest_id
  where b.id = v_to_beat_id and b.quest_id = v_to_quest_id;

  update public.quest_runtime_state
  set current_quest_id = v_to_quest_id,
      current_beat_id = v_to_beat_id,
      return_stack = v_return_stack,
      visit_stack = v_visit_stack,
      visit_index = v_visit_index,
      status = v_status,
      version = version + 1,
      updated_by = auth.uid()
  where campaign_id = p_campaign_id and version = p_expected_version;

  if not found then
    raise exception 'Quest runtime changed while applying command' using errcode = '40001';
  end if;

  insert into public.quest_beat_transitions (
    campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
    transition_kind, reason, runtime_version, provenance,
    from_quest_title, from_beat_title, to_quest_title, to_beat_title
  ) values (
    p_campaign_id, v_from_quest_id, v_from_beat_id, v_to_quest_id, v_to_beat_id,
    v_kind, nullif(btrim(p_reason), ''), p_expected_version + 1, v_provenance,
    v_from_quest_title, v_from_beat_title, v_to_quest_title, v_to_beat_title
  )
  returning id into v_transition_id;

  if v_kind = 'previous' then
    -- Undo the newest not-yet-undone arrival at the beat being left. Stepping
    -- back twice therefore unwinds two arrivals, in order.
    select t.id into v_undo_transition_id
    from public.quest_beat_transitions t
    where t.campaign_id = p_campaign_id
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

  return public.get_quest_runtime_context(p_campaign_id);
end;
$$;

revoke execute on function public.transition_quest_runtime(uuid, text, bigint, uuid, uuid, uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.transition_quest_runtime(uuid, text, bigint, uuid, uuid, uuid, text, boolean, jsonb) to authenticated, service_role;

comment on function public.transition_quest_runtime(uuid, text, bigint, uuid, uuid, uuid, text, boolean, jsonb) is
  'Atomically applies a version-checked DM runtime command, appends its immutable history row, and applies or reverses the objective effects authored on the beat or branch involved.';
