create table quest_player_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  quest_id    uuid not null references quests(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  content     text not null default '',
  is_private  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- one note per player per quest
  unique (quest_id, user_id)
);

create trigger quest_player_notes_updated_at
  before update on quest_player_notes
  for each row execute procedure update_updated_at();

alter table quest_player_notes enable row level security;

-- Own note: full access
create policy "quest_player_notes_select_own" on quest_player_notes
  for select using (auth.uid() = user_id);

-- Shared notes: all campaign members can read
create policy "quest_player_notes_select_shared" on quest_player_notes
  for select using (not is_private and is_campaign_member(campaign_id));

create policy "quest_player_notes_insert" on quest_player_notes
  for insert with check (auth.uid() = user_id and is_campaign_member(campaign_id));

create policy "quest_player_notes_update" on quest_player_notes
  for update using (auth.uid() = user_id);

create policy "quest_player_notes_delete" on quest_player_notes
  for delete using (auth.uid() = user_id);
