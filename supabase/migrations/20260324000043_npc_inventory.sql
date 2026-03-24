create table npc_inventory (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  npc_id      uuid not null references npcs(id) on delete cascade,
  item_id     uuid references items(id) on delete set null,
  name        text not null,
  quantity    int  not null default 1,
  notes       text,
  updated_at  timestamptz not null default now()
);

create trigger npc_inventory_updated_at
  before update on npc_inventory
  for each row execute procedure update_updated_at();

alter table npc_inventory enable row level security;

create policy "npc_inventory_select" on npc_inventory for select using (auth.uid() = user_id);
create policy "npc_inventory_insert" on npc_inventory for insert with check (auth.uid() = user_id);
create policy "npc_inventory_update" on npc_inventory for update using (auth.uid() = user_id);
create policy "npc_inventory_delete" on npc_inventory for delete using (auth.uid() = user_id);
