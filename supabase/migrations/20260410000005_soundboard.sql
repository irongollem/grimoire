-- Soundboard: per-campaign sound library

create table sounds (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  campaign_id   uuid references campaigns(id) on delete cascade not null,
  name          text not null,
  category      text not null default 'misc',
  source_type   text not null default 'upload',
  file_url      text not null,
  storage_path  text,
  tags          text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger sounds_updated_at
  before update on sounds
  for each row execute procedure update_updated_at();

alter table sounds enable row level security;

create policy "sounds_select" on sounds for select using (auth.uid() = user_id);
create policy "sounds_insert" on sounds for insert with check (auth.uid() = user_id);
create policy "sounds_update" on sounds for update using (auth.uid() = user_id);
create policy "sounds_delete" on sounds for delete using (auth.uid() = user_id);

-- Storage bucket (public — getPublicUrl() works without auth tokens)
insert into storage.buckets (id, name, public)
  values ('sounds', 'sounds', true)
  on conflict (id) do nothing;

create policy "sounds_storage_select" on storage.objects
  for select using (bucket_id = 'sounds');

create policy "sounds_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'sounds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "sounds_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'sounds'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
