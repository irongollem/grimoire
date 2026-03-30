-- DM can optionally reveal full stat block to players (off by default).
-- Default: players only see name, artwork, CR, type/size.
alter table discovered_monsters
  add column reveal_stats boolean not null default false;
