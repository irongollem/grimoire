create table custom_subclasses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  campaign_id   uuid references campaigns,   -- null = available in all campaigns
  class_name    text not null,               -- must match an existing class name
  subclass_name text not null,

  -- { "3": ["Dread Ambusher", "Umbral Sight"], "7": ["Iron Mind"], ... }
  features      jsonb not null default '{}',

  -- [{ level, type, key, label, description?, options[], count? }]
  steps         jsonb not null default '[]',

  -- [{ key, label, rest, scaling, fixed_value?, table_values? }]
  resources     jsonb not null default '[]',

  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create trigger custom_subclasses_updated_at
  before update on custom_subclasses
  for each row execute procedure update_updated_at();

alter table custom_subclasses enable row level security;

create policy "custom_subclasses_select" on custom_subclasses for select using (auth.uid() = user_id);
create policy "custom_subclasses_insert" on custom_subclasses for insert with check (auth.uid() = user_id);
create policy "custom_subclasses_update" on custom_subclasses for update using (auth.uid() = user_id);
create policy "custom_subclasses_delete" on custom_subclasses for delete using (auth.uid() = user_id);
