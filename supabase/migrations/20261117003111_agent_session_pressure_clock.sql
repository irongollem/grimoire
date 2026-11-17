-- The clock a scene at the AI table is running against (#1021).
--
-- A model told to "keep things moving" lets a pleasant conversation run as long as the player keeps talking: it has
-- no feel for how long a scene has gone on. The maintainer, 16 Nov 2026: "If certain urgency is needed a
-- conversation can't simply drag on forever." So urgency is a quest clock, the server counts the turns against it,
-- and the narrator only tells what happens. This column names the clock that is running: while it is set, every
-- kept turn of the conversation ticks that clock by one, through `tick_quest_clock`, the function the quest screen
-- uses, so its rules fire when it fills exactly as they do there.
--
-- Written only by the server, like the rest of the row. A clock that is deleted leaves the conversation without
-- pressure. The clock must be of the conversation's campaign; as with the scene and the session
-- (20261117003107, 20261117003108) the row's own trigger checks it, because the shared one lets server code through.

alter table public.agent_sessions
  add column pressure_clock_id uuid references public.quest_clocks (id) on delete set null;

comment on column public.agent_sessions.pressure_clock_id is
  'The quest clock this conversation ticks by one every kept turn. Null when the scene is under no pressure.';

create index agent_sessions_pressure_clock_id_idx on public.agent_sessions (pressure_clock_id)
  where pressure_clock_id is not null;

drop trigger zz_same_campaign_refs on public.agent_sessions;
create trigger zz_same_campaign_refs
  before insert or update of scene_location_id, campaign_session_id, pressure_clock_id, campaign_id
  on public.agent_sessions
  for each row execute procedure private.enforce_same_campaign_refs(
    'scene_location_id', 'locations', 'owned',
    'campaign_session_id', 'campaign_sessions', 'owned',
    'pressure_clock_id', 'quest_clocks', 'unowned'
  );

create or replace function public.agent_session_refs_in_campaign()
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
  if new.pressure_clock_id is not null and not exists (
    select 1 from public.quest_clocks c where c.id = new.pressure_clock_id and c.campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'agent_sessions.pressure_clock_id must be a clock of the conversation''s campaign';
  end if;
  return new;
end;
$$;

drop trigger agent_sessions_refs_in_campaign on public.agent_sessions;
create trigger agent_sessions_refs_in_campaign
  before insert or update of scene_location_id, campaign_session_id, pressure_clock_id, campaign_id
  on public.agent_sessions
  for each row execute procedure public.agent_session_refs_in_campaign();
