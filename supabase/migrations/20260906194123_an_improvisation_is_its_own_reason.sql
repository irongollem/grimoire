-- An improvisation is its own reason. Story #824.
--
-- `improvise_quest_runtime` demanded a non-empty `p_reason`, so the mid-session
-- panel had two required fields before a DM could capture a detour — on a form
-- that also shows kind, DM lead, reveal copy and two checkboxes, while the table
-- waits.
--
-- Asked the maintainer what he actually does when the party diverts: "make a
-- note but not fill every field there, then try and get it sorted later." Two
-- mandatory fields is not a note.
--
-- The reason requirement itself is sound — `transition_quest_runtime` mandates
-- one on every jump so the log can say why the story moved. It just does not
-- need to be a *separate* answer here: what happened IS why it happened. So the
-- title becomes the reason when none is given, the log keeps its invariant, and
-- the client drops to one required field.
--
-- Note what this does NOT do: it does not make the reason nullable, and it does
-- not touch `transition_quest_runtime`. A jump the DM chooses still has to be
-- explained; only an improvisation, which is self-describing, does not.

CREATE OR REPLACE FUNCTION public.improvise_quest_runtime(p_campaign_id uuid, p_quest_id uuid, p_expected_version bigint, p_title text, p_kind text DEFAULT 'neutral'::text, p_dm_lead text DEFAULT NULL::text, p_reveal_text text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_push_return boolean DEFAULT true, p_keep_edge boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
  -- An improvisation is its own reason (#824). The transition log still gets
  -- one for every jump — the invariant `transition_quest_runtime` enforces —
  -- but the DM is not asked to type it twice: a beat titled "They sacrificed a
  -- human to befriend Ravishin" explains its own detour perfectly well.
  --
  -- Why this changed: the reason was a second REQUIRED field on a form the DM
  -- fills with five people waiting, and the maintainer's own account of what he
  -- would do is "make a note but not fill every field there, then try and get it
  -- sorted later". Two mandatory fields is not a note.
  p_reason := coalesce(nullif(btrim(p_reason), ''), btrim(p_title));

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
      quest_id, campaign_id, source_beat_id, target_beat_id
    ) values (
      v_source.quest_id, p_campaign_id, v_source.id, v_created.id
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
$function$;

comment on function public.improvise_quest_runtime(uuid, uuid, bigint, text, text, text, text, text, boolean, boolean) is
  'Atomically creates a hidden improvised beat in one quest, optionally keeps an '
  'authored edge, and enters it in runtime history. The title stands in as the '
  'transition reason when none is given (#824) — an improvisation explains '
  'itself, and a second mandatory field is what stops a DM capturing one at all.';
