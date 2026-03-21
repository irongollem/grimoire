alter table public.encounters
  add column if not exists item_ids uuid[] not null default '{}';
