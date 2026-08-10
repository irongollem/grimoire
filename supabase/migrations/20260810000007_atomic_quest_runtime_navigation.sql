-- Runtime movement is a command, not two client writes. The row lock and
-- expected version make co-DM races visible, while snapshots keep history
-- readable after authored beats and edges change.

alter table public.quest_runtime_state
  add column status text not null default 'idle'
    check (status in ('idle', 'running', 'paused', 'ended')),
  add column version bigint not null default 0 check (version >= 0),
  add column visit_stack jsonb not null default '[]'::jsonb
    check (jsonb_typeof(visit_stack) = 'array'),
  add column visit_index integer not null default -1;

update public.quest_runtime_state
set status = case when current_beat_id is null then 'idle' else 'running' end,
    visit_stack = case
      when current_beat_id is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object(
        'quest_id', current_quest_id,
        'beat_id', current_beat_id
      ))
    end,
    visit_index = case when current_beat_id is null then -1 else 0 end;

alter table public.quest_runtime_state
  add constraint quest_runtime_state_visit_index_check check (
    (jsonb_array_length(visit_stack) = 0 and visit_index = -1)
    or (visit_index >= 0 and visit_index < jsonb_array_length(visit_stack))
  );

alter table public.quest_beat_transitions
  drop constraint quest_beat_transitions_transition_kind_check,
  drop constraint quest_beat_transitions_to_fkey,
  alter column to_quest_id drop not null,
  alter column to_beat_id drop not null,
  add column reason text,
  add column runtime_version bigint not null default 0,
  add column from_quest_title text,
  add column from_beat_title text,
  add column to_quest_title text,
  add column to_beat_title text,
  add constraint quest_beat_transitions_transition_kind_check check (
    transition_kind in ('enter', 'forward', 'previous', 'jump', 'return', 'improv', 'pause', 'resume', 'end')
  ),
  add constraint quest_beat_transitions_to_complete check (
    (to_quest_id is null and to_beat_id is null)
    or (to_quest_id is not null and to_beat_id is not null)
  ),
  add constraint quest_beat_transitions_to_fkey
    foreign key (to_beat_id, to_quest_id, campaign_id)
    references public.quest_beats(id, quest_id, campaign_id)
    on delete set null (to_beat_id, to_quest_id);

update public.quest_beat_transitions t
set from_quest_title = (select q.title from public.quests q where q.id = t.from_quest_id),
    from_beat_title = (select b.title from public.quest_beats b where b.id = t.from_beat_id),
    to_quest_title = (select q.title from public.quests q where q.id = t.to_quest_id),
    to_beat_title = (select b.title from public.quest_beats b where b.id = t.to_beat_id);

revoke insert, update, delete on public.quest_runtime_state from authenticated;
revoke insert on public.quest_beat_transitions from authenticated;

create or replace function public.get_quest_runtime_context(p_campaign_id uuid)
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
  where campaign_id = p_campaign_id;

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
      where b.id = v_state.current_beat_id and b.quest_id = v_state.current_quest_id
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
    'path_so_far', coalesce((
      select jsonb_agg(jsonb_build_object(
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
      ) order by t.created_at, t.id)
      from public.quest_beat_transitions t
      where t.campaign_id = p_campaign_id
    ), '[]'::jsonb)
  );
end;
$$;

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
  );

  return public.get_quest_runtime_context(p_campaign_id);
end;
$$;

create or replace function public.search_quest_runtime_jump_targets(
  p_campaign_id uuid,
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
    and b.kind <> 'archived'
    and (
      nullif(btrim(p_search), '') is null
      or b.title ilike '%' || p_search || '%'
      or q.title ilike '%' || p_search || '%'
    )
  order by q.title, b.title, b.created_at
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke execute on function public.get_quest_runtime_context(uuid) from public, anon;
grant execute on function public.get_quest_runtime_context(uuid) to authenticated, service_role;
revoke execute on function public.transition_quest_runtime(uuid, text, bigint, uuid, uuid, uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.transition_quest_runtime(uuid, text, bigint, uuid, uuid, uuid, text, boolean, jsonb) to authenticated, service_role;
revoke execute on function public.search_quest_runtime_jump_targets(uuid, text, integer) from public, anon;
grant execute on function public.search_quest_runtime_jump_targets(uuid, text, integer) to authenticated, service_role;

comment on function public.transition_quest_runtime(uuid, text, bigint, uuid, uuid, uuid, text, boolean, jsonb) is
  'Atomically applies a version-checked DM runtime command and appends its immutable history row.';
