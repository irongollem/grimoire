-- Add current location tracking to party members
alter table party_members
  add column current_location_id uuid references locations(id) on delete set null;

-- Add travel party member ids to calendar events (who was on this journey)
alter table calendar_events
  add column travel_party_member_ids uuid[] not null default '{}';
