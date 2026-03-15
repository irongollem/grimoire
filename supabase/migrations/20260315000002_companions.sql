-- Companions: familiars, animal companions, mounts, allies, sidekicks
-- Backed by existing monster/NPC records for stat blocks.

create type companion_type as enum ('familiar', 'animal_companion', 'mount', 'ally', 'sidekick');
create type companion_source_type as enum ('monster', 'npc', 'custom');

create table companions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  campaign_id          uuid references campaigns(id) on delete cascade,
  name                 text not null default '',
  companion_type       companion_type not null default 'ally',
  source_type          companion_source_type not null default 'custom',
  source_monster_id    text,  -- text not uuid: SRD monsters use slug IDs, not UUIDs
  source_npc_id        uuid references npcs(id) on delete set null,
  owner_party_member_id uuid references party_members(id) on delete set null,
  max_hp               integer not null default 1,
  current_hp           integer not null default 1,
  ac                   integer not null default 10,
  speed                integer not null default 30,
  conditions           text[] not null default '{}',
  notes                text,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- updated_at trigger
create trigger companions_updated_at
  before update on companions
  for each row execute procedure update_updated_at();

-- RLS
alter table companions enable row level security;

create policy "companions_select" on companions
  for select using (auth.uid() = user_id);

create policy "companions_insert" on companions
  for insert with check (auth.uid() = user_id);

create policy "companions_update" on companions
  for update using (auth.uid() = user_id);

create policy "companions_delete" on companions
  for delete using (auth.uid() = user_id);
