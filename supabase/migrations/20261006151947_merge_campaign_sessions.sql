-- Migration: merge_campaign_sessions
-- Two log rows for one evening become one.
--
-- The number is a label, so the log allows two sessions called 14, and it
-- makes them easily: 20261006072708 turned every numbered session note into a
-- session, so an evening that was both run through Start and written up as a
-- note arrived as two rows, one with the clock and the encounters, the other
-- with the title and the recap. Nothing could put them back together.
--
-- merge_campaign_sessions(p_keep, p_absorb) moves everything that points at
-- p_absorb onto p_keep, fills what p_keep lacks from p_absorb (number, title,
-- played_on, the run), and deletes p_absorb. Both runs kept means the evening
-- spans from the earlier start to the later end: a restart mid-session is the
-- usual way one evening gets two runs.
--
-- SECURITY DEFINER because a merge must move every link or none: an invoker
-- version would leave behind any row RLS did not let this caller update (a
-- co-DM's note), and deleting p_absorb would then unlink it silently. It
-- authorizes first, on the campaign both sessions belong to, and touches only
-- rows that point at p_absorb. Refusal test: campaign_sessions.test.sql.
--
-- An open session is refused: the one running tonight is still being written
-- to, and its started_at is what keeps campaign_sessions_one_open honest.
--
-- The list of links below is every foreign key into campaign_sessions; the
-- test holds it equal to pg_constraint, so a new link fails the suite until it
-- is merged here too.

create function public.merge_campaign_sessions(p_keep uuid, p_absorb uuid)
returns public.campaign_sessions
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_keep   public.campaign_sessions;
  v_absorb public.campaign_sessions;
begin
  select * into v_keep from public.campaign_sessions where id = p_keep for update;
  select * into v_absorb from public.campaign_sessions where id = p_absorb for update;

  -- One message for missing and foreign alike: a caller learns nothing about
  -- sessions in a campaign they do not run.
  if auth.uid() is null
     or v_keep.id is null
     or v_absorb.id is null
     or v_keep.campaign_id <> v_absorb.campaign_id
     or not coalesce(private.is_campaign_dm(v_keep.campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  if v_keep.id = v_absorb.id then
    raise exception 'A session cannot be merged into itself';
  end if;
  if (v_keep.started_at is not null and v_keep.ended_at is null)
     or (v_absorb.started_at is not null and v_absorb.ended_at is null) then
    raise exception 'End the running session before merging it';
  end if;

  update public.notes                  set session_id = p_keep where session_id = p_absorb;
  update public.session_proposals      set session_id = p_keep where session_id = p_absorb;
  update public.encounter_state        set session_id = p_keep where session_id = p_absorb;
  update public.npc_reveals            set session_id = p_keep where session_id = p_absorb;
  update public.location_reveals       set session_id = p_keep where session_id = p_absorb;
  update public.handout_reveals        set session_id = p_keep where session_id = p_absorb;
  update public.discovered_monsters    set session_id = p_keep where session_id = p_absorb;
  update public.quest_beat_transitions set session_id = p_keep where session_id = p_absorb;

  delete from public.campaign_sessions where id = p_absorb;

  update public.campaign_sessions
     set number     = coalesce(v_keep.number, v_absorb.number),
         title      = coalesce(nullif(btrim(v_keep.title), ''), nullif(btrim(v_absorb.title), '')),
         played_on  = coalesce(v_keep.played_on, v_absorb.played_on),
         started_at = case
                        when v_keep.started_at is null then v_absorb.started_at
                        when v_absorb.started_at is null then v_keep.started_at
                        else least(v_keep.started_at, v_absorb.started_at)
                      end,
         ended_at   = case
                        when v_keep.started_at is null then v_absorb.ended_at
                        when v_absorb.started_at is null then v_keep.ended_at
                        else greatest(v_keep.ended_at, v_absorb.ended_at)
                      end
   where id = p_keep
  returning * into v_keep;

  return v_keep;
end;
$$;

revoke execute on function public.merge_campaign_sessions(uuid, uuid) from public, anon;
grant execute on function public.merge_campaign_sessions(uuid, uuid) to authenticated, service_role;
