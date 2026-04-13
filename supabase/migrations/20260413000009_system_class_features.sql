-- Seed SRD class feature names into class_features and link them into system_classes.features.
--
-- Approach:
--   1. Make user_id nullable so system features can have user_id = null
--   2. Add partial unique index on name for system rows (prevents duplicates on re-run)
--   3. Expand the SELECT policy to also expose system features (user_id IS NULL)
--   4. Insert all SRD feature names (ON CONFLICT DO NOTHING = idempotent)
--   5. UPDATE each system_classes.features with UUIDs resolved by name

-- ── 1. Make user_id nullable ──────────────────────────────────────────────────
alter table class_features alter column user_id drop not null;

-- ── 2. Partial unique index so system feature names can't duplicate ────────────
create unique index class_features_system_name_unique
  on class_features (name) where user_id is null;

-- ── 3. Expand SELECT policy ───────────────────────────────────────────────────
drop policy "class_features_select" on class_features;
create policy "class_features_select" on class_features
  for select using (auth.uid() = user_id or user_id is null);

-- ── 4. Seed SRD feature names ─────────────────────────────────────────────────
-- user_id = null marks these as system-owned (globally readable, not editable by users).
-- feature_type = 'passive' for all — users can edit individual entries later.
-- tags encode the class name(s) for discoverability in the Abilities compendium.

insert into class_features (user_id, name, feature_type, source, tags) values

-- Barbarian
  (null, 'Rage (2 uses, +2 dmg)',           'active',  'srd-5.1', '{barbarian}'),
  (null, 'Unarmored Defense (10+DEX+CON)',   'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Reckless Attack',                  'active',  'srd-5.1', '{barbarian}'),
  (null, 'Danger Sense',                     'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Primal Path',                      'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Extra Attack',                     'passive', 'srd-5.1', '{barbarian,fighter,monk,paladin,ranger}'),
  (null, 'Fast Movement',                    'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Path feature',                     'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Rage (4 uses)',                    'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Feral Instinct',                   'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Brutal Critical (1 die)',          'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Rage damage +3',                   'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Relentless Rage',                  'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Rage (5 uses)',                    'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Brutal Critical (2 dice)',         'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Persistent Rage',                  'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Rage damage +4',                   'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Brutal Critical (3 dice)',         'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Rage (6 uses)',                    'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Indomitable Might',                'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Primal Champion (+4 STR, +4 CON)', 'passive', 'srd-5.1', '{barbarian}'),
  (null, 'Rage (unlimited)',                 'passive', 'srd-5.1', '{barbarian}'),

-- Bard
  (null, 'Spellcasting',                              'passive', 'srd-5.1', '{bard,cleric,druid,paladin,ranger,sorcerer}'),
  (null, 'Bardic Inspiration (d6, CHA mod/rest)',     'active',  'srd-5.1', '{bard}'),
  (null, 'Jack of All Trades',                        'passive', 'srd-5.1', '{bard}'),
  (null, 'Song of Rest (d6)',                         'passive', 'srd-5.1', '{bard}'),
  (null, 'Bard College',                              'passive', 'srd-5.1', '{bard}'),
  (null, 'Expertise (×2 skills)',                     'passive', 'srd-5.1', '{bard,rogue}'),
  (null, 'Bardic Inspiration (d8, short rest recharge)', 'active', 'srd-5.1', '{bard}'),
  (null, 'Font of Inspiration',                       'passive', 'srd-5.1', '{bard}'),
  (null, 'Countercharm',                              'active',  'srd-5.1', '{bard}'),
  (null, 'Bard College feature',                      'passive', 'srd-5.1', '{bard}'),
  (null, 'Song of Rest (d8)',                         'passive', 'srd-5.1', '{bard}'),
  (null, 'Bardic Inspiration (d10)',                  'passive', 'srd-5.1', '{bard}'),
  (null, 'Expertise (×2 more skills)',                'passive', 'srd-5.1', '{bard,rogue}'),
  (null, 'Magical Secrets (2 spells from any list)',  'passive', 'srd-5.1', '{bard}'),
  (null, 'Song of Rest (d10)',                        'passive', 'srd-5.1', '{bard}'),
  (null, 'Magical Secrets (2 more spells)',           'passive', 'srd-5.1', '{bard}'),
  (null, 'Bardic Inspiration (d12)',                  'passive', 'srd-5.1', '{bard}'),
  (null, 'Song of Rest (d12)',                        'passive', 'srd-5.1', '{bard}'),
  (null, 'Superior Inspiration',                      'passive', 'srd-5.1', '{bard}'),

-- Cleric
  (null, 'Divine Domain',                    'passive', 'srd-5.1', '{cleric}'),
  (null, 'Channel Divinity (1/rest)',         'active',  'srd-5.1', '{cleric}'),
  (null, 'Divine Domain feature',            'passive', 'srd-5.1', '{cleric}'),
  (null, 'Destroy Undead (CR ½)',            'active',  'srd-5.1', '{cleric}'),
  (null, 'Channel Divinity (2/rest)',         'passive', 'srd-5.1', '{cleric}'),
  (null, 'Destroy Undead (CR 1)',            'active',  'srd-5.1', '{cleric}'),
  (null, 'Divine Intervention',              'active',  'srd-5.1', '{cleric}'),
  (null, 'Destroy Undead (CR 2)',            'active',  'srd-5.1', '{cleric}'),
  (null, 'Destroy Undead (CR 3)',            'active',  'srd-5.1', '{cleric}'),
  (null, 'Destroy Undead (CR 4)',            'active',  'srd-5.1', '{cleric}'),
  (null, 'Channel Divinity (3/rest)',         'passive', 'srd-5.1', '{cleric}'),
  (null, 'Divine Intervention improvement',  'passive', 'srd-5.1', '{cleric}'),

-- Druid
  (null, 'Druidic',                          'passive', 'srd-5.1', '{druid}'),
  (null, 'Wild Shape (CR ¼, no swim/fly)',   'active',  'srd-5.1', '{druid}'),
  (null, 'Druid Circle',                     'passive', 'srd-5.1', '{druid}'),
  (null, 'Wild Shape (CR ½, no fly)',        'passive', 'srd-5.1', '{druid}'),
  (null, 'Druid Circle feature',             'passive', 'srd-5.1', '{druid}'),
  (null, 'Wild Shape (CR 1)',                'passive', 'srd-5.1', '{druid}'),
  (null, 'Timeless Body',                    'passive', 'srd-5.1', '{druid,monk}'),
  (null, 'Beast Spells',                     'passive', 'srd-5.1', '{druid}'),
  (null, 'Archdruid',                        'passive', 'srd-5.1', '{druid}'),

-- Fighter
  (null, 'Fighting Style',                   'passive', 'srd-5.1', '{fighter,paladin,ranger}'),
  (null, 'Second Wind',                      'active',  'srd-5.1', '{fighter}'),
  (null, 'Action Surge (1 use)',             'active',  'srd-5.1', '{fighter}'),
  (null, 'Martial Archetype',               'passive', 'srd-5.1', '{fighter}'),
  (null, 'Archetype feature',               'passive', 'srd-5.1', '{fighter,ranger,rogue}'),
  (null, 'Indomitable (1 use)',              'active',  'srd-5.1', '{fighter}'),
  (null, 'Extra Attack (2)',                 'passive', 'srd-5.1', '{fighter}'),
  (null, 'Indomitable (2 uses)',             'passive', 'srd-5.1', '{fighter}'),
  (null, 'Action Surge (2 uses)',            'passive', 'srd-5.1', '{fighter}'),
  (null, 'Indomitable (3 uses)',             'passive', 'srd-5.1', '{fighter}'),
  (null, 'Extra Attack (3)',                 'passive', 'srd-5.1', '{fighter}'),

-- Monk
  (null, 'Unarmored Defense (10+DEX+WIS)',   'passive', 'srd-5.1', '{monk}'),
  (null, 'Martial Arts (1d4)',               'passive', 'srd-5.1', '{monk}'),
  (null, 'Ki (2 points)',                    'active',  'srd-5.1', '{monk}'),
  (null, 'Unarmored Movement (+10 ft)',      'passive', 'srd-5.1', '{monk}'),
  (null, 'Monastic Tradition',              'passive', 'srd-5.1', '{monk}'),
  (null, 'Deflect Missiles',                'reaction','srd-5.1', '{monk}'),
  (null, 'Slow Fall',                       'reaction','srd-5.1', '{monk}'),
  (null, 'Stunning Strike',                 'active',  'srd-5.1', '{monk}'),
  (null, 'Martial Arts (1d6)',               'passive', 'srd-5.1', '{monk}'),
  (null, 'Ki-Empowered Strikes',             'passive', 'srd-5.1', '{monk}'),
  (null, 'Monastic Tradition feature',      'passive', 'srd-5.1', '{monk}'),
  (null, 'Unarmored Movement (+15 ft)',      'passive', 'srd-5.1', '{monk}'),
  (null, 'Evasion',                          'passive', 'srd-5.1', '{monk,rogue}'),
  (null, 'Stillness of Mind',               'active',  'srd-5.1', '{monk}'),
  (null, 'Unarmored Movement (run up walls)','passive', 'srd-5.1', '{monk}'),
  (null, 'Purity of Body',                  'passive', 'srd-5.1', '{monk}'),
  (null, 'Martial Arts (1d8)',               'passive', 'srd-5.1', '{monk}'),
  (null, 'Unarmored Movement (+20 ft)',      'passive', 'srd-5.1', '{monk}'),
  (null, 'Tongue of Sun and Moon',          'passive', 'srd-5.1', '{monk}'),
  (null, 'Diamond Soul',                    'passive', 'srd-5.1', '{monk}'),
  (null, 'Unarmored Movement (+25 ft)',      'passive', 'srd-5.1', '{monk}'),
  (null, 'Martial Arts (1d10)',              'passive', 'srd-5.1', '{monk}'),
  (null, 'Empty Body',                      'active',  'srd-5.1', '{monk}'),
  (null, 'Unarmored Movement (+30 ft)',      'passive', 'srd-5.1', '{monk}'),
  (null, 'Perfect Self',                    'passive', 'srd-5.1', '{monk}'),
  (null, 'Martial Arts (1d12)',              'passive', 'srd-5.1', '{monk}'),

-- Paladin
  (null, 'Divine Sense',                     'active',  'srd-5.1', '{paladin}'),
  (null, 'Lay on Hands',                     'active',  'srd-5.1', '{paladin}'),
  (null, 'Spellcasting (Paladin)',           'passive', 'srd-5.1', '{paladin}'),
  (null, 'Divine Smite',                     'active',  'srd-5.1', '{paladin}'),
  (null, 'Divine Health',                    'passive', 'srd-5.1', '{paladin}'),
  (null, 'Sacred Oath',                      'passive', 'srd-5.1', '{paladin}'),
  (null, 'Channel Divinity',                 'active',  'srd-5.1', '{paladin}'),
  (null, 'Destroy Undead (CR 1/2)',          'active',  'srd-5.1', '{paladin}'),
  (null, 'Aura of Protection',              'passive', 'srd-5.1', '{paladin}'),
  (null, 'Sacred Oath feature',             'passive', 'srd-5.1', '{paladin}'),
  (null, 'Aura of Courage',                 'passive', 'srd-5.1', '{paladin}'),
  (null, 'Improved Divine Smite',           'passive', 'srd-5.1', '{paladin}'),
  (null, 'Cleansing Touch',                 'active',  'srd-5.1', '{paladin}'),
  (null, 'Aura improvements (30 ft.)',      'passive', 'srd-5.1', '{paladin}'),

-- Ranger
  (null, 'Favored Enemy',                    'passive', 'srd-5.1', '{ranger}'),
  (null, 'Natural Explorer',                'passive', 'srd-5.1', '{ranger}'),
  (null, 'Ranger Archetype',                'passive', 'srd-5.1', '{ranger}'),
  (null, 'Primeval Awareness',              'active',  'srd-5.1', '{ranger}'),
  (null, 'Favored Enemy improvement',       'passive', 'srd-5.1', '{ranger}'),
  (null, 'Natural Explorer improvement',    'passive', 'srd-5.1', '{ranger}'),
  (null, 'Ranger Archetype feature',        'passive', 'srd-5.1', '{ranger}'),
  (null, 'Land''s Stride',                   'passive', 'srd-5.1', '{ranger}'),
  (null, 'Hide in Plain Sight',             'active',  'srd-5.1', '{ranger}'),
  (null, 'Vanish',                          'passive', 'srd-5.1', '{ranger}'),
  (null, 'Feral Senses',                    'passive', 'srd-5.1', '{ranger}'),
  (null, 'Foe Slayer',                      'passive', 'srd-5.1', '{ranger}'),

-- Rogue
  (null, 'Sneak Attack (1d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Thieves'' Cant',                    'passive', 'srd-5.1', '{rogue}'),
  (null, 'Cunning Action',                   'active',  'srd-5.1', '{rogue}'),
  (null, 'Roguish Archetype',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (2d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Uncanny Dodge',                   'reaction','srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (3d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (4d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (5d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (6d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Reliable Talent',                 'passive', 'srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (7d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Blindsense',                      'passive', 'srd-5.1', '{rogue}'),
  (null, 'Slippery Mind',                   'passive', 'srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (8d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (9d6)',               'passive', 'srd-5.1', '{rogue}'),
  (null, 'Elusive',                          'passive', 'srd-5.1', '{rogue}'),
  (null, 'Sneak Attack (10d6)',              'passive', 'srd-5.1', '{rogue}'),
  (null, 'Stroke of Luck',                  'active',  'srd-5.1', '{rogue}'),

-- Sorcerer
  (null, 'Sorcerous Origin',                'passive', 'srd-5.1', '{sorcerer}'),
  (null, 'Font of Magic (2 Sorcery Points)','active',  'srd-5.1', '{sorcerer}'),
  (null, 'Metamagic (choose 2)',            'passive', 'srd-5.1', '{sorcerer}'),
  (null, 'Sorcerous Origin feature',        'passive', 'srd-5.1', '{sorcerer}'),
  (null, 'Metamagic (choose 1 more)',       'passive', 'srd-5.1', '{sorcerer}'),
  (null, 'Sorcerous Restoration',           'passive', 'srd-5.1', '{sorcerer}'),

-- Warlock
  (null, 'Otherworldly Patron',                      'passive', 'srd-5.1', '{warlock}'),
  (null, 'Spellcasting (Pact Magic, short rest)',    'passive', 'srd-5.1', '{warlock}'),
  (null, 'Eldritch Invocations (2)',                 'passive', 'srd-5.1', '{warlock}'),
  (null, 'Pact Boon',                                'passive', 'srd-5.1', '{warlock}'),
  (null, 'Eldritch Invocations (4)',                 'passive', 'srd-5.1', '{warlock}'),
  (null, 'Otherworldly Patron feature',              'passive', 'srd-5.1', '{warlock}'),
  (null, 'Eldritch Invocations (5)',                 'passive', 'srd-5.1', '{warlock}'),
  (null, 'Eldritch Invocations (6)',                 'passive', 'srd-5.1', '{warlock}'),
  (null, 'Mystic Arcanum (6th-level spell)',         'passive', 'srd-5.1', '{warlock}'),
  (null, 'Eldritch Invocations (7)',                 'passive', 'srd-5.1', '{warlock}'),
  (null, 'Mystic Arcanum (7th-level spell)',         'passive', 'srd-5.1', '{warlock}'),
  (null, 'Mystic Arcanum (8th-level spell)',         'passive', 'srd-5.1', '{warlock}'),
  (null, 'Eldritch Invocations (8)',                 'passive', 'srd-5.1', '{warlock}'),
  (null, 'Mystic Arcanum (9th-level spell)',         'passive', 'srd-5.1', '{warlock}'),
  (null, 'Eldritch Invocations (9)',                 'passive', 'srd-5.1', '{warlock}'),
  (null, 'Eldritch Master',                          'active',  'srd-5.1', '{warlock}'),

-- Wizard
  (null, 'Spellcasting (Spellbook)',                 'passive', 'srd-5.1', '{wizard}'),
  (null, 'Arcane Recovery',                          'active',  'srd-5.1', '{wizard}'),
  (null, 'Arcane Tradition',                         'passive', 'srd-5.1', '{wizard}'),
  (null, 'Arcane Tradition feature',                 'passive', 'srd-5.1', '{wizard}'),
  (null, 'Spell Mastery (1 × 1st-level + 1 × 2nd-level spell cast at will)', 'passive', 'srd-5.1', '{wizard}'),
  (null, 'Signature Spells (2 × 3rd-level spells, 1 free cast each per short rest)', 'passive', 'srd-5.1', '{wizard}'),

-- Artificer
  (null, 'Magical Tinkering',                        'active',  'srd-5.1', '{artificer}'),
  (null, 'Spellcasting (Artificer)',                 'passive', 'srd-5.1', '{artificer}'),
  (null, 'Infuse Item (4 infusions known, 2 items)', 'passive', 'srd-5.1', '{artificer}'),
  (null, 'Artificer Specialist',                     'passive', 'srd-5.1', '{artificer}'),
  (null, 'The Right Tool for the Job',               'passive', 'srd-5.1', '{artificer}'),
  (null, 'Artificer Specialist feature',             'passive', 'srd-5.1', '{artificer}'),
  (null, 'Infusions known: 6, items: 3',             'passive', 'srd-5.1', '{artificer}'),
  (null, 'Tool Expertise',                           'passive', 'srd-5.1', '{artificer}'),
  (null, 'Flash of Genius',                          'reaction','srd-5.1', '{artificer}'),
  (null, 'Infusions known: 8, items: 4',             'passive', 'srd-5.1', '{artificer}'),
  (null, 'Magic Item Adept',                         'passive', 'srd-5.1', '{artificer}'),
  (null, 'Spell-Storing Item',                       'passive', 'srd-5.1', '{artificer}'),
  (null, 'Magic Item Savant',                        'passive', 'srd-5.1', '{artificer}'),
  (null, 'Infusions known: 10, items: 5',            'passive', 'srd-5.1', '{artificer}'),
  (null, 'Magic Item Master',                        'passive', 'srd-5.1', '{artificer}'),
  (null, 'Infusions known: 12, items: 6',            'passive', 'srd-5.1', '{artificer}'),
  (null, 'Soul of Artifice',                         'passive', 'srd-5.1', '{artificer}'),

-- Shared / ASI (used across all classes)
  (null, 'ASI',                              'passive', 'srd-5.1', '{}')

on conflict do nothing;

-- ── 5. Populate system_classes.features ──────────────────────────────────────
-- For each class, build a jsonb object: {"level": ["uuid", ...], ...}
-- Helper: resolves feature name → uuid (system features only).

-- Barbarian
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Rage (2 uses, +2 dmg)', 'Unarmored Defense (10+DEX+CON)']),
    (2,  array['Reckless Attack', 'Danger Sense']),
    (3,  array['Primal Path']),
    (4,  array['ASI']),
    (5,  array['Extra Attack', 'Fast Movement']),
    (6,  array['Path feature', 'Rage (4 uses)']),
    (7,  array['Feral Instinct']),
    (8,  array['ASI']),
    (9,  array['Brutal Critical (1 die)', 'Rage damage +3']),
    (10, array['Path feature']),
    (11, array['Relentless Rage']),
    (12, array['ASI', 'Rage (5 uses)']),
    (13, array['Brutal Critical (2 dice)']),
    (14, array['Path feature']),
    (15, array['Persistent Rage']),
    (16, array['ASI', 'Rage damage +4']),
    (17, array['Brutal Critical (3 dice)', 'Rage (6 uses)']),
    (18, array['Indomitable Might']),
    (19, array['ASI']),
    (20, array['Primal Champion (+4 STR, +4 CON)', 'Rage (unlimited)'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Barbarian';

-- Bard
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Spellcasting', 'Bardic Inspiration (d6, CHA mod/rest)']),
    (2,  array['Jack of All Trades', 'Song of Rest (d6)']),
    (3,  array['Bard College', 'Expertise (×2 skills)']),
    (4,  array['ASI']),
    (5,  array['Bardic Inspiration (d8, short rest recharge)', 'Font of Inspiration']),
    (6,  array['Countercharm', 'Bard College feature']),
    (8,  array['ASI']),
    (9,  array['Song of Rest (d8)']),
    (10, array['Bardic Inspiration (d10)', 'Expertise (×2 more skills)', 'Magical Secrets (2 spells from any list)']),
    (12, array['ASI']),
    (13, array['Song of Rest (d10)']),
    (14, array['Magical Secrets (2 more spells)', 'Bard College feature']),
    (15, array['Bardic Inspiration (d12)']),
    (16, array['ASI']),
    (17, array['Song of Rest (d12)']),
    (18, array['Magical Secrets (2 more spells)']),
    (19, array['ASI']),
    (20, array['Superior Inspiration'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Bard';

-- Cleric
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Spellcasting', 'Divine Domain']),
    (2,  array['Channel Divinity (1/rest)', 'Divine Domain feature']),
    (4,  array['ASI']),
    (5,  array['Destroy Undead (CR ½)']),
    (6,  array['Channel Divinity (2/rest)', 'Divine Domain feature']),
    (8,  array['ASI', 'Destroy Undead (CR 1)', 'Divine Domain feature']),
    (10, array['Divine Intervention']),
    (11, array['Destroy Undead (CR 2)']),
    (12, array['ASI']),
    (14, array['Destroy Undead (CR 3)']),
    (16, array['ASI']),
    (17, array['Destroy Undead (CR 4)', 'Divine Domain feature']),
    (18, array['Channel Divinity (3/rest)']),
    (19, array['ASI']),
    (20, array['Divine Intervention improvement'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Cleric';

-- Druid
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Spellcasting', 'Druidic']),
    (2,  array['Wild Shape (CR ¼, no swim/fly)', 'Druid Circle']),
    (4,  array['ASI', 'Wild Shape (CR ½, no fly)']),
    (6,  array['Druid Circle feature']),
    (8,  array['ASI', 'Wild Shape (CR 1)']),
    (10, array['Druid Circle feature']),
    (12, array['ASI']),
    (14, array['Druid Circle feature']),
    (16, array['ASI']),
    (18, array['Timeless Body', 'Beast Spells']),
    (19, array['ASI']),
    (20, array['Archdruid'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Druid';

-- Fighter
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Fighting Style', 'Second Wind']),
    (2,  array['Action Surge (1 use)']),
    (3,  array['Martial Archetype']),
    (4,  array['ASI']),
    (5,  array['Extra Attack']),
    (6,  array['ASI']),
    (7,  array['Archetype feature']),
    (8,  array['ASI']),
    (9,  array['Indomitable (1 use)']),
    (10, array['Archetype feature']),
    (11, array['Extra Attack (2)']),
    (12, array['ASI']),
    (13, array['Indomitable (2 uses)']),
    (14, array['ASI']),
    (15, array['Archetype feature']),
    (16, array['ASI']),
    (17, array['Action Surge (2 uses)', 'Indomitable (3 uses)']),
    (18, array['Archetype feature']),
    (19, array['ASI']),
    (20, array['Extra Attack (3)'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Fighter';

-- Monk
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Unarmored Defense (10+DEX+WIS)', 'Martial Arts (1d4)']),
    (2,  array['Ki (2 points)', 'Unarmored Movement (+10 ft)']),
    (3,  array['Monastic Tradition', 'Deflect Missiles']),
    (4,  array['ASI', 'Slow Fall']),
    (5,  array['Extra Attack', 'Stunning Strike', 'Martial Arts (1d6)']),
    (6,  array['Ki-Empowered Strikes', 'Monastic Tradition feature', 'Unarmored Movement (+15 ft)']),
    (7,  array['Evasion', 'Stillness of Mind']),
    (8,  array['ASI']),
    (9,  array['Unarmored Movement (run up walls)', 'Unarmored Movement (+15 ft)']),
    (10, array['Purity of Body', 'Martial Arts (1d8)', 'Unarmored Movement (+20 ft)']),
    (11, array['Monastic Tradition feature']),
    (12, array['ASI']),
    (13, array['Tongue of Sun and Moon', 'Unarmored Movement (+20 ft)']),
    (14, array['Diamond Soul', 'Unarmored Movement (+25 ft)']),
    (15, array['Timeless Body', 'Unarmored Movement (+25 ft)']),
    (16, array['ASI', 'Martial Arts (1d10)']),
    (17, array['Monastic Tradition feature', 'Unarmored Movement (+25 ft)']),
    (18, array['Empty Body', 'Unarmored Movement (+30 ft)']),
    (19, array['ASI']),
    (20, array['Perfect Self', 'Martial Arts (1d12)'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Monk';

-- Paladin
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Divine Sense', 'Lay on Hands']),
    (2,  array['Fighting Style', 'Spellcasting (Paladin)', 'Divine Smite']),
    (3,  array['Divine Health', 'Sacred Oath', 'Channel Divinity']),
    (4,  array['ASI']),
    (5,  array['Extra Attack', 'Destroy Undead (CR 1/2)']),
    (6,  array['Aura of Protection']),
    (7,  array['Sacred Oath feature']),
    (8,  array['ASI']),
    (10, array['Aura of Courage']),
    (11, array['Improved Divine Smite']),
    (12, array['ASI']),
    (14, array['Cleansing Touch']),
    (15, array['Sacred Oath feature']),
    (16, array['ASI']),
    (18, array['Aura improvements (30 ft.)']),
    (19, array['ASI']),
    (20, array['Sacred Oath feature'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Paladin';

-- Ranger
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Favored Enemy', 'Natural Explorer']),
    (2,  array['Fighting Style', 'Spellcasting']),
    (3,  array['Ranger Archetype', 'Primeval Awareness']),
    (4,  array['ASI']),
    (5,  array['Extra Attack']),
    (6,  array['Favored Enemy improvement', 'Natural Explorer improvement']),
    (7,  array['Ranger Archetype feature']),
    (8,  array['ASI', 'Land''s Stride']),
    (10, array['Natural Explorer improvement', 'Hide in Plain Sight']),
    (11, array['Ranger Archetype feature']),
    (12, array['ASI']),
    (14, array['Favored Enemy improvement', 'Vanish']),
    (15, array['Ranger Archetype feature']),
    (16, array['ASI']),
    (18, array['Feral Senses']),
    (19, array['ASI']),
    (20, array['Foe Slayer'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Ranger';

-- Rogue
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Expertise (×2 skills)', 'Sneak Attack (1d6)', 'Thieves'' Cant']),
    (2,  array['Cunning Action']),
    (3,  array['Roguish Archetype', 'Sneak Attack (2d6)']),
    (4,  array['ASI']),
    (5,  array['Uncanny Dodge', 'Sneak Attack (3d6)']),
    (6,  array['Expertise (×2 more skills)']),
    (7,  array['Evasion', 'Sneak Attack (4d6)']),
    (8,  array['ASI']),
    (9,  array['Archetype feature', 'Sneak Attack (5d6)']),
    (10, array['ASI']),
    (11, array['Reliable Talent', 'Sneak Attack (6d6)']),
    (12, array['ASI']),
    (13, array['Archetype feature', 'Sneak Attack (7d6)']),
    (14, array['Blindsense']),
    (15, array['Slippery Mind', 'Sneak Attack (8d6)']),
    (16, array['ASI']),
    (17, array['Archetype feature', 'Sneak Attack (9d6)']),
    (18, array['Elusive']),
    (19, array['ASI', 'Sneak Attack (10d6)']),
    (20, array['Stroke of Luck'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Rogue';

-- Sorcerer
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Spellcasting', 'Sorcerous Origin']),
    (2,  array['Font of Magic (2 Sorcery Points)']),
    (3,  array['Metamagic (choose 2)']),
    (4,  array['ASI']),
    (6,  array['Sorcerous Origin feature']),
    (8,  array['ASI']),
    (10, array['Metamagic (choose 1 more)']),
    (12, array['ASI']),
    (14, array['Sorcerous Origin feature']),
    (16, array['ASI']),
    (17, array['Metamagic (choose 1 more)']),
    (18, array['Sorcerous Origin feature']),
    (19, array['ASI']),
    (20, array['Sorcerous Restoration'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Sorcerer';

-- Warlock
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Otherworldly Patron', 'Spellcasting (Pact Magic, short rest)']),
    (2,  array['Eldritch Invocations (2)']),
    (3,  array['Pact Boon']),
    (4,  array['ASI']),
    (5,  array['Eldritch Invocations (4)']),
    (6,  array['Otherworldly Patron feature']),
    (7,  array['Eldritch Invocations (5)']),
    (8,  array['ASI']),
    (9,  array['Eldritch Invocations (6)']),
    (10, array['Otherworldly Patron feature']),
    (11, array['Mystic Arcanum (6th-level spell)', 'Eldritch Invocations (7)']),
    (12, array['ASI']),
    (13, array['Mystic Arcanum (7th-level spell)']),
    (14, array['Otherworldly Patron feature']),
    (15, array['Mystic Arcanum (8th-level spell)', 'Eldritch Invocations (8)']),
    (16, array['ASI']),
    (17, array['Mystic Arcanum (9th-level spell)']),
    (18, array['Eldritch Invocations (9)']),
    (19, array['ASI']),
    (20, array['Eldritch Master'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Warlock';

-- Wizard
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Spellcasting (Spellbook)', 'Arcane Recovery']),
    (2,  array['Arcane Tradition']),
    (4,  array['ASI']),
    (6,  array['Arcane Tradition feature']),
    (8,  array['ASI']),
    (10, array['Arcane Tradition feature']),
    (12, array['ASI']),
    (14, array['Arcane Tradition feature']),
    (16, array['ASI']),
    (18, array['Spell Mastery (1 × 1st-level + 1 × 2nd-level spell cast at will)']),
    (19, array['ASI']),
    (20, array['Signature Spells (2 × 3rd-level spells, 1 free cast each per short rest)', 'Arcane Tradition feature'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Wizard';

-- Artificer
update system_classes set features = (
  with t(lvl, names) as (values
    (1,  array['Magical Tinkering', 'Spellcasting (Artificer)']),
    (2,  array['Infuse Item (4 infusions known, 2 items)']),
    (3,  array['Artificer Specialist', 'The Right Tool for the Job']),
    (4,  array['ASI']),
    (5,  array['Artificer Specialist feature', 'Infusions known: 6, items: 3']),
    (6,  array['Tool Expertise']),
    (7,  array['Flash of Genius']),
    (8,  array['ASI']),
    (9,  array['Artificer Specialist feature', 'Infusions known: 8, items: 4']),
    (10, array['Magic Item Adept']),
    (11, array['Spell-Storing Item']),
    (12, array['ASI']),
    (14, array['Magic Item Savant', 'Infusions known: 10, items: 5']),
    (15, array['Artificer Specialist feature']),
    (16, array['ASI']),
    (18, array['Magic Item Master', 'Infusions known: 12, items: 6']),
    (19, array['ASI']),
    (20, array['Soul of Artifice'])
  )
  select jsonb_object_agg(
    lvl::text,
    (select jsonb_agg(cf.id::text order by cf.name)
     from class_features cf where cf.name = any(t.names) and cf.user_id is null)
  ) from t
) where class_name = 'Artificer';
