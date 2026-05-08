-- Migration: app_settings
-- Global singleton key/value store for app-wide admin configuration

create table app_settings (
  key  text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger app_settings_updated_at
  before update on app_settings
  for each row execute procedure update_updated_at();

-- Read: any authenticated user (needed so FocalImage can read focal points)
-- Write: admin-only guard enforced at application layer via Supabase admin client
alter table app_settings enable row level security;

create policy "app_settings_select" on app_settings
  for select using (auth.uid() is not null);

create policy "app_settings_insert" on app_settings
  for insert with check (auth.uid() is not null);

create policy "app_settings_update" on app_settings
  for update using (auth.uid() is not null);
