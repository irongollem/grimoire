-- The note a sitting at the AI table left behind (#1021 row 19).
--
-- Leaving the table writes a session note of what went on the record. To tell that sitting as a story afterwards
-- ("the sitting's notes as a Dungeon Master would write them"), the note has to lead back to the sitting it came
-- from: one play session can hold several sittings, so the session alone does not say which. The server writes
-- this when it writes the note; a note that is deleted simply leaves the sitting without one.
alter table public.agent_sessions
  add column note_id uuid references public.notes (id) on delete set null;

create index agent_sessions_note_id_idx on public.agent_sessions (note_id) where note_id is not null;

-- A sitting's note is a note of the sitting's own campaign, like everything else a sitting points at: the one
-- trigger that holds those references is recreated with the new column in it.
drop trigger zz_same_campaign_refs on public.agent_sessions;
create trigger zz_same_campaign_refs
  before insert or update of scene_location_id, campaign_session_id, pressure_clock_id, party_member_id, fight_encounter_id, pursuit_encounter_id, note_id, campaign_id
  on public.agent_sessions
  for each row execute function private.enforce_same_campaign_refs(
    'scene_location_id', 'locations', 'owned',
    'campaign_session_id', 'campaign_sessions', 'owned',
    'pressure_clock_id', 'quest_clocks', 'unowned',
    'party_member_id', 'party_members', 'owned',
    'fight_encounter_id', 'encounters', 'owned',
    'pursuit_encounter_id', 'encounters', 'owned',
    'note_id', 'notes', 'owned'
  );
