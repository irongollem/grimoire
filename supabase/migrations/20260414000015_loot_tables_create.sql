-- Migration: loot_tables_create
-- Idempotent recreation of loot_tables. The sequence 000011 was recorded as
-- applied remotely when it was still a no-op placeholder; this migration
-- creates the table with IF NOT EXISTS so it is safe to run against DBs
-- that already have it.

create table if not exists public.loot_tables (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name        text not null,
  description text,
  cr_tier     text not null default 'any'
                check (cr_tier in ('any','0-4','5-10','11-16','17+')),
  entries     jsonb not null default '[]'::jsonb,
  tags        text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists loot_tables_user_idx     on public.loot_tables (user_id);
create index if not exists loot_tables_campaign_idx on public.loot_tables (campaign_id);

-- Trigger (skip if already exists)
do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'loot_tables_updated_at'
      and tgrelid = 'public.loot_tables'::regclass
  ) then
    create trigger loot_tables_updated_at
      before update on public.loot_tables
      for each row execute procedure update_updated_at();
  end if;
end $$;

alter table public.loot_tables enable row level security;

-- Policies (skip if already exists)
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'loot_tables' and policyname = 'loot_tables_select') then
    create policy "loot_tables_select" on public.loot_tables for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'loot_tables' and policyname = 'loot_tables_insert') then
    create policy "loot_tables_insert" on public.loot_tables for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'loot_tables' and policyname = 'loot_tables_update') then
    create policy "loot_tables_update" on public.loot_tables for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'loot_tables' and policyname = 'loot_tables_delete') then
    create policy "loot_tables_delete" on public.loot_tables for delete using (auth.uid() = user_id);
  end if;
end $$;
