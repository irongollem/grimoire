-- Locations: recursive hierarchy (continent → region → city → building → room, etc.)
create type location_type_enum as enum (
  'continent', 'region', 'country', 'city', 'town', 'village',
  'district', 'building', 'room', 'dungeon', 'wilderness', 'other'
);

create table locations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid references campaigns(id) on delete cascade,
  parent_id    uuid references locations(id) on delete cascade,
  name         text not null default '',
  location_type location_type_enum not null default 'other',
  description  text,        -- Tiptap JSON
  notes        text,        -- plain text or Tiptap JSON
  tags         text[] not null default '{}',
  image_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- RLS
alter table locations enable row level security;

create policy "Users can read own locations"
  on locations for select
  using (auth.uid() = user_id);

create policy "Users can insert own locations"
  on locations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own locations"
  on locations for update
  using (auth.uid() = user_id);

create policy "Users can delete own locations"
  on locations for delete
  using (auth.uid() = user_id);

-- updated_at trigger
create trigger set_locations_updated_at
  before update on locations
  for each row execute function update_updated_at();
