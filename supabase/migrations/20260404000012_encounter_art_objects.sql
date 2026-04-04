alter table encounters
  add column if not exists art_objects jsonb not null default '[]';
