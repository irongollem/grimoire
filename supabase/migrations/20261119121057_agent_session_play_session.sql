-- A sitting at the AI table is a play session of the campaign (#1021).
--
-- What happens at the table is written into the campaign: a character's memories now, quest moves and the record
-- of facts next. Each of those carries the session it happened in, which is how "what did we do last time" is
-- answered and how the next sitting picks its threads back up. Until now a conversation knew its campaign and
-- nothing of the evening it belonged to, so everything it wrote was undated.
--
-- The conversation keeps the session it was started in. Written only by the server, like the rest of the row; a
-- session that is deleted leaves the conversation without one. The session must be of the conversation's own
-- campaign. As with the scene (20261119121056), `zz_same_campaign_refs` is here because every such foreign key
-- carries it, but it lets server code through and the server is this row's only writer, so the row's own trigger
-- checks both references whoever writes.

alter table public.agent_sessions
  add column campaign_session_id uuid references public.campaign_sessions (id) on delete set null;

comment on column public.agent_sessions.campaign_session_id is
  'The play session this conversation is a sitting of. Set by the server when the conversation is created; null when no session could be opened.';

create index agent_sessions_campaign_session_id_idx on public.agent_sessions (campaign_session_id)
  where campaign_session_id is not null;

drop trigger zz_same_campaign_refs on public.agent_sessions;
create trigger zz_same_campaign_refs
  before insert or update of scene_location_id, campaign_session_id, campaign_id
  on public.agent_sessions
  for each row execute procedure private.enforce_same_campaign_refs(
    'scene_location_id', 'locations', 'owned',
    'campaign_session_id', 'campaign_sessions', 'owned'
  );

-- One check for every reference the row holds into its campaign, replacing the scene-only one.
drop trigger agent_sessions_scene_in_campaign on public.agent_sessions;
drop function public.agent_session_scene_in_campaign();

create function public.agent_session_refs_in_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.scene_location_id is not null and not exists (
    select 1 from public.locations l where l.id = new.scene_location_id and l.campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'agent_sessions.scene_location_id must be a place of the conversation''s campaign';
  end if;
  if new.campaign_session_id is not null and not exists (
    select 1 from public.campaign_sessions s where s.id = new.campaign_session_id and s.campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'agent_sessions.campaign_session_id must be a session of the conversation''s campaign';
  end if;
  return new;
end;
$$;

revoke execute on function public.agent_session_refs_in_campaign() from public, anon, authenticated;

create trigger agent_sessions_refs_in_campaign
  before insert or update of scene_location_id, campaign_session_id, campaign_id
  on public.agent_sessions
  for each row execute procedure public.agent_session_refs_in_campaign();
