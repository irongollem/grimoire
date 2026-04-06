create table srd_art_defaults (
  id                uuid primary key default gen_random_uuid(),
  contributed_by    uuid not null references auth.users(id),
  content_type      text not null check (content_type in ('spell', 'item')),
  srd_slug          text not null,
  image_url         text,
  image_focal_point jsonb,
  updated_at        timestamptz not null default now(),
  unique (content_type, srd_slug)
);

create trigger srd_art_defaults_updated_at
  before update on srd_art_defaults
  for each row execute procedure update_updated_at();

alter table srd_art_defaults enable row level security;

create policy "srd_art_defaults_select" on srd_art_defaults
  for select using (auth.uid() is not null);

create policy "srd_art_defaults_insert" on srd_art_defaults
  for insert with check (auth.uid() = contributed_by);

create policy "srd_art_defaults_update" on srd_art_defaults
  for update using (auth.uid() = contributed_by);

create policy "srd_art_defaults_delete" on srd_art_defaults
  for delete using (auth.uid() = contributed_by);
