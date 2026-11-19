-- Where the party is, in a conversation with the AI table (#1021).
--
-- The narrator used to find out where the party was by looking it up: an overview, two searches and two reads,
-- one model call each, before anyone spoke (seen live, 16 Nov 2026: seven calls and 14 seconds for one question).
-- With the place kept on the conversation, the server hands the narrator the place and who is there at the start
-- of every turn, and the lookups go away. Hearing by room and the player's scene column want the same fact.
--
-- Written only by the server, like the rest of the row: `agent_sessions` has no insert or update policy and no
-- such grant for `authenticated`, so a client cannot move the party by writing the column. It is read by the
-- owner through the existing select policy. A place that is deleted leaves the party nowhere, not in a dangling
-- row.
--
-- The place must be in the conversation's own campaign: a conversation in one campaign must not be handed another
-- campaign's place, its description and its people. `zz_same_campaign_refs` (the rule of 20261003151455) is here
-- because every such foreign key carries it, but it lets server code through by design (no `auth.uid()`), and the
-- server is the only writer of this row. So the column has its own check, which holds whoever writes.

alter table public.agent_sessions
  add column scene_location_id uuid references public.locations (id) on delete set null;

comment on column public.agent_sessions.scene_location_id is
  'Where the party is in this conversation. Set by the server when the narrator moves the scene; null until the story has a place.';

-- The foreign key is checked on every delete of a place.
create index agent_sessions_scene_location_id_idx on public.agent_sessions (scene_location_id)
  where scene_location_id is not null;

create trigger zz_same_campaign_refs
  before insert or update of scene_location_id, campaign_id
  on public.agent_sessions
  for each row execute procedure private.enforce_same_campaign_refs('scene_location_id', 'locations', 'owned');

create function public.agent_session_scene_in_campaign()
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
  return new;
end;
$$;

-- A trigger function is never called directly; keep it off the RPC surface.
revoke execute on function public.agent_session_scene_in_campaign() from public, anon, authenticated;

create trigger agent_sessions_scene_in_campaign
  before insert or update of scene_location_id, campaign_id
  on public.agent_sessions
  for each row execute procedure public.agent_session_scene_in_campaign();
