alter table items
  add column if not exists curse_description text,
  add column if not exists curse_revealed boolean not null default false;
