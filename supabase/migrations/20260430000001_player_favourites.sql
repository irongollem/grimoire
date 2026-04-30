-- Migration: player_favourites
-- Extensible favourites table for players to star entities (locations, NPCs, etc.)

create table player_favourites (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  campaign_id uuid        not null references campaigns(id) on delete cascade,
  entity_type text        not null,
  entity_id   uuid        not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(user_id, campaign_id, entity_type, entity_id)
);

create trigger player_favourites_updated_at
  before update on player_favourites
  for each row execute procedure update_updated_at();

alter table player_favourites enable row level security;

create policy "player_favourites_select" on player_favourites for select using (auth.uid() = user_id);
create policy "player_favourites_insert" on player_favourites for insert with check (auth.uid() = user_id);
create policy "player_favourites_update" on player_favourites for update using (auth.uid() = user_id);
create policy "player_favourites_delete" on player_favourites for delete using (auth.uid() = user_id);
