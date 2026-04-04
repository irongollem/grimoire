-- Party members can join story factions
create table faction_party_members (
  id              uuid primary key default gen_random_uuid(),
  faction_id      uuid not null references factions(id) on delete cascade,
  party_member_id uuid not null references party_members(id) on delete cascade,
  role            text,
  status          text not null default 'Active',
  user_id         uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (faction_id, party_member_id)
);

create trigger faction_party_members_updated_at
  before update on faction_party_members
  for each row execute procedure update_updated_at();

alter table faction_party_members enable row level security;

create policy "faction_party_members_select" on faction_party_members for select using (auth.uid() = user_id);
create policy "faction_party_members_insert" on faction_party_members for insert with check (auth.uid() = user_id);
create policy "faction_party_members_update" on faction_party_members for update using (auth.uid() = user_id);
create policy "faction_party_members_delete" on faction_party_members for delete using (auth.uid() = user_id);
