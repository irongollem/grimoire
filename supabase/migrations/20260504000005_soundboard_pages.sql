-- Migration: soundboard_pages
-- Add soundboard_pages table and page_id FK on sounds for multi-page/scene support

create table soundboard_pages (
  id          uuid        primary key default gen_random_uuid(),
  campaign_id uuid        not null references campaigns(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger soundboard_pages_updated_at
  before update on soundboard_pages
  for each row execute procedure update_updated_at();

alter table soundboard_pages enable row level security;

create policy "soundboard_pages_select" on soundboard_pages for select using (auth.uid() = user_id);
create policy "soundboard_pages_insert" on soundboard_pages for insert with check (auth.uid() = user_id);
create policy "soundboard_pages_update" on soundboard_pages for update using (auth.uid() = user_id);
create policy "soundboard_pages_delete" on soundboard_pages for delete using (auth.uid() = user_id);

alter table sounds
  add column page_id uuid references soundboard_pages(id) on delete set null;
