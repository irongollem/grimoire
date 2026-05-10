-- Migration: dungeon_maps_cartographer
-- Creates the dungeon_maps source-of-truth table for the Cartographer map editor
-- and adds locations.source_map_id so baked Atlas maps can link back to their source.

create table dungeon_maps (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  layers          jsonb not null default '{"floor":{},"solidBlock":{},"object":{},"annotation":{}}'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  default_pack_id text,
  tags            text[] not null default '{}',
  notes           jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table dungeon_maps enable row level security;

create policy "dungeon_maps_select" on dungeon_maps for select using (auth.uid() = user_id);
create policy "dungeon_maps_insert" on dungeon_maps for insert with check (auth.uid() = user_id);
create policy "dungeon_maps_update" on dungeon_maps for update using (auth.uid() = user_id);
create policy "dungeon_maps_delete" on dungeon_maps for delete using (auth.uid() = user_id);

create trigger dungeon_maps_updated_at
  before update on dungeon_maps
  for each row execute procedure update_updated_at();

create index dungeon_maps_user_id_idx on dungeon_maps(user_id);

-- Link Atlas locations back to their source map (set in Cartographer's Save-to-Atlas flow).
alter table locations
  add column source_map_id uuid references dungeon_maps(id) on delete set null;

create index locations_source_map_id_idx on locations(source_map_id);
