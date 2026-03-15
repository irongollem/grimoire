-- Quests: quest log with objectives, related entities, and sub-quests

create type quest_status_enum as enum ('active', 'on_hold', 'completed', 'failed');

create table quests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  campaign_id     uuid references campaigns(id) on delete cascade,
  parent_quest_id uuid references quests(id) on delete set null,
  title           text not null default '',
  summary         text,
  status          quest_status_enum not null default 'active',
  giver_npc_id    uuid references npcs(id) on delete set null,
  location_id     uuid references locations(id) on delete set null,
  rewards         text,
  tags            text[] not null default '{}',
  notes           text,        -- Tiptap JSON
  started_at      text,        -- in-world calendar date string
  resolved_at     text,        -- in-world calendar date string
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table quests enable row level security;

create policy "Users can read own quests"
  on quests for select
  using (auth.uid() = user_id);

create policy "Users can insert own quests"
  on quests for insert
  with check (auth.uid() = user_id);

create policy "Users can update own quests"
  on quests for update
  using (auth.uid() = user_id);

create policy "Users can delete own quests"
  on quests for delete
  using (auth.uid() = user_id);

create trigger set_quests_updated_at
  before update on quests
  for each row execute function update_updated_at();

-- Objectives: ordered checklist items per quest

create table quest_objectives (
  id          uuid primary key default gen_random_uuid(),
  quest_id    uuid not null references quests(id) on delete cascade,
  description text not null default '',
  is_done     boolean not null default false,
  sort_order  integer not null default 0
);

alter table quest_objectives enable row level security;

create policy "Users can read objectives of own quests"
  on quest_objectives for select
  using (exists (select 1 from quests where id = quest_id and auth.uid() = user_id));

create policy "Users can insert objectives to own quests"
  on quest_objectives for insert
  with check (exists (select 1 from quests where id = quest_id and auth.uid() = user_id));

create policy "Users can update objectives of own quests"
  on quest_objectives for update
  using (exists (select 1 from quests where id = quest_id and auth.uid() = user_id));

create policy "Users can delete objectives of own quests"
  on quest_objectives for delete
  using (exists (select 1 from quests where id = quest_id and auth.uid() = user_id));

-- Quest refs: polymorphic links to NPCs, locations, monsters, items

create table quest_refs (
  id       uuid primary key default gen_random_uuid(),
  quest_id uuid not null references quests(id) on delete cascade,
  ref_type text not null check (ref_type in ('npc', 'location', 'monster', 'item', 'encounter')),
  ref_id   uuid not null,
  unique (quest_id, ref_type, ref_id)
);

alter table quest_refs enable row level security;

create policy "Users can read refs of own quests"
  on quest_refs for select
  using (exists (select 1 from quests where id = quest_id and auth.uid() = user_id));

create policy "Users can insert refs to own quests"
  on quest_refs for insert
  with check (exists (select 1 from quests where id = quest_id and auth.uid() = user_id));

create policy "Users can delete refs of own quests"
  on quest_refs for delete
  using (exists (select 1 from quests where id = quest_id and auth.uid() = user_id));
