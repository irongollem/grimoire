-- The fight a conversation at the AI table started (#1021, story 13: "AI-run combat at the table").
--
-- The story can now turn into a fight: the narrator starts an encounter (one prepared at the party's place, or one
-- it puts together from creatures it looked up), the player fights it on the fight screen, and the outcome comes
-- back into the story. Between the turn that started the fight and the turn that tells its aftermath, the
-- conversation has to know which encounter it is waiting on. That is this column.
--
-- Written by the agent-turn function (service role) only; `authenticated` holds SELECT and DELETE on this table.
-- An encounter that is deleted simply leaves the conversation with no fight.

alter table public.agent_sessions
  add column fight_encounter_id uuid references public.encounters (id) on delete set null;

comment on column public.agent_sessions.fight_encounter_id is
  'The encounter this conversation started and is waiting on; cleared once its aftermath has been told. Null when the story is not in a fight.';

create index agent_sessions_fight_encounter_id_idx on public.agent_sessions (fight_encounter_id)
  where fight_encounter_id is not null;

-- The same two guards every reference on this row has: the shared one (which lets a server write through) and the
-- row's own (which does not). See 20261119121055 for why there are two.
drop trigger zz_same_campaign_refs on public.agent_sessions;
create trigger zz_same_campaign_refs
  before insert or update of scene_location_id, campaign_session_id, pressure_clock_id, party_member_id, fight_encounter_id, campaign_id
  on public.agent_sessions
  for each row execute procedure private.enforce_same_campaign_refs(
    'scene_location_id', 'locations', 'owned',
    'campaign_session_id', 'campaign_sessions', 'owned',
    'pressure_clock_id', 'quest_clocks', 'unowned',
    'party_member_id', 'party_members', 'owned',
    'fight_encounter_id', 'encounters', 'owned'
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
  if new.party_member_id is not null and not exists (
    select 1 from public.party_members p where p.id = new.party_member_id and p.campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'agent_sessions.party_member_id must be a character of the conversation''s campaign';
  end if;
  if new.fight_encounter_id is not null and not exists (
    select 1 from public.encounters e where e.id = new.fight_encounter_id and e.campaign_id = new.campaign_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'agent_sessions.fight_encounter_id must be an encounter of the conversation''s campaign';
  end if;
  return new;
end;
$$;

drop trigger agent_sessions_refs_in_campaign on public.agent_sessions;
create trigger agent_sessions_refs_in_campaign
  before insert or update of scene_location_id, campaign_session_id, pressure_clock_id, party_member_id, fight_encounter_id, campaign_id
  on public.agent_sessions
  for each row execute procedure public.agent_session_refs_in_campaign();
