-- Migration: player_session_projection
-- Lets the table see that a session is running, without seeing the row.

-- `campaign_session_state` is DM-only (`20260822234841`): one `_dm_all` policy
-- on `private.is_campaign_dm()`, matching `quest_runtime_state`. That is the
-- right default and does not change here.
--
-- But players have no way to know a session is live. They learn it only from
-- the reveals arriving in their chat, which is inference from a side effect —
-- and the announcement added alongside this migration is a single message that
-- scrolls away. A player joining late, or reopening the app, has nothing to
-- read the state off.
--
-- So: a projection, not a widened policy. The same shape as
-- `get_player_encounter_state` — a `SECURITY DEFINER` reader that hands back
-- strictly less than the row. `user_id` is deliberately absent: which DM
-- started the session is not a player's business, and the id is a join key into
-- `auth.users`. `ended_at` is absent for the same reason a closed session is
-- not interesting to a player — the only question is whether the table is
-- sitting right now, plus since when, so the portal can say "started 2h ago".

create function public.get_player_session_state(p_campaign_id uuid)
returns table (
  is_running boolean,
  started_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  -- Authorize first, from auth.uid() alone, and total: `coalesce` because a
  -- predicate used negatively must never answer NULL. Membership rather than
  -- DM — this is the reader players use.
  if auth.uid() is null or not coalesce(private.is_campaign_member(p_campaign_id), false) then
    raise exception 'Not authorized';
  end if;

  return query
  select state.is_running, state.started_at
  from public.campaign_session_state state
  where state.campaign_id = p_campaign_id
    and state.is_running;
end;
$$;

revoke execute on function public.get_player_session_state(uuid) from public, anon;
grant execute on function public.get_player_session_state(uuid) to authenticated, service_role;

comment on function public.get_player_session_state(uuid) is
  'Whether the campaign''s table is sitting right now, and since when. Members only; strictly less than the row.';
