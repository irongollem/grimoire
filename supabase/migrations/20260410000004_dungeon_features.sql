-- Dungeon Craft: dungeon features (secret doors, hidden passages, chests, etc.)

create table dungeon_features (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users not null,
  name                  text not null,
  feature_type          text not null default 'Secret Door',
  description           text,
  perception_dc         int,
  investigation_dc      int,
  arcana_dc             int,
  trigger_type          text,
  trigger_description   text,
  contents_description  text,
  image_url             text,
  image_focal_point     jsonb,
  tags                  text[] not null default '{}',
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger dungeon_features_updated_at
  before update on dungeon_features
  for each row execute procedure update_updated_at();

alter table dungeon_features enable row level security;

create policy "dungeon_features_select" on dungeon_features for select using (auth.uid() = user_id);
create policy "dungeon_features_insert" on dungeon_features for insert with check (auth.uid() = user_id);
create policy "dungeon_features_update" on dungeon_features for update using (auth.uid() = user_id);
create policy "dungeon_features_delete" on dungeon_features for delete using (auth.uid() = user_id);
