-- Migration: metamagic_and_ritual_policy_data
-- Single-source Metamagic identity/classification/cost and per-class ritual
-- eligibility as data. Until now the Metamagic option set and SP costs were
-- string-literaled in three casting functions plus the client, and the ritual
-- rules hardcoded class names in cast_character_spell_v4 and the client's
-- spellcastingPolicy. Both new tables are global rules config (like
-- class_spellcasting_policies): world-readable, admin-writable, consumed by
-- SECURITY DEFINER casting functions and fetched once by the client.
--
-- Deliberately NOT columns on class_spellcasting_policies: that table's row
-- existence switches five consumers (spell-change windows, delete guards,
-- level-up validation, both acquisition validators) from legacy 2014 logic to
-- table-driven 2024 semantics, so seeding 2014 rows there would be a large
-- behavior change, not a refactor.

create table public.metamagic_options (
  ruleset text not null check (ruleset in ('2014', '2024')),
  name text not null,
  -- Sorcery Point cost. cost_scaling 'spell_level' means the cost is
  -- greatest(cast slot level, sp_cost) — the original Twinned Spell rule.
  sp_cost integer not null check (sp_cost >= 1),
  cost_scaling text not null default 'fixed' check (cost_scaling in ('fixed', 'spell_level')),
  -- Post-roll options modify a cast that already happened (reactive path in
  -- cast_character_spell_v4) instead of being declared with the cast.
  post_roll boolean not null default false,
  description text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ruleset, name)
);

create trigger metamagic_options_updated_at
  before update on metamagic_options
  for each row execute procedure update_updated_at();

-- Global rules data: readable by everyone, writable by app admins only
-- (same policy shape as class_spellcasting_policies — no per-user rows).
alter table public.metamagic_options enable row level security;
create policy "metamagic_options_select" on public.metamagic_options
  for select using (true);
create policy "metamagic_options_admin_write" on public.metamagic_options
  for all using (private.is_app_admin()) with check (private.is_app_admin());

insert into public.metamagic_options (ruleset, name, sp_cost, cost_scaling, post_roll, description, sort_order) values
  ('2014', 'Careful Spell', 1, 'fixed', false, 'When you cast a spell that forces other creatures to make a saving throw, you can spend 1 Sorcery Point to choose up to your Charisma modifier number of creatures (minimum of one). A chosen creature automatically succeeds on its saving throw against the spell.', 1),
  ('2014', 'Distant Spell', 1, 'fixed', false, 'When you cast a spell that has a range of 5 feet or more, you can spend 1 Sorcery Point to double the range of the spell. When you cast a spell that has a range of Touch, you can spend 1 Sorcery Point to make the range 30 feet.', 2),
  ('2014', 'Empowered Spell', 1, 'fixed', true, 'When you roll damage for a spell, you can spend 1 Sorcery Point to reroll a number of the damage dice up to your Charisma modifier (minimum of one). You must use the new rolls. You can use Empowered Spell even if you have already used a different Metamagic option during the casting of the spell.', 3),
  ('2014', 'Extended Spell', 1, 'fixed', false, 'When you cast a spell that has a duration of 1 minute or longer, you can spend 1 Sorcery Point to double its duration, to a maximum duration of 24 hours.', 4),
  ('2014', 'Heightened Spell', 3, 'fixed', false, 'When you cast a spell that forces a creature to make a saving throw to resist its effects, you can spend 3 Sorcery Points to give one target disadvantage on its first saving throw against the spell.', 5),
  ('2014', 'Quickened Spell', 2, 'fixed', false, 'When you cast a spell that has a casting time of 1 action, you can spend 2 Sorcery Points to change the casting time to 1 bonus action for this casting.', 6),
  ('2014', 'Seeking Spell', 2, 'fixed', true, 'If you make an attack roll for a spell and miss, you can spend 2 Sorcery Points to reroll the d20, and you must use the new roll. You can use Seeking Spell even if you have already used a different Metamagic option during the casting of the spell.', 7),
  ('2014', 'Subtle Spell', 1, 'fixed', false, 'When you cast a spell, you can spend 1 Sorcery Point to cast it without any somatic or verbal components.', 8),
  ('2014', 'Transmuted Spell', 1, 'fixed', false, 'When you cast a spell that deals acid, cold, fire, lightning, poison, or thunder damage, you can spend 1 Sorcery Point to change that damage type to one of the other listed types.', 9),
  ('2014', 'Twinned Spell', 1, 'spell_level', false, 'When you cast a spell that targets only one creature and doesn''t have a range of Self, spend Sorcery Points equal to the spell''s level (minimum 1) to target a second creature in range with the same spell.', 10),
  ('2024', 'Careful Spell', 1, 'fixed', false, 'When you cast a spell that forces creatures to make a saving throw, spend 1 Sorcery Point and choose up to your Charisma modifier number of creatures (minimum one). They automatically succeed and take no damage if a successful save would normally halve the damage.', 1),
  ('2024', 'Distant Spell', 1, 'fixed', false, 'When you cast a spell that has a range of 5 feet or more, you can spend 1 Sorcery Point to double the range of the spell. When you cast a spell that has a range of Touch, you can spend 1 Sorcery Point to make the range 30 feet.', 2),
  ('2024', 'Empowered Spell', 1, 'fixed', true, 'When you roll damage for a spell, you can spend 1 Sorcery Point to reroll a number of the damage dice up to your Charisma modifier (minimum of one). You must use the new rolls. You can use Empowered Spell even if you have already used a different Metamagic option during the casting of the spell.', 3),
  ('2024', 'Extended Spell', 1, 'fixed', false, 'When you cast a spell with a duration of 1 minute or longer, spend 1 Sorcery Point to double its duration, up to 24 hours. You also have advantage on saves made to maintain concentration on that spell.', 4),
  ('2024', 'Heightened Spell', 2, 'fixed', false, 'When you cast a spell that forces a creature to make a saving throw, spend 2 Sorcery Points to give one target disadvantage on its saving throws against the spell.', 5),
  ('2024', 'Quickened Spell', 2, 'fixed', false, 'When you cast a spell with a casting time of an action, spend 2 Sorcery Points to make it a bonus action. You can''t use this after casting a level 1+ spell this turn, and can''t cast another level 1+ spell afterward that turn.', 6),
  ('2024', 'Seeking Spell', 1, 'fixed', true, 'If you miss with a spell attack roll, spend 1 Sorcery Point to reroll the d20 and use the new roll. You can use Seeking Spell even if another Metamagic option was used for the spell.', 7),
  ('2024', 'Subtle Spell', 1, 'fixed', false, 'When you cast a spell, spend 1 Sorcery Point to cast it without verbal, somatic, or material components, except material components that are consumed or have a cost specified by the spell.', 8),
  ('2024', 'Transmuted Spell', 1, 'fixed', false, 'When you cast a spell that deals acid, cold, fire, lightning, poison, or thunder damage, you can spend 1 Sorcery Point to change that damage type to one of the other listed types.', 9),
  ('2024', 'Twinned Spell', 1, 'fixed', false, 'When you cast a spell that can be cast with a higher-level slot to target one additional creature, spend 1 Sorcery Point to increase the spell''s effective level by 1 for that purpose.', 10);

-- Per-class ritual-casting eligibility, keyed like class_spellcasting_policies.
-- Styles:
--   none                  — the class cannot ritual-cast at all
--   prepared              — ritual-tagged spell must be prepared (or always prepared)
--   known                 — any acquired ritual-tagged spell qualifies (2014 Bard)
--   spellbook             — must be in the spellbook (is_known), preparation irrelevant (2014 Wizard)
--   spellbook_or_prepared — in the spellbook OR prepared (2024 Wizard: edition default plus Ritual Adept)
-- Classes without a row fall back to the edition default: 2024 → 'prepared'
-- (ritual casting is a property of having the spell prepared), 2014 → 'none'
-- (only the classes listed below have the Ritual Casting feature).
create table public.class_ritual_policies (
  ruleset text not null check (ruleset in ('2014', '2024')),
  class_name text not null,
  ritual_style text not null check (ritual_style in ('none', 'prepared', 'known', 'spellbook', 'spellbook_or_prepared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ruleset, class_name)
);

create trigger class_ritual_policies_updated_at
  before update on class_ritual_policies
  for each row execute procedure update_updated_at();

alter table public.class_ritual_policies enable row level security;
create policy "class_ritual_policies_select" on public.class_ritual_policies
  for select using (true);
create policy "class_ritual_policies_admin_write" on public.class_ritual_policies
  for all using (private.is_app_admin()) with check (private.is_app_admin());

insert into public.class_ritual_policies (ruleset, class_name, ritual_style) values
  ('2014', 'Artificer', 'prepared'),
  ('2014', 'Bard', 'known'),
  ('2014', 'Cleric', 'prepared'),
  ('2014', 'Druid', 'prepared'),
  ('2014', 'Paladin', 'none'),
  ('2014', 'Ranger', 'none'),
  ('2014', 'Sorcerer', 'none'),
  ('2014', 'Warlock', 'none'),
  ('2014', 'Wizard', 'spellbook'),
  ('2024', 'Bard', 'prepared'),
  ('2024', 'Cleric', 'prepared'),
  ('2024', 'Druid', 'prepared'),
  ('2024', 'Paladin', 'prepared'),
  ('2024', 'Ranger', 'prepared'),
  ('2024', 'Sorcerer', 'prepared'),
  ('2024', 'Warlock', 'prepared'),
  ('2024', 'Wizard', 'spellbook_or_prepared');
