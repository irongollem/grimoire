-- Migration: multiclass_prerequisites
-- Static table of PHB multiclass ability-score prerequisites and the limited
-- set of proficiencies granted when a character takes their first level in a
-- second (or third) class. Both are readable by all authenticated users.
--
-- A row's `require_kind` is:
--   'and' — every non-zero ability on the row must meet its threshold
--           (e.g. Monk: Dex 13 AND Wis 13).
--   'or'  — at least one non-zero ability must meet its threshold
--           (e.g. Fighter: Str 13 OR Dex 13).

create table if not exists multiclass_prerequisites (
  class_name   text primary key,
  require_kind text not null default 'and' check (require_kind in ('and', 'or')),
  str          int  not null default 0,
  dex          int  not null default 0,
  con          int  not null default 0,
  "int"        int  not null default 0,
  wis          int  not null default 0,
  cha          int  not null default 0,
  -- Proficiencies granted when taking this class as a secondary class.
  -- Not the full starting proficiencies list (PHB multiclass table).
  gained_proficiencies text[] not null default '{}'
);

alter table multiclass_prerequisites enable row level security;

create policy "multiclass_prerequisites_select" on multiclass_prerequisites
  for select using (auth.role() = 'authenticated');

-- Seed PHB values. Artificer uses Tasha's prereq (Int 13) and grants Light
-- armor + Tinker's Tools on multiclass.
insert into multiclass_prerequisites (class_name, require_kind, str, dex, con, "int", wis, cha, gained_proficiencies) values
  ('Barbarian', 'and', 13,  0, 0,  0,  0,  0, array['Shields', 'Simple Weapons', 'Martial Weapons']),
  ('Bard',      'and',  0,  0, 0,  0,  0, 13, array['Light Armor', 'One Skill of Your Choice', 'One Musical Instrument of Your Choice']),
  ('Cleric',    'and',  0,  0, 0,  0, 13,  0, array['Light Armor', 'Medium Armor', 'Shields']),
  ('Druid',     'and',  0,  0, 0,  0, 13,  0, array['Light Armor', 'Medium Armor', 'Shields (non-metal)']),
  ('Fighter',   'or',  13, 13, 0,  0,  0,  0, array['Light Armor', 'Medium Armor', 'Shields', 'Simple Weapons', 'Martial Weapons']),
  ('Monk',      'and',  0, 13, 0,  0, 13,  0, array['Simple Weapons', 'Shortswords']),
  ('Paladin',   'and', 13,  0, 0,  0,  0, 13, array['Light Armor', 'Medium Armor', 'Shields', 'Simple Weapons', 'Martial Weapons']),
  ('Ranger',    'and',  0, 13, 0,  0, 13,  0, array['Light Armor', 'Medium Armor', 'Shields', 'Simple Weapons', 'Martial Weapons', 'One Skill from the Class''s Skill List']),
  ('Rogue',     'and',  0, 13, 0,  0,  0,  0, array['Light Armor', 'One Skill from the Class''s Skill List', 'Thieves'' Tools']),
  ('Sorcerer',  'and',  0,  0, 0,  0,  0, 13, array[]::text[]),
  ('Warlock',   'and',  0,  0, 0,  0,  0, 13, array['Light Armor', 'Simple Weapons']),
  ('Wizard',    'and',  0,  0, 0, 13,  0,  0, array[]::text[]),
  ('Artificer', 'and',  0,  0, 0, 13,  0,  0, array['Light Armor', 'Medium Armor', 'Shields', 'Tinker''s Tools'])
on conflict (class_name) do update set
  require_kind = excluded.require_kind,
  str = excluded.str, dex = excluded.dex, con = excluded.con,
  "int" = excluded."int", wis = excluded.wis, cha = excluded.cha,
  gained_proficiencies = excluded.gained_proficiencies;
