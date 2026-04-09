-- Add player-sharing fields to puzzle_rooms.
-- is_shared: makes the puzzle visible to campaign members
-- campaign_id: scopes sharing to a specific campaign (nullable; set when DM shares)
-- shared_hints: array of hint order numbers the DM has revealed to players
-- read_aloud: short script for the DM to read aloud when players enter the room

alter table puzzle_rooms
  add column campaign_id   uuid    references campaigns(id) on delete set null default null,
  add column is_shared     boolean not null default false,
  add column shared_hints  integer[] not null default '{}',
  add column read_aloud    text    default null;

-- Drop existing select policy and recreate with player access
drop policy "puzzle_rooms_select" on puzzle_rooms;

create policy "puzzle_rooms_select" on puzzle_rooms for select using (
  -- DM always sees their own rooms
  auth.uid() = user_id
  or
  -- Players see shared rooms in their campaign
  (
    is_shared = true
    and campaign_id is not null
    and is_campaign_member(campaign_id)
  )
);
