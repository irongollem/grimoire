-- Migration: roll_tables
-- Wandering monster / random encounter d4–d100 tables for the Dungeon Craft
-- module (issue #120). Each table is a named collection of weighted entries
-- referencing encounters from the Bestiary's encounters table — entries can
-- also fall back to a free-text label when the DM hasn't built an Encounter
-- entity for that result yet.

create table public.roll_tables (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name        text not null,
  description text,
  -- Locked to the supported die sizes — anything else can't be evenly diced
  -- with rollDice() and would just need a custom UI.
  dice        text not null check (dice in ('1d4','1d6','1d8','1d10','1d12','1d20','1d100')),
  -- Array of RollTableEntry — see src/types/rollTable.types.ts. Validated
  -- client-side; storing as JSONB keeps row count small (most tables have
  -- 4–20 entries) and makes reordering / batch-edits a single update.
  entries     jsonb not null default '[]'::jsonb,
  tags        text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index roll_tables_user_idx     on public.roll_tables (user_id);
create index roll_tables_campaign_idx on public.roll_tables (campaign_id);

create trigger roll_tables_updated_at
  before update on public.roll_tables
  for each row execute procedure update_updated_at();

alter table public.roll_tables enable row level security;

create policy "roll_tables_select" on public.roll_tables for select using (auth.uid() = user_id);
create policy "roll_tables_insert" on public.roll_tables for insert with check (auth.uid() = user_id);
create policy "roll_tables_update" on public.roll_tables for update using (auth.uid() = user_id);
create policy "roll_tables_delete" on public.roll_tables for delete using (auth.uid() = user_id);
