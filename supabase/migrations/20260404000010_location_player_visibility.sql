alter table locations
  add column shared_with_players boolean not null default false,
  add column player_visible_to    uuid[]  default null;

-- Treat any location that already had its map shared as visible to all players.
update locations set shared_with_players = true where is_map_shared = true;
