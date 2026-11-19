-- Who the player is at the AI table (#1021).
--
-- A conversation knew its campaign, its place and its evening, and not whose story it was: the narrator spoke of
-- "the player character", and the characters in the room could not use a name. The conversation now keeps the
-- party member being played, so the narrator is told who that is and the people in the room can address them.
--
-- Written only by the server, like the rest of the row; a character that is deleted leaves the conversation
-- without one. It must be a character of the conversation's campaign: the row's own trigger checks it (below), as
-- for the scene, the session and the clock, because the shared trigger lets server code through.

alter table public.agent_sessions
  add column party_member_id uuid references public.party_members (id) on delete set null;

comment on column public.agent_sessions.party_member_id is
  'The party member the player plays in this conversation. Set by the server when the conversation is created.';

create index agent_sessions_party_member_id_idx on public.agent_sessions (party_member_id)
  where party_member_id is not null;

drop trigger zz_same_campaign_refs on public.agent_sessions;
create trigger zz_same_campaign_refs
  before insert or update of scene_location_id, campaign_session_id, pressure_clock_id, party_member_id, campaign_id
  on public.agent_sessions
  for each row execute procedure private.enforce_same_campaign_refs(
    'scene_location_id', 'locations', 'owned',
    'campaign_session_id', 'campaign_sessions', 'owned',
    'pressure_clock_id', 'quest_clocks', 'unowned',
    'party_member_id', 'party_members', 'owned'
  );

CREATE OR REPLACE FUNCTION public.agent_session_refs_in_campaign()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
  if new.pressure_clock_id is not null and not exists (
    select 1 from public.quest_clocks c where c.id = new.pressure_clock_id and c.campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'agent_sessions.pressure_clock_id must be a clock of the conversation''s campaign';
  end if;
  if new.party_member_id is not null and not exists (
    select 1 from public.party_members p where p.id = new.party_member_id and p.campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'agent_sessions.party_member_id must be a character of the conversation''s campaign';
  end if;
  return new;
end;
$$;

drop trigger agent_sessions_refs_in_campaign on public.agent_sessions;
create trigger agent_sessions_refs_in_campaign
  before insert or update of scene_location_id, campaign_session_id, pressure_clock_id, party_member_id, campaign_id
  on public.agent_sessions
  for each row execute procedure public.agent_session_refs_in_campaign();
