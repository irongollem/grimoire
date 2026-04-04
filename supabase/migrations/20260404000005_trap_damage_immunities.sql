alter table traps
  add column if not exists damage_immunities text[] not null default '{poison,psychic}';
