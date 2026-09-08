-- Prep can assert what already happened. Story #796, epic #780.
--
-- `quest_runtime_state` has no client write grant at all — every change goes
-- through `transition_quest_runtime`, which is a play-time verb machine: one
-- move per call, a mandatory reason on jumps, an undo stack that truncates, and
-- every step stamped as having happened now. So recording ten sessions of
-- history already played means ten little performances of the game, and the log
-- claims the whole campaign happened this afternoon.
--
-- The evidence that this is a real cost, not a hypothetical one: production has
-- 68 beats and **13** `forward` transitions ever recorded, 6 `previous`, and
-- both runtime rows sitting `paused`. The machine is avoided rather than used.
--
-- #794 already opened half the door — `assert_quest_objective_status` writes a
-- status with no cursor and no session, and `quest_beat_transitions` gained the
-- `assert` kind for exactly this. This finishes it for the cursor.
--
-- ── Asserted, not played ────────────────────────────────────────────────────
--
-- Corrections APPEND to `quest_beat_transitions` as `assert`, so the log stays
-- append-only and the audit trail stays honest: a reader can always tell what
-- the party walked through from what the DM recorded afterwards. `previous`
-- already skips `assert` rows when unwinding (#794), so stepping back at the
-- table still unwinds the last real arrival rather than a correction.
--
-- ── Fixing the record must not announce the table is live ───────────────────
--
-- `status = 'running'` is what lights the session rail, the board's "live" dot
-- and the dashboard's "here" stage. Asserting must never set it: opening a
-- chain to fix its record is not sitting down to play. So this leaves `status`
-- exactly as it found it — an `idle` quest stays idle, a `paused` one stays
-- paused — and only `transition_quest_runtime` can start a session.

create or replace function public.assert_quest_runtime(
  p_campaign_id uuid,
  p_quest_id uuid,
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

  if p_beat_ids is null or array_length(p_beat_ids, 1) is null then
    raise exception 'Nothing to assert' using errcode = '22023';
  end if;

  -- Every beat must belong to this quest. Checked up front rather than per
  -- iteration so a typo in the middle of a ten-beat backfill cannot leave half
  -- a session recorded.
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
   where quest_id = p_quest_id and campaign_id = p_campaign_id;

  -- Where the record currently stands, so the first assertion reads as a step
  -- from it rather than from nowhere.
  --
  -- Read from the transition log, not the cursor. They agree whenever the cursor
  -- was placed, and they diverge exactly where it matters: a
  -- `p_place_cursor = false` call records arrivals without moving the cursor, so
  -- chaining from the cursor would make the NEXT call start over from the same
  -- stale point — recording A→D for a beat that actually followed C, and
  -- quietly orphaning everything recorded in between. Transitions are the
  -- history; the cursor is only where the party is standing.
  select t.to_beat_id into v_prev
    from public.quest_beat_transitions t
   where t.to_quest_id = p_quest_id
     and t.campaign_id = p_campaign_id
     and t.to_beat_id is not null
   order by t.created_at desc, t.id desc
   limit 1;

  if v_prev is null then
    v_prev := v_state.current_beat_id;
  end if;

  foreach v_beat_id in array p_beat_ids loop
    select title into v_title from public.quest_beats where id = v_beat_id;

    insert into public.quest_beat_transitions (
      campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id,
      transition_kind, reason, created_by, to_quest_title, to_beat_title
    ) values (
      p_campaign_id,
      case when v_prev is null then null else p_quest_id end, v_prev,
      p_quest_id, v_beat_id,
      'assert', nullif(btrim(p_reason), ''), auth.uid(), v_quest.title, v_title
    ) returning id into v_tid;

    -- Each asserted arrival fires that beat's consequences, exactly as an
    -- arrival at the table would. That is the point: the ledger should end up
    -- where it would have been had the session been played through.
    perform private.apply_quest_consequences(p_campaign_id, p_quest_id, v_tid, v_beat_id, null);

    v_titles := v_titles || to_jsonb(coalesce(v_title, ''));
    v_prev := v_beat_id;
    v_applied := v_applied + 1;
  end loop;

  -- Place the cursor at the last asserted beat, without starting a session.
  if p_place_cursor then
    if v_state.quest_id is null then
      insert into public.quest_runtime_state (
        campaign_id, quest_id, current_beat_id, status, updated_by,
        visit_stack, visit_index, return_stack, version
      ) values (
        p_campaign_id, p_quest_id, v_prev,
        -- Deliberately not 'running'. A quest whose record was corrected has
        -- not been started; `paused` is the honest resting state for a chain
        -- with a cursor and nobody at the table.
        'paused', auth.uid(),
        jsonb_build_array(v_prev), 0, '[]'::jsonb, 1
      );
    else
      update public.quest_runtime_state
         set current_beat_id = v_prev,
             -- `status` is untouched on purpose: only the verb machine starts
             -- a session, and fixing a record must not light the session rail.
             visit_stack = coalesce(visit_stack, '[]'::jsonb) || jsonb_build_array(v_prev),
             visit_index = jsonb_array_length(coalesce(visit_stack, '[]'::jsonb)),
             version = version + 1,
             updated_by = auth.uid()
       where quest_id = p_quest_id and campaign_id = p_campaign_id;
    end if;
  end if;

  return jsonb_build_object(
    'asserted', v_applied,
    'beats', v_titles,
    'cursor_placed', p_place_cursor,
    'current_beat_id', case when p_place_cursor then v_prev else v_state.current_beat_id end
  );
end $$;

comment on function public.assert_quest_runtime(uuid, uuid, uuid[], boolean, text) is
  'Records beats as already played: appends `assert` transitions, fires each '
  'beat''s consequences, and optionally places the cursor — without starting a '
  'session. The prep-time counterpart to transition_quest_runtime, which stays '
  'the only way to play (#796).';

revoke execute on function public.assert_quest_runtime(uuid, uuid, uuid[], boolean, text) from public, anon;
grant execute on function public.assert_quest_runtime(uuid, uuid, uuid[], boolean, text) to authenticated, service_role;
