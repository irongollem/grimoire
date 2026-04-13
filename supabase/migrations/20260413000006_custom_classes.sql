create table custom_classes (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users not null,
  campaign_id          uuid references campaigns,
  class_name           text not null,

  -- Core identity
  hit_die              int not null default 8,
  primary_ability      text,
  saving_throws        text[] not null default '{}',
  armor_proficiencies  text[] not null default '{}',
  weapon_proficiencies text[] not null default '{}',
  subclass_level       int not null default 3,

  -- Feature UUIDs grouped by level: { "1": ["<uuid>"], "3": ["<uuid>"] }
  features             jsonb not null default '{}',

  -- ASI levels (default 4/8/12/16/19)
  asi_levels           int[] not null default '{4,8,12,16,19}',

  -- Spell slots: null = non-spellcaster; jsonb array of 20 SpellSlotEntry arrays
  spell_slots          jsonb,

  -- Wizard steps (same shape as CustomStep in custom_subclasses)
  steps                jsonb not null default '[]',

  -- Resource pools (same shape as CustomResource in custom_subclasses)
  resources            jsonb not null default '[]',

  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create trigger custom_classes_updated_at
  before update on custom_classes
  for each row execute procedure update_updated_at();

alter table custom_classes enable row level security;

create policy "custom_classes_select" on custom_classes for select using (auth.uid() = user_id);
create policy "custom_classes_insert" on custom_classes for insert with check (auth.uid() = user_id);
create policy "custom_classes_update" on custom_classes for update using (auth.uid() = user_id);
create policy "custom_classes_delete" on custom_classes for delete using (auth.uid() = user_id);
