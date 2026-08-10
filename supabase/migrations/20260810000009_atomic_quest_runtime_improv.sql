alter table public.quest_beats
  add column improv_reviewed_at timestamptz;

comment on column public.quest_beats.improv_reviewed_at is
  'Set after the DM has turned an at-table improvisation into prepared authored material.';

create or replace function public.improvise_quest_runtime(
  p_campaign_id uuid,
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

  select * into v_state from public.quest_runtime_state where campaign_id = p_campaign_id;
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
    p_command => 'improv',
    p_expected_version => p_expected_version,
    p_target_quest_id => v_created.quest_id,
    p_target_beat_id => v_created.id,
    p_reason => p_reason,
    p_push_return => p_push_return,
    p_provenance => jsonb_build_object('surface', 'quest-run-improv', 'kept_edge', p_keep_edge)
  );

  return jsonb_build_object('context', v_context, 'beat', to_jsonb(v_created));
end;
$$;

revoke execute on function public.improvise_quest_runtime(uuid, bigint, text, text, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.improvise_quest_runtime(uuid, bigint, text, text, text, text, text, boolean, boolean, text) to authenticated, service_role;

comment on function public.improvise_quest_runtime(uuid, bigint, text, text, text, text, text, boolean, boolean, text) is
  'Atomically creates a hidden improvised beat, optionally keeps an authored edge, and enters it in runtime history.';
