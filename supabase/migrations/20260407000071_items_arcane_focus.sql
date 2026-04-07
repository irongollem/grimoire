alter table items
  add column if not exists is_arcane_focus boolean not null default false;
