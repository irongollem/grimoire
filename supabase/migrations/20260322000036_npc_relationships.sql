create table npc_relationships (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  campaign_id   uuid        null references campaigns(id) on delete cascade,
  npc_id        uuid        not null references npcs(id) on delete cascade,
  related_npc_id uuid       not null references npcs(id) on delete cascade,
  relationship_type text    not null,
  notes         text        null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint npc_relationships_no_self check (npc_id <> related_npc_id)
);

create trigger npc_relationships_updated_at
  before update on npc_relationships
  for each row execute procedure update_updated_at();

alter table npc_relationships enable row level security;

create policy "npc_relationships_select" on npc_relationships for select using (auth.uid() = user_id);
create policy "npc_relationships_insert" on npc_relationships for insert with check (auth.uid() = user_id);
create policy "npc_relationships_update" on npc_relationships for update using (auth.uid() = user_id);
create policy "npc_relationships_delete" on npc_relationships for delete using (auth.uid() = user_id);
