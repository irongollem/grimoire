-- Migration: deities
-- Creates pantheons and deities tables for the Religion / Pantheons module

-- ── Pantheons ─────────────────────────────────────────────────────────────────
create table pantheons (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,

  name         text not null,
  description  text,                   -- Tiptap JSON
  emblem_url   text,                   -- pantheon emblem / banner art

  tags         text[] not null default '{}',
  player_visible_to uuid[] not null default '{}',

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger pantheons_updated_at
  before update on pantheons
  for each row execute procedure update_updated_at();

alter table pantheons enable row level security;

create policy "pantheons_select" on pantheons for select using (auth.uid() = user_id);
create policy "pantheons_insert" on pantheons for insert with check (auth.uid() = user_id);
create policy "pantheons_update" on pantheons for update using (auth.uid() = user_id);
create policy "pantheons_delete" on pantheons for delete using (auth.uid() = user_id);

-- ── Deities ───────────────────────────────────────────────────────────────────
create table deities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,

  name         text not null,
  titles       text,                   -- epithets, e.g. "The Morninglord, Lord of Dawn"
  alternate_names text[] not null default '{}', -- known by different names in different cultures
  pantheon_id  uuid references pantheons(id) on delete set null,

  alignment    text,
  symbol       text,                   -- text description of holy symbol
  symbol_image_url text,               -- image of holy symbol / icon

  -- Divine avatar / physical manifestation
  portrait_url         text,
  portrait_focal_point jsonb,          -- { x: number, y: number } percentages

  domains      text[] not null default '{}', -- cleric domains (multi-value)
  portfolio    text,                   -- what the deity governs

  description  text,                   -- Tiptap JSON lore block
  dm_notes     text,                   -- Tiptap JSON DM secrets block

  tags         text[] not null default '{}',
  player_visible_to uuid[] not null default '{}',

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger deities_updated_at
  before update on deities
  for each row execute procedure update_updated_at();

alter table deities enable row level security;

create policy "deities_select" on deities for select using (auth.uid() = user_id);
create policy "deities_insert" on deities for insert with check (auth.uid() = user_id);
create policy "deities_update" on deities for update using (auth.uid() = user_id);
create policy "deities_delete" on deities for delete using (auth.uid() = user_id);
