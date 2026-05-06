-- Migration: credit_pricing_config
-- Admin-editable tables for credit pack configuration and per-generation credit costs.

-- ── Credit pack configuration ──────────────────────────────────────────────

create table credit_pack_config (
  pack_id     text primary key,
  label       text not null,
  credits     integer not null check (credits > 0),
  eur_display numeric(10,2) not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger credit_pack_config_updated_at
  before update on credit_pack_config
  for each row execute procedure update_updated_at();

alter table credit_pack_config enable row level security;

create policy "credit_pack_config_select" on credit_pack_config
  for select using (auth.uid() is not null);

create policy "credit_pack_config_update" on credit_pack_config
  for update using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into credit_pack_config (pack_id, label, credits, eur_display, sort_order) values
  ('starter',  'Starter',  15, 5,  1),
  ('standard', 'Standard', 35, 10, 2),
  ('bulk',     'Bulk',     80, 20, 3);

-- ── Per-generation credit costs ────────────────────────────────────────────

create table ai_generation_credit_costs (
  generation_type text primary key,
  label           text not null,
  credit_cost     integer not null check (credit_cost >= 0),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger ai_generation_credit_costs_updated_at
  before update on ai_generation_credit_costs
  for each row execute procedure update_updated_at();

alter table ai_generation_credit_costs enable row level security;

create policy "ai_generation_credit_costs_select" on ai_generation_credit_costs
  for select using (auth.uid() is not null);

create policy "ai_generation_credit_costs_update" on ai_generation_credit_costs
  for update using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('portrait',            'NPC Portrait',          2,  1),
  ('npc_text',            'NPC (text)',             1,  2),
  ('monster_stat_block',  'Monster Stat Block',    1,  3),
  ('item_generation',     'Item Generation',       1,  4),
  ('spell_generation',    'Spell Generation',      1,  5),
  ('trap_generation',     'Trap Generation',       1,  6),
  ('location_generation', 'Location Generation',   1,  7),
  ('faction_generation',  'Faction Generation',    1,  8),
  ('puzzle_generation',   'Puzzle Generation',     1,  9),
  ('quest_generation',    'Quest Generation',      1, 10),
  ('chronicle_text',      'Chronicle (text)',      1, 11),
  ('chronicle_image',     'Chronicle (image)',     2, 12);
