-- Add curses array to party_members for tracking active curse details
alter table party_members
  add column curses text[] not null default '{}';
