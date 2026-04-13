-- system_classes: read-only SRD class templates visible to all authenticated users.
-- These serve as starting points that DMs can duplicate into custom_classes.
-- No user_id column. Service role inserts the seed; users can only SELECT.

create table system_classes (
  id                   uuid primary key default gen_random_uuid(),
  class_name           text not null unique,
  hit_die              smallint not null,
  primary_ability      text,
  saving_throws        text[] not null default '{}',
  armor_proficiencies  text[] not null default '{}',
  weapon_proficiencies text[] not null default '{}',
  subclass_level       smallint not null default 3,
  features             jsonb not null default '{}',
  asi_levels           smallint[] not null default '{4,8,12,16,19}',
  spell_slots          jsonb,
  spells_known         jsonb,
  slot_recovery        text not null default 'long',
  steps                jsonb not null default '[]',
  resources            jsonb not null default '[]',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger system_classes_updated_at
  before update on system_classes
  for each row execute procedure update_updated_at();

alter table system_classes enable row level security;

-- All authenticated users can read system classes
create policy "system_classes_select" on system_classes
  for select using (auth.role() = 'authenticated');

-- Only the service role (bypasses RLS) can insert/update/delete —
-- no user-facing mutation policies intentionally.

-- ─── Seed: 13 SRD classes ────────────────────────────────────────────────────

insert into system_classes (
  class_name, hit_die, primary_ability,
  saving_throws, armor_proficiencies, weapon_proficiencies,
  subclass_level, asi_levels,
  spell_slots, spells_known, slot_recovery,
  steps, resources
) values

-- ── Barbarian ────────────────────────────────────────────────────────────────
(
  'Barbarian', 12, 'Strength',
  array['Strength','Constitution'],
  array['Light armor','Medium armor','Shields'],
  array['Simple weapons','Martial weapons'],
  3,
  '{4,8,12,16,19}'::smallint[],
  null, null, 'long',
  '[]'::jsonb,
  '[
    {"key":"rage_uses","label":"Rage Uses","rest":"long","scaling":"table",
     "table_values":[2,2,3,3,3,4,4,4,4,4,4,5,5,5,5,5,6,6,6,99]}
  ]'::jsonb
),

-- ── Bard ─────────────────────────────────────────────────────────────────────
(
  'Bard', 8, 'Charisma',
  array['Dexterity','Charisma'],
  array['Light armor'],
  array['Simple weapons','Hand crossbows','Longswords','Rapiers','Shortswords'],
  3,
  '{4,8,12,16,19}'::smallint[],
  '[[2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]]'::jsonb,
  '[4,5,6,7,8,9,10,11,12,14,15,15,16,18,19,19,20,22,22,22]'::jsonb,
  'long',
  '[]'::jsonb,
  '[]'::jsonb
),

-- ── Cleric ───────────────────────────────────────────────────────────────────
(
  'Cleric', 8, 'Wisdom',
  array['Wisdom','Charisma'],
  array['Light armor','Medium armor','Shields'],
  array['Simple weapons'],
  1,
  '{4,8,12,16,19}'::smallint[],
  '[[2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]]'::jsonb,
  null, 'long',
  '[]'::jsonb,
  '[
    {"key":"channel_divinity","label":"Channel Divinity","rest":"short","scaling":"table",
     "table_values":[1,1,1,1,1,2,2,2,2,2,2,2,2,2,3,3,3,3,3,3]}
  ]'::jsonb
),

-- ── Druid ────────────────────────────────────────────────────────────────────
(
  'Druid', 8, 'Wisdom',
  array['Intelligence','Wisdom'],
  array['Light armor','Medium armor','Shields'],
  array['Clubs','Daggers','Darts','Javelins','Maces','Quarterstaffs','Scimitars','Sickles','Slings','Spears'],
  2,
  '{4,8,12,16,19}'::smallint[],
  '[[2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]]'::jsonb,
  null, 'long',
  '[]'::jsonb,
  '[]'::jsonb
),

-- ── Fighter ──────────────────────────────────────────────────────────────────
(
  'Fighter', 10, 'Strength or Dexterity',
  array['Strength','Constitution'],
  array['All armor','Shields'],
  array['Simple weapons','Martial weapons'],
  3,
  '{4,6,8,12,14,16,19}'::smallint[],
  null, null, 'long',
  '[]'::jsonb,
  '[]'::jsonb
),

-- ── Monk ─────────────────────────────────────────────────────────────────────
(
  'Monk', 8, 'Dexterity and Wisdom',
  array['Strength','Dexterity'],
  array[]::text[],
  array['Simple weapons','Shortswords'],
  3,
  '{4,8,12,16,19}'::smallint[],
  null, null, 'long',
  '[]'::jsonb,
  '[
    {"key":"ki_points","label":"Ki Points","rest":"short","scaling":"per_level"}
  ]'::jsonb
),

-- ── Paladin ──────────────────────────────────────────────────────────────────
(
  'Paladin', 10, 'Strength and Charisma',
  array['Wisdom','Charisma'],
  array['All armor','Shields'],
  array['Simple weapons','Martial weapons'],
  3,
  '{4,8,12,16,19}'::smallint[],
  '[[0,0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,0,0,0,0]]'::jsonb,
  null, 'long',
  '[]'::jsonb,
  '[
    {"key":"lay_on_hands","label":"Lay on Hands HP","rest":"long","scaling":"table",
     "table_values":[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100]},
    {"key":"channel_divinity","label":"Channel Divinity","rest":"short","scaling":"fixed",
     "fixed_value":1}
  ]'::jsonb
),

-- ── Ranger ───────────────────────────────────────────────────────────────────
(
  'Ranger', 10, 'Dexterity and Wisdom',
  array['Strength','Dexterity'],
  array['Light armor','Medium armor','Shields'],
  array['Simple weapons','Martial weapons'],
  3,
  '{4,8,12,16,19}'::smallint[],
  '[[0,0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,0,0,0,0]]'::jsonb,
  '[0,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11]'::jsonb,
  'long',
  '[]'::jsonb,
  '[]'::jsonb
),

-- ── Rogue ────────────────────────────────────────────────────────────────────
(
  'Rogue', 8, 'Dexterity',
  array['Dexterity','Intelligence'],
  array['Light armor'],
  array['Simple weapons','Hand crossbows','Longswords','Rapiers','Shortswords'],
  3,
  '{4,8,10,12,16,19}'::smallint[],
  null, null, 'long',
  '[]'::jsonb,
  '[]'::jsonb
),

-- ── Sorcerer ─────────────────────────────────────────────────────────────────
(
  'Sorcerer', 6, 'Charisma',
  array['Constitution','Charisma'],
  array[]::text[],
  array['Daggers','Darts','Slings','Quarterstaffs','Light crossbows'],
  1,
  '{4,8,12,16,19}'::smallint[],
  '[[2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]]'::jsonb,
  '[2,3,4,5,6,7,8,9,10,11,12,12,13,13,14,14,15,15,15,15]'::jsonb,
  'long',
  '[]'::jsonb,
  '[
    {"key":"sorcery_points","label":"Sorcery Points","rest":"long","scaling":"per_level"}
  ]'::jsonb
),

-- ── Warlock ──────────────────────────────────────────────────────────────────
-- Pact magic slots: all slots are the same level, recovered on short rest.
-- Represented as a 20×9 grid where only one column per row is non-zero.
(
  'Warlock', 8, 'Charisma',
  array['Wisdom','Charisma'],
  array['Light armor'],
  array['Simple weapons'],
  1,
  '{4,8,12,16,19}'::smallint[],
  '[[1,0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0,0],[0,2,0,0,0,0,0,0,0],[0,2,0,0,0,0,0,0,0],[0,0,2,0,0,0,0,0,0],[0,0,2,0,0,0,0,0,0],[0,0,0,2,0,0,0,0,0],[0,0,0,2,0,0,0,0,0],[0,0,0,0,2,0,0,0,0],[0,0,0,0,2,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,4,0,0,0,0],[0,0,0,0,4,0,0,0,0],[0,0,0,0,4,0,0,0,0],[0,0,0,0,4,0,0,0,0]]'::jsonb,
  '[2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15]'::jsonb,
  'short',
  '[]'::jsonb,
  '[]'::jsonb
),

-- ── Wizard ───────────────────────────────────────────────────────────────────
(
  'Wizard', 6, 'Intelligence',
  array['Intelligence','Wisdom'],
  array[]::text[],
  array['Daggers','Darts','Slings','Quarterstaffs','Light crossbows'],
  2,
  '{4,8,12,16,19}'::smallint[],
  '[[2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]]'::jsonb,
  null, 'long',
  '[]'::jsonb,
  '[]'::jsonb
),

-- ── Artificer ────────────────────────────────────────────────────────────────
-- Half-caster that rounds UP (slots at level 1, 2nd-level slots at class level 3).
(
  'Artificer', 8, 'Intelligence',
  array['Constitution','Intelligence'],
  array['Light armor','Medium armor','Shields'],
  array['Simple weapons','Hand crossbows','Heavy crossbows','Light crossbows'],
  3,
  '{4,8,12,16,19}'::smallint[],
  '[[2,0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0,0],[3,2,0,0,0,0,0,0,0],[3,2,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,0,0,0,0]]'::jsonb,
  null, 'long',
  '[]'::jsonb,
  '[]'::jsonb
);
