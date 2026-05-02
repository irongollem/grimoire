-- Migration: player_read_items
-- Tracks which entities each player has read, enabling "new" dot indicators on player portal lists

create table player_read_items (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  campaign_id uuid        not null references campaigns(id) on delete cascade,
  entity_type text        not null,
  entity_id   uuid        not null,
  read_at     timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create trigger player_read_items_updated_at
  before update on player_read_items
  for each row execute procedure update_updated_at();

alter table player_read_items enable row level security;

create policy "player_read_items_select" on player_read_items for select using (auth.uid() = user_id);
create policy "player_read_items_insert" on player_read_items for insert with check (auth.uid() = user_id);
create policy "player_read_items_update" on player_read_items for update using (auth.uid() = user_id);
create policy "player_read_items_delete" on player_read_items for delete using (auth.uid() = user_id);
