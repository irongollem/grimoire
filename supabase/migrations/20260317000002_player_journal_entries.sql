create table player_journal_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  title       text,
  content     text not null default '',
  category    text not null default 'adventure',
  tags        text[] not null default '{}',
  is_private  boolean not null default true,
  -- optional link to a game entity
  ref_type    text,   -- 'quest' | 'npc' | 'location' | 'item' | 'monster' | 'encounter'
  ref_id      uuid,
  ref_label   text,   -- cached display name, avoids joins on list view
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger player_journal_entries_updated_at
  before update on player_journal_entries
  for each row execute procedure update_updated_at();

alter table player_journal_entries enable row level security;

-- Own entries: full access
create policy "player_journal_entries_select_own" on player_journal_entries
  for select using (auth.uid() = user_id);

-- Shared entries: all campaign members can read
create policy "player_journal_entries_select_shared" on player_journal_entries
  for select using (not is_private and is_campaign_member(campaign_id));

create policy "player_journal_entries_insert" on player_journal_entries
  for insert with check (auth.uid() = user_id and is_campaign_member(campaign_id));

create policy "player_journal_entries_update" on player_journal_entries
  for update using (auth.uid() = user_id);

create policy "player_journal_entries_delete" on player_journal_entries
  for delete using (auth.uid() = user_id);
