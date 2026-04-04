alter table locations
  add column player_summary         text,
  add column is_description_shared  boolean not null default false,
  add column is_npcs_shared         boolean not null default false;
