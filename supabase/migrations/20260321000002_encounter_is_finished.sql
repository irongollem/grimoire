alter table public.encounters
  add column if not exists is_finished boolean not null default false;
