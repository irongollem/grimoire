-- Migration: loot_tables
-- Treasure tables for the Dungeon Craft module (issue #121). Each table is
-- a named collection of weighted entries; every entry must reference an
-- Item Vault row by `item_id` (no free-text loot — the item is the source
-- of truth for name, rarity, image, and full detail).
--
-- Entries live in JSONB on `loot_tables.entries`. Most tables have 4–20
-- entries; JSONB makes reorder + batch edit a single update and we never
-- need to query into individual entries.

create table public.loot_tables (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name        text not null,
  description text,
  -- DMG-aligned tier so DMs can quickly group "level 1–4 hoard" etc.;
  -- 'any' for general-purpose tables.
  cr_tier     text not null default 'any'
                check (cr_tier in ('any','0-4','5-10','11-16','17+')),
  -- See src/types/lootTable.types.ts for the LootEntry shape:
  --   { id, item_id, drop_chance, dice?, fixed_qty?, notes? }
  entries     jsonb not null default '[]'::jsonb,
  tags        text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index loot_tables_user_idx     on public.loot_tables (user_id);
create index loot_tables_campaign_idx on public.loot_tables (campaign_id);

create trigger loot_tables_updated_at
  before update on public.loot_tables
  for each row execute procedure update_updated_at();

alter table public.loot_tables enable row level security;

create policy "loot_tables_select" on public.loot_tables for select using (auth.uid() = user_id);
create policy "loot_tables_insert" on public.loot_tables for insert with check (auth.uid() = user_id);
create policy "loot_tables_update" on public.loot_tables for update using (auth.uid() = user_id);
create policy "loot_tables_delete" on public.loot_tables for delete using (auth.uid() = user_id);
