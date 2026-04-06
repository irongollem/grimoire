-- Extend location_type_enum with commerce-focused building sub-types
alter type location_type_enum add value 'store';
alter type location_type_enum add value 'tavern';
alter type location_type_enum add value 'inn';

-- Add inventory-sharing flag to locations (needed by store_items RLS policy below)
alter table locations
  add column is_inventory_shared boolean not null default false;

create table store_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  location_id  uuid not null references locations(id) on delete cascade,
  item_id      uuid not null references items(id) on delete cascade,
  price_override text null,
  visible      boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger store_items_updated_at
  before update on store_items
  for each row execute procedure update_updated_at();

alter table store_items enable row level security;

create policy "store_items_select" on store_items for select using (auth.uid() = user_id);
create policy "store_items_insert" on store_items for insert with check (auth.uid() = user_id);
create policy "store_items_update" on store_items for update using (auth.uid() = user_id);
create policy "store_items_delete" on store_items for delete using (auth.uid() = user_id);

-- Campaign members can read visible items for shared locations.
create policy "store_items_campaign_member_select" on store_items
  for select using (
    exists (
      select 1 from locations l
        join campaign_members cm on cm.campaign_id = l.campaign_id
       where l.id = store_items.location_id
         and cm.user_id = auth.uid()
         and (l.shared_with_players = true or l.player_visible_to is not null)
         and l.is_inventory_shared = true
         and store_items.visible = true
    )
  );
