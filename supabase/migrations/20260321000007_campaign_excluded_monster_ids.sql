alter table public.campaigns
  add column if not exists excluded_monster_ids uuid[] not null default '{}';
