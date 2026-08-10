-- Follow-up hardening for the quest runtime and overview beat. This is kept in
-- a new timestamped migration so environments that already applied the quest
-- flow migrations receive the fixes instead of silently diverging from history.

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
    -- The cockpit polls every five seconds. Keep the recent path bounded while
    -- the full audit remains in quest_beat_transitions.
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
        order by t.created_at desc, t.id desc
        limit 100
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_quest_runtime_context(uuid) from public, anon;
grant execute on function public.get_quest_runtime_context(uuid) to authenticated, service_role;

create or replace function private.protect_quest_overview_beat()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'DELETE' then
    -- A quest/campaign cascade remains valid once the parent quest is gone.
    if old.is_overview and exists (select 1 from public.quests q where q.id = old.quest_id) then
      raise exception 'The quest overview beat cannot be removed while its quest exists'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if old.is_overview and (not new.is_overview or new.kind = 'archived') then
    raise exception 'The quest overview beat cannot be archived or demoted'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_quest_overview_beat() from public, anon, authenticated;

drop trigger if exists protect_quest_overview_beat on public.quest_beats;
create trigger protect_quest_overview_beat
  before update or delete on public.quest_beats
  for each row execute procedure private.protect_quest_overview_beat();

-- Overview beats are edited through their drawer and intentionally sit outside
-- the playable edge graph, so they must never become runtime jump targets.
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
    and not b.is_overview
    and (
      nullif(btrim(p_search), '') is null
      or b.title ilike '%' || p_search || '%'
      or q.title ilike '%' || p_search || '%'
    )
  order by q.title, b.title, b.created_at
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke execute on function public.search_quest_runtime_jump_targets(uuid, text, integer) from public, anon;
grant execute on function public.search_quest_runtime_jump_targets(uuid, text, integer) to authenticated, service_role;
