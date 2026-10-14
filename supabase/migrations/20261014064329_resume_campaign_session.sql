-- Migration: resume_campaign_session (#1058)
-- An interrupted session can be continued instead of becoming a second one.
--
-- Ending is one click (End, or "Still playing?" answered wrongly), and before
-- this nothing could undo it: start_campaign_session only ever inserts, so the
-- rest of the evening became a second row with the next number, and the
-- encounters, reveals and quest steps split between the two until someone
-- merged them. resume_campaign_session(p_session_id) reopens the row instead,
-- so every link keeps pointing at one session.
--
-- What it allows:
--   * only a session that was run (a past session logged by hand never had a
--     clock to restart);
--   * only the campaign's most recent run: reopening an older one would file
--     everything shared since the later session ended under the earlier one;
--   * not while another session is open (campaign_sessions_one_open would
--     refuse the write anyway; this says why). Called on the session that is
--     already open it returns it, as start does, so a double tap is harmless.
--
-- It leaves started_at alone. The break is not recorded: a session's length is
-- first start to last end, the same span merge_campaign_sessions gives two
-- runs of one evening. What was shared during the break (session_id left null
-- by stamp_open_session, since nothing was open) is filed under the session
-- it continues, exactly as Start files prep under the session it begins.
--
-- SECURITY INVOKER, like start and end: the DM-only policies on
-- campaign_sessions and the reveal tables already authorize every write it
-- makes, so it needs no definer and no entry in the refusal registry. It still
-- authorizes first, so a refusal says "Not authorized" rather than whatever a
-- filtered read would have made of it. Refusal tests: campaign_sessions.test.sql.

-- ── Filing unfiled moments, shared by start and resume ──────────────────────
-- Moved out of start_campaign_session (20261006072853) so resume files the
-- break the same way. Invoker: it writes as the DM who called start or resume.

create function private.file_unsessioned_moments(p_campaign_id uuid, p_session_id uuid, p_since timestamptz)
returns void
language sql
set search_path to 'public', 'private'
as $$
  update public.npc_reveals set session_id = p_session_id
   where campaign_id = p_campaign_id and session_id is null and not approximate and revealed_at > p_since;
  update public.location_reveals set session_id = p_session_id
   where campaign_id = p_campaign_id and session_id is null and not approximate and revealed_at > p_since;
  update public.handout_reveals set session_id = p_session_id
   where campaign_id = p_campaign_id and session_id is null and not approximate and revealed_at > p_since;
  update public.discovered_monsters set session_id = p_session_id
   where campaign_id = p_campaign_id and session_id is null and discovered_at > p_since;
  update public.quest_beat_transitions set session_id = p_session_id
   where campaign_id = p_campaign_id and session_id is null and created_at > p_since;
$$;

revoke execute on function private.file_unsessioned_moments(uuid, uuid, timestamptz) from public, anon;
grant execute on function private.file_unsessioned_moments(uuid, uuid, timestamptz) to authenticated, service_role;

create or replace function public.start_campaign_session(
  p_campaign_id uuid,
  p_number integer default null,
  p_title text default null,
  p_proposal_id uuid default null
)
returns public.campaign_sessions
language plpgsql
set search_path to 'public', 'private'
as $$
declare
  v_row   public.campaign_sessions;
  v_since timestamptz;
begin
  if auth.uid() is null or not coalesce(private.is_campaign_dm(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_row from public.campaign_sessions
   where campaign_id = p_campaign_id and started_at is not null and ended_at is null;
  if found then
    return v_row;
  end if;

  insert into public.campaign_sessions (campaign_id, user_id, number, title, started_at)
  values (p_campaign_id, auth.uid(), p_number, nullif(btrim(p_title), ''), now())
  returning * into v_row;

  if p_proposal_id is not null then
    update public.session_proposals
       set session_id = v_row.id
     where id = p_proposal_id and campaign_id = p_campaign_id;
  end if;

  -- What the DM shared since the last session ended (prep) was learned for
  -- this one. Never before the log began, never a reconstructed moment.
  select greatest(coalesce(max(ended_at), '-infinity'::timestamptz), private.session_log_began())
    into v_since
    from public.campaign_sessions
   where campaign_id = p_campaign_id and ended_at is not null;

  perform private.file_unsessioned_moments(p_campaign_id, v_row.id, v_since);

  return v_row;
end;
$$;

-- ── Continue ────────────────────────────────────────────────────────────────

create function public.resume_campaign_session(p_session_id uuid)
returns public.campaign_sessions
language plpgsql
set search_path to 'public', 'private'
as $$
declare
  v_row  public.campaign_sessions;
  v_open public.campaign_sessions;
begin
  -- One message for missing and foreign alike: the DM-only select policy hides
  -- another campaign's row, and a caller learns nothing either way.
  select * into v_row from public.campaign_sessions where id = p_session_id;
  if auth.uid() is null
     or v_row.id is null
     or not coalesce(private.is_campaign_dm(v_row.campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  select * into v_open from public.campaign_sessions
   where campaign_id = v_row.campaign_id and started_at is not null and ended_at is null;
  if found then
    if v_open.id = v_row.id then
      return v_open;
    end if;
    raise exception 'End the running session before continuing another';
  end if;

  if v_row.started_at is null then
    raise exception 'Only a session that was run can be continued';
  end if;
  if exists (
    select 1 from public.campaign_sessions
     where campaign_id = v_row.campaign_id
       and id <> v_row.id
       and started_at > v_row.started_at
  ) then
    raise exception 'Only the most recent session can be continued';
  end if;

  update public.campaign_sessions
     set ended_at = null
   where id = v_row.id
  returning * into v_open;

  -- The break: whatever was shared while nothing was open belongs to the
  -- evening it interrupted, not to the next one.
  perform private.file_unsessioned_moments(
    v_row.campaign_id, v_row.id, greatest(v_row.ended_at, private.session_log_began())
  );

  return v_open;
end;
$$;

revoke execute on function public.resume_campaign_session(uuid) from public, anon;
grant execute on function public.resume_campaign_session(uuid) to authenticated, service_role;
