-- Link calendar events to quests, encounters, or locations
-- Three separate nullable FKs (one per entity type) — cleaner than polymorphic type+id pair
alter table public.calendar_events
  add column linked_quest_id     uuid references quests(id)     on delete cascade,
  add column linked_encounter_id uuid references encounters(id) on delete cascade,
  add column linked_location_id  uuid references locations(id)  on delete cascade;

create index calendar_events_linked_quest_idx
  on public.calendar_events(linked_quest_id) where linked_quest_id is not null;
create index calendar_events_linked_encounter_idx
  on public.calendar_events(linked_encounter_id) where linked_encounter_id is not null;
create index calendar_events_linked_location_idx
  on public.calendar_events(linked_location_id) where linked_location_id is not null;
