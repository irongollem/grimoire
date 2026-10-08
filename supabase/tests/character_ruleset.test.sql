-- Epic #943: a character carries its own ruleset; a campaign decides who may
-- sit down.
--
-- Five things are held here, each with a control beside its refusal so a
-- broken fixture cannot pass for a working guard:
--
--   the column   stated at creation, taken from the table for a roster
--                character, and written by nothing but a conversion
--   one reader   private.party_member_ruleset(), which the fifteen spell and
--                class functions resolve through (20261001220509)
--   the door     attach, join and a direct insert all refuse the other edition
--                with SQLSTATE RS001 unless the table allows mixed rulesets
--   ownership    a client cannot write a character's owner; the DM assigning
--                an unowned character to a seat hands it over, and nothing else
--                does (not another campaign's DM, not a player linking
--                themselves, not an offered character, which is taken as a copy)
--   the switch   a campaign changing edition changes no character
--   conversion   in place by the owner (or the DM, for a character nobody
--                owns), and only to an edition the table takes; as a copy for
--                anyone who may clone it
--
--   1 Dana  DM of c1 (2014, no mixed)     3 Sam  DM of c2 (2024, mixed allowed)
--   2 Pia   plays at c1 and c2            4 Oz   plays at c1
--
--   e1 Pia's 2014 Sorcerer, unattached    e3 Dana's roster character at c1
--   e2 Pia's 2024 Cleric, unattached      e4 Pia's second 2014 character
--   e6 Sam's 2024 character, unattached   e7 Sam's 2014 character
--   e8 Dana's OFFERED Sorcerer at c1 (is_dm_managed), with a class spell, a
--      feat spell, and a pouch inside a backpack

begin;

create extension if not exists pgtap with schema extensions;
select plan(73);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('94300000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'character-ruleset-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset, allows_mixed_rulesets) values
  ('94300000-0000-4000-8000-0000000000c1', '94300000-0000-4000-8000-000000000001', 'Dana''s 2014 table', '2014', false),
  ('94300000-0000-4000-8000-0000000000c2', '94300000-0000-4000-8000-000000000003', 'Sam''s 2024 table', '2024', true);

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('94300000-0000-4000-8000-0000000000c1', '94300000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('94300000-0000-4000-8000-0000000000c2', '94300000-0000-4000-8000-000000000003', 'dm', 'Sam'),
  ('94300000-0000-4000-8000-0000000000c1', '94300000-0000-4000-8000-000000000002', 'player', 'Pia'),
  ('94300000-0000-4000-8000-0000000000c2', '94300000-0000-4000-8000-000000000002', 'player', 'Pia'),
  ('94300000-0000-4000-8000-0000000000c1', '94300000-0000-4000-8000-000000000004', 'player', 'Oz')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.campaign_invites (campaign_id, token, role, created_by, max_uses) values
  ('94300000-0000-4000-8000-0000000000c1', '94300000-0000-4000-8000-0000000000a1', 'player', '94300000-0000-4000-8000-000000000001', 5);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"94300000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Definer, so a check reads the row whoever is signed in.
create function pg_temp.pm(p_suffix text) returns public.party_members language sql security definer as $$
  select * from public.party_members where id = ('94300000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;
create function pg_temp.class_edition(p_member uuid) returns text language sql security definer as $$
  select sc.ruleset from public.character_classes cc
    join public.system_classes sc on sc.id = cc.class_definition_id
   where cc.party_member_id = p_member and cc.is_primary;
$$;

-- ── The column ───────────────────────────────────────────────────────────────

select col_not_null('public', 'party_members', 'ruleset', 'every character has a ruleset');
select col_hasnt_default('public', 'party_members', 'ruleset',
  'and it has no default: an edition nobody chose is not an edition');

select throws_ok($$
  insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
  values ('94300000-0000-4000-8000-0000000000e9', '94300000-0000-4000-8000-000000000002',
          '94300000-0000-4000-8000-000000000002', null, 'No edition')
$$, '23502', 'A character must state its ruleset',
  'a character with no campaign cannot be created without a ruleset');

insert into public.party_members (
  id, user_id, owner_user_id, campaign_id, name, class, level, cha, proficiency_bonus, class_resources, class_choices, ruleset
) values
  ('94300000-0000-4000-8000-0000000000e1', '94300000-0000-4000-8000-000000000002', '94300000-0000-4000-8000-000000000002',
   null, 'Pia 2014', 'Sorcerer', 1, 16, 2, '{"innate_sorcery":{"current":2,"max":2,"rest":"long"}}'::jsonb, '{}'::jsonb, '2014'),
  ('94300000-0000-4000-8000-0000000000e2', '94300000-0000-4000-8000-000000000002', '94300000-0000-4000-8000-000000000002',
   null, 'Pia 2024', 'Cleric', 1, 10, 2, '{}'::jsonb, '{"background_asi":{"str":2,"dex":1}}'::jsonb, '2024'),
  ('94300000-0000-4000-8000-0000000000e4', '94300000-0000-4000-8000-000000000002', '94300000-0000-4000-8000-000000000002',
   null, 'Pia spare', 'Fighter', 1, 10, 2, '{}'::jsonb, '{}'::jsonb, '2014'),
  ('94300000-0000-4000-8000-0000000000e6', '94300000-0000-4000-8000-000000000003', '94300000-0000-4000-8000-000000000003',
   null, 'Sam 2024', 'Fighter', 1, 10, 2, '{}'::jsonb, '{}'::jsonb, '2024'),
  ('94300000-0000-4000-8000-0000000000e7', '94300000-0000-4000-8000-000000000003', '94300000-0000-4000-8000-000000000003',
   null, 'Sam 2014', 'Fighter', 1, 10, 2, '{}'::jsonb, '{}'::jsonb, '2014');

-- Nor one made inside a campaign: "take the table's" was the old model living
-- on as a default.
select throws_ok($$
  insert into public.party_members (user_id, owner_user_id, campaign_id, name)
  values ('94300000-0000-4000-8000-000000000001', null, '94300000-0000-4000-8000-0000000000c1', 'Says nothing')
$$, '23502', 'A character must state its ruleset',
  'a roster character made inside a campaign states its edition too: nothing is taken from the table');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, ruleset)
values ('94300000-0000-4000-8000-0000000000e3', '94300000-0000-4000-8000-000000000001', null,
        '94300000-0000-4000-8000-0000000000c1', 'Roster knight', 1, '2014');

select throws_ok($$
  insert into public.party_members (user_id, owner_user_id, campaign_id, name, ruleset)
  values ('94300000-0000-4000-8000-000000000001', null, '94300000-0000-4000-8000-0000000000c1', 'Wrong edition', '2024')
$$, 'RS001', 'This table plays the 2014 rules and does not take 2024 characters',
  'a direct insert cannot walk a 2024 character into a 2014 table');

-- The door is for a character arriving. The table's own DM places a roster
-- character as it is (a restore or an import has to be able to put a table
-- back the way it was); it shows as the other edition and is converted from
-- the Rules tab, not relabelled on the way in.
set local role authenticated;
select pg_temp.as_user(2);
select throws_ok($$
  insert into public.party_members (user_id, owner_user_id, campaign_id, name, ruleset)
  values ('94300000-0000-4000-8000-000000000002', '94300000-0000-4000-8000-000000000002',
          '94300000-0000-4000-8000-0000000000c1', 'Pia walks in', '2024')
$$, 'RS001', 'This table plays the 2014 rules and does not take 2024 characters',
  'a player cannot insert a 2024 character into a 2014 table');
select pg_temp.as_user(1);
select lives_ok($$
  insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset)
  values ('94300000-0000-4000-8000-0000000000ef', '94300000-0000-4000-8000-000000000001', null,
          '94300000-0000-4000-8000-0000000000c1', 'Restored 2024 roster character', '2024')
$$, 'the table''s own DM places a roster character of the other edition');
reset role;
select is((pg_temp.pm('ef')).ruleset, '2024', 'and it keeps the edition it was built under, not the table''s');
delete from public.party_members where id = '94300000-0000-4000-8000-0000000000ef';

-- ── One reader ───────────────────────────────────────────────────────────────

select is(private.party_member_ruleset('94300000-0000-4000-8000-0000000000e2'), '2024',
  'the resolver reads the character, not a campaign');
select is(private.party_member_ruleset('94300000-0000-4000-8000-0000000000ff'), '2014',
  'an unknown character resolves to 2014 rather than NULL');

select lives_ok($$
  insert into public.character_classes
    (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
  values ('94300000-0000-4000-8000-0000000000e1', 'Sorcerer', 1, true,
    (select id from public.system_classes where ruleset = '2014' and class_name = 'Sorcerer'), 'system')
$$, 'a 2014 character with no campaign takes a pinned 2014 class (the call that returned P0002)');

select throws_ok($$
  insert into public.character_classes
    (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
  values ('94300000-0000-4000-8000-0000000000e1', 'Cleric', 1, false,
    (select id from public.system_classes where ruleset = '2024' and class_name = 'Cleric'), 'system')
$$, 'P0001', 'Class definition is unavailable for ruleset 2014',
  'a 2014 character is refused a 2024 class');

select lives_ok($$
  insert into public.character_classes
    (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
  values ('94300000-0000-4000-8000-0000000000e2', 'Cleric', 1, true,
    (select id from public.system_classes where ruleset = '2024' and class_name = 'Cleric'), 'system')
$$, 'a 2024 character with no campaign takes a pinned 2024 class');

-- The window trigger reads the same resolver: 2024 has a Cleric policy, 2014
-- has no Sorcerer one.
select is((select count(*)::int from public.spell_change_windows
  where party_member_id = '94300000-0000-4000-8000-0000000000e2'), 1,
  'a 2024 Cleric with no campaign gets its preparation window');
select is((select count(*)::int from public.spell_change_windows
  where party_member_id = '94300000-0000-4000-8000-0000000000e1'), 0,
  'a 2014 Sorcerer has no 2024 change window');

select results_eq($$
  select spell_count, cantrip_count
  from public.required_level_up_spell_choices('94300000-0000-4000-8000-0000000000e1', 'Sorcerer', 1)
$$, $$ values (2, 4) $$, 'a 2014 Sorcerer levels by the 2014 spells-known table');

select throws_ok($$
  select * from public.required_level_up_spell_choices('94300000-0000-4000-8000-0000000000ff', 'Sorcerer', 1)
$$, 'P0002', 'Party member not found', 'level-up counts refuse a character that does not exist');

insert into public.character_classes (party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
select m.id, 'Fighter', 1, true, sc.id, 'system'
  from public.party_members m join public.system_classes sc on sc.class_name = 'Fighter' and sc.ruleset = m.ruleset
 where m.id in ('94300000-0000-4000-8000-0000000000e3', '94300000-0000-4000-8000-0000000000e4',
                '94300000-0000-4000-8000-0000000000e6', '94300000-0000-4000-8000-0000000000e7');

set local role authenticated;
select pg_temp.as_user(2);

select throws_ok($$ select public.activate_innate_sorcery('94300000-0000-4000-8000-0000000000e1') $$,
  'P0001', 'Innate Sorcery requires a 2024 Sorcerer',
  'a 2014 Sorcerer cannot use a 2024 feature');
select lives_ok($$ select public.take_spellcasting_rest('94300000-0000-4000-8000-0000000000e1', 'long') $$,
  'a character with no campaign can take a long rest');

select throws_like($$
  update public.party_members set ruleset = '2024' where id = '94300000-0000-4000-8000-0000000000e1'
$$, '%convert_party_member_ruleset%', 'an owner cannot write the ruleset column directly');
select lives_ok($$
  update public.party_members set ruleset = '2014', name = 'Pia 2014 renamed' where id = '94300000-0000-4000-8000-0000000000e1'
$$, 'a save that restates the same ruleset is an ordinary save');

-- ── The door ─────────────────────────────────────────────────────────────────

select throws_ok($$
  select public.attach_party_member_to_campaign('94300000-0000-4000-8000-0000000000e2', '94300000-0000-4000-8000-0000000000c1', true)
$$, 'RS001', 'This table plays the 2014 rules and does not take 2024 characters',
  'a 2024 character is bounced from a 2014 table');
select is((pg_temp.pm('e2')).campaign_id, null, 'and stays in the pool');

select lives_ok($$
  select public.attach_party_member_to_campaign('94300000-0000-4000-8000-0000000000e1', '94300000-0000-4000-8000-0000000000c1', true)
$$, 'a 2014 character sits down at a 2014 table');

select lives_ok($$
  select public.attach_party_member_to_campaign('94300000-0000-4000-8000-0000000000e4', '94300000-0000-4000-8000-0000000000c2', true)
$$, 'a 2014 character sits down at a 2024 table that allows mixed rulesets');
select is((pg_temp.pm('e4')).ruleset, '2014', 'and keeps its own ruleset there');

select pg_temp.as_user(3);

select throws_ok($$
  select public.join_campaign_via_invite('94300000-0000-4000-8000-0000000000a1', '94300000-0000-4000-8000-0000000000e6')
$$, 'RS001', 'This table plays the 2014 rules and does not take 2024 characters',
  'joining with a 2024 character is bounced from a 2014 table');
select is((select count(*)::int from public.campaign_members
  where campaign_id = '94300000-0000-4000-8000-0000000000c1' and user_id = '94300000-0000-4000-8000-000000000003'), 0,
  'and the bounce admits nobody');
select lives_ok($$
  select public.join_campaign_via_invite('94300000-0000-4000-8000-0000000000a1', '94300000-0000-4000-8000-0000000000e7')
$$, 'joining with a 2014 character is welcome');

-- ── Ownership ────────────────────────────────────────────────────────────────

reset role;

insert into public.party_members (id, user_id, owner_user_id, is_dm_managed, campaign_id, name, level, cha, proficiency_bonus, custom_attacks, ruleset)
values ('94300000-0000-4000-8000-0000000000e8', '94300000-0000-4000-8000-000000000001', null, true,
        '94300000-0000-4000-8000-0000000000c1', 'Offered sorcerer', 1, 16, 2, '[{"name":"Probe strike"}]'::jsonb, '2014');
insert into public.character_classes (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('94300000-0000-4000-8000-0000000000f8', '94300000-0000-4000-8000-0000000000e8', 'Sorcerer', 1, true,
  (select id from public.system_classes where ruleset = '2014' and class_name = 'Sorcerer'), 'system');
insert into public.spells (id, user_id, campaign_id, name, level, casting_time, range, duration, description, classes, attack_type, damage_rolls, target_description)
values ('94300000-0000-4000-8000-000000000051', '94300000-0000-4000-8000-000000000001', '94300000-0000-4000-8000-0000000000c1',
  'Offer Flame', 1, 'Action', '60 ft.', 'Instantaneous', 'Test damage.', array['Sorcerer'], 'automatic', '[{"dice":"2d6","type":"fire"}]'::jsonb, '1 creature');
insert into public.character_spells (party_member_id, spell_id, source_type, source_class_id, is_known, is_prepared, always_prepared, casting_ability, source_label) values
  ('94300000-0000-4000-8000-0000000000e8', '94300000-0000-4000-8000-000000000051', 'class', '94300000-0000-4000-8000-0000000000f8', true, true, false, null, null),
  ('94300000-0000-4000-8000-0000000000e8', 'offer-granted-spell', 'feat', null, true, true, false, 'cha', 'Offer feat');
insert into public.party_inventory (id, campaign_id, user_id, name, quantity, carried_by, is_container, container_id) values
  ('94300000-0000-4000-8000-0000000000b1', '94300000-0000-4000-8000-0000000000c1', '94300000-0000-4000-8000-000000000001', 'Backpack', 1, '94300000-0000-4000-8000-0000000000e8', true, null),
  ('94300000-0000-4000-8000-0000000000b2', '94300000-0000-4000-8000-0000000000c1', '94300000-0000-4000-8000-000000000001', 'Pouch', 1, '94300000-0000-4000-8000-0000000000e8', false, '94300000-0000-4000-8000-0000000000b1');

-- Oz's copy of the offer, read as a definer so RLS does not decide the answer.
create function pg_temp.assumed() returns public.party_members language sql security definer as $$
  select * from public.party_members
   where name = 'Offered sorcerer' and owner_user_id = '94300000-0000-4000-8000-000000000004';
$$;
create function pg_temp.assumed_facts() returns jsonb language sql security definer as $$
  with copy as (select (pg_temp.assumed()).id as id)
  select jsonb_build_object(
    'class_edition', (select sc.ruleset from public.character_classes cc
        join public.system_classes sc on sc.id = cc.class_definition_id, copy where cc.party_member_id = copy.id),
    'spell_class_is_own', (select bool_and(cc.party_member_id = copy.id) from public.character_spells cs
        join public.character_classes cc on cc.id = cs.source_class_id, copy
       where cs.party_member_id = copy.id and cs.source_type = 'class'),
    'grant', (select jsonb_build_object('source_label', cs.source_label, 'casting_ability', cs.casting_ability)
        from public.character_spells cs, copy where cs.party_member_id = copy.id and cs.source_type = 'feat'),
    'pouch_in_own_backpack', (select bag.carried_by = copy.id and bag.name = 'Backpack' and bag.id <> '94300000-0000-4000-8000-0000000000b1'
        from public.party_inventory pouch join public.party_inventory bag on bag.id = pouch.container_id, copy
       where pouch.carried_by = copy.id and pouch.name = 'Pouch'));
$$;

set local role authenticated;

-- A client cannot write the owner, in either direction.
select pg_temp.as_user(1);
select throws_ok($$
  update public.party_members set owner_user_id = '94300000-0000-4000-8000-000000000001'
   where id = '94300000-0000-4000-8000-0000000000e3'
$$, '42501', 'A character changes owner only by being claimed',
  'a character''s creator cannot write themselves in as its owner');
select throws_ok($$
  insert into public.party_members (user_id, owner_user_id, campaign_id, name, ruleset)
  values ('94300000-0000-4000-8000-000000000001', '94300000-0000-4000-8000-000000000002', null, 'A gift nobody asked for', '2014')
$$, '42501', 'A character can only be created for its own player',
  'nobody can create a character into someone else''s pool');

-- A player linking themselves gets the sheet to edit, as before, and nothing more.
select pg_temp.as_user(4);
select lives_ok($$
  update public.campaign_members set party_member_id = '94300000-0000-4000-8000-0000000000e3'
   where campaign_id = '94300000-0000-4000-8000-0000000000c1' and user_id = '94300000-0000-4000-8000-000000000004'
$$, 'a player may link their seat to an unowned roster character');
select is((pg_temp.pm('e3')).owner_user_id, null, 'but linking themselves does not make it theirs');

select lives_ok($$
  update public.campaign_members set party_member_id = '94300000-0000-4000-8000-0000000000e8'
   where campaign_id = '94300000-0000-4000-8000-0000000000c1' and user_id = '94300000-0000-4000-8000-000000000004'
$$, 'a player may link their seat to an offered character');
select is((pg_temp.pm('e8')).owner_user_id, null, 'and an offered character is never handed over by a link');

update public.campaign_members set party_member_id = null
 where campaign_id = '94300000-0000-4000-8000-0000000000c1' and user_id = '94300000-0000-4000-8000-000000000004';

-- An offered character is taken as a copy, and the copy is whole.
select isnt(public.assume_character('94300000-0000-4000-8000-0000000000e8'), null,
  'a player assumes an offered spellcaster (its class spells used to point at the original''s class rows, which refused the copy)');
select is((pg_temp.assumed()).is_dm_managed, false, 'the copy is the player''s own, not an offer');
select ok((pg_temp.pm('e8')).owner_user_id is null and (pg_temp.pm('e8')).is_dm_managed, 'the offer itself stays the DM''s');
select is(jsonb_build_object('ruleset', (pg_temp.assumed()).ruleset, 'custom_attacks', (pg_temp.assumed()).custom_attacks),
  '{"ruleset": "2014", "custom_attacks": [{"name": "Probe strike"}]}'::jsonb,
  'the copy carries the offer''s edition and the columns a hand-written list had missed');
select is(pg_temp.assumed_facts() ->> 'class_edition', '2014', 'its class keeps its definition pin');
select is(pg_temp.assumed_facts() ->> 'spell_class_is_own', 'true', 'its class spell points at its own class row');
select is(pg_temp.assumed_facts() -> 'grant', '{"source_label": "Offer feat", "casting_ability": "cha"}'::jsonb,
  'a feat''s spell stays the feat''s, with its casting ability');
select is(pg_temp.assumed_facts() ->> 'pouch_in_own_backpack', 'true', 'and what it carries sits in its own containers');

-- A DM cannot reach into another table.
select pg_temp.as_user(3);
select throws_ok($$
  update public.campaign_members set party_member_id = '94300000-0000-4000-8000-0000000000e3'
   where campaign_id = '94300000-0000-4000-8000-0000000000c2' and user_id = '94300000-0000-4000-8000-000000000003'
$$, 'P0001', 'Cannot link a character from another campaign',
  'a DM cannot point their own seat at an unowned character in someone else''s campaign');
select is((pg_temp.pm('e3')).owner_user_id, null, 'so that character is still nobody''s');

-- An owned character is never re-owned, whoever moves the seat.
select pg_temp.as_user(1);
update public.campaign_members set party_member_id = '94300000-0000-4000-8000-0000000000e1'
 where campaign_id = '94300000-0000-4000-8000-0000000000c1' and user_id = '94300000-0000-4000-8000-000000000004';
select is((pg_temp.pm('e1')).owner_user_id, '94300000-0000-4000-8000-000000000002'::uuid,
  'a DM pointing another seat at an owned character does not change its owner');

-- ── The switch ───────────────────────────────────────────────────────────────

reset role;
select hasnt_function('public', 'review_characters_for_campaign_ruleset',
  'the trigger that rewrote characters on a campaign switch is gone');

update public.campaigns set ruleset = '2024' where id = '94300000-0000-4000-8000-0000000000c1';

select is((pg_temp.pm('e1')).ruleset, '2014', 'a campaign switching edition does not change a seated character');
select is((pg_temp.pm('e1')).campaign_id, '94300000-0000-4000-8000-0000000000c1'::uuid, 'which keeps its seat');
select is(pg_temp.class_edition('94300000-0000-4000-8000-0000000000e1'), '2014', 'and its class pin');

-- ── Conversion ───────────────────────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(4);
select throws_ok($$ select public.convert_party_member_ruleset('94300000-0000-4000-8000-0000000000e1', '2024') $$,
  '42501', 'Only the character''s owner can change its ruleset',
  'another player at the table cannot convert a character');

select pg_temp.as_user(1);
select throws_ok($$ select public.convert_party_member_ruleset('94300000-0000-4000-8000-0000000000e1', '2024') $$,
  '42501', 'Only the character''s owner can change its ruleset',
  'the DM cannot convert a character a player owns');
select lives_ok($$ select public.convert_party_member_ruleset('94300000-0000-4000-8000-0000000000e3', '2024') $$,
  'the DM converts a roster character nobody owns');
select is(pg_temp.class_edition('94300000-0000-4000-8000-0000000000e3'), '2024',
  'and its official class follows to the same class in the new edition');

select pg_temp.as_user(2);
select lives_ok($$ select public.convert_party_member_ruleset('94300000-0000-4000-8000-0000000000e1', '2024') $$,
  'the owner converts their own character in place');
select is((pg_temp.pm('e1')).ruleset, '2024', 'the character is now 2024');

select throws_ok($$ select public.convert_party_member_ruleset('94300000-0000-4000-8000-0000000000e1', '2014') $$,
  'RS001', 'This table plays the 2024 rules and does not take 2014 characters',
  'a seated character cannot be converted into an edition its table does not take');

-- A copy: the bounce's offer.
select pg_temp.as_user(3);
select throws_ok($$ select public.convert_party_member_copy('94300000-0000-4000-8000-0000000000e2', '2014') $$,
  'P0001', 'Only the character''s owner can clone it', 'a stranger cannot take a converted copy of someone''s character');

select pg_temp.as_user(2);
select lives_ok($$ select public.convert_party_member_copy('94300000-0000-4000-8000-0000000000e2', '2014') $$,
  'the owner takes a converted copy');

reset role;
select is((pg_temp.pm('e2')).ruleset, '2024', 'the original is untouched');
select is((select count(*)::int from public.party_members copy
  where copy.name = 'Pia 2024 (copy)' and copy.ruleset = '2014' and copy.campaign_id is null
    and copy.owner_user_id = '94300000-0000-4000-8000-000000000002'
    and pg_temp.class_edition(copy.id) = '2014'), 1,
  'the copy is 2014, in the owner''s pool, with its class pinned to the 2014 definition');
select is((select count(*)::int from public.ruleset_reviews rr
  join public.party_members copy on copy.id = rr.party_member_id
  where copy.name = 'Pia 2024 (copy)' and rr.flag_type = 'background'), 1,
  'a review is raised on the copy, which has no campaign to hang it on');

-- ── Claiming transfers ownership ─────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(1);
update public.campaign_members set party_member_id = '94300000-0000-4000-8000-0000000000e3'
 where campaign_id = '94300000-0000-4000-8000-0000000000c1' and user_id = '94300000-0000-4000-8000-000000000004';
reset role;

select is((pg_temp.pm('e3')).owner_user_id, '94300000-0000-4000-8000-000000000004'::uuid,
  'a DM assigning a roster character to a player''s seat hands the character to that player');

-- The creator's hold ends with the claim. At the DM's table the DM reads and
-- writes it as the DM; once its owner takes it to their pool it is theirs alone.
set local role authenticated;
select pg_temp.as_user(1);
select isnt_empty($$ select id from public.party_members where id = '94300000-0000-4000-8000-0000000000e3' $$,
  'control: the DM who made it still reads it while it sits at their table');
select pg_temp.as_user(4);
select lives_ok($$ select public.detach_party_member_from_campaign('94300000-0000-4000-8000-0000000000e3') $$,
  'its new owner takes it to their pool');
select pg_temp.as_user(1);
select is_empty($$ select id from public.party_members where id = '94300000-0000-4000-8000-0000000000e3' $$,
  'and the account that created it can no longer read it there');
select is_empty($$ update public.party_members set name = 'Taken back'
   where id = '94300000-0000-4000-8000-0000000000e3' returning id $$,
  'or write it');
select pg_temp.as_user(4);
select isnt_empty($$ select id from public.party_members where id = '94300000-0000-4000-8000-0000000000e3' $$,
  'control: its owner reads it');
reset role;

-- ── What a client can reach ──────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.convert_party_member_ruleset(uuid,text)', 'EXECUTE'),
  'anon cannot convert a character');
select ok(not has_function_privilege('anon', 'public.convert_party_member_copy(uuid,text)', 'EXECUTE'),
  'anon cannot take a converted copy');

-- ruleset_reviews has no campaign_id, so it rings the doorbell of whichever
-- table the character sits at instead of travelling as a filtered row.
insert into public.campaign_sync (campaign_id, changed_table, updated_at)
values ('94300000-0000-4000-8000-0000000000c1', 'probe', now())
on conflict (campaign_id) do update set changed_table = excluded.changed_table;
insert into public.ruleset_reviews (party_member_id, flag_type)
values ('94300000-0000-4000-8000-0000000000e1', 'background');
select is((select changed_table from public.campaign_sync where campaign_id = '94300000-0000-4000-8000-0000000000c1'),
  'ruleset_reviews', 'a review on a seated character rings its campaign''s doorbell');

-- The two flags that stand a guard down are raised by a fixed set of functions
-- and by nothing a client can call with a key of its choosing. The subclass sync
-- handing a converted pick back (restore_subclass_picks, 20261008195336) is one:
-- it is reached only from the sync's triggers, never by a client.
select is_empty($q$
  select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
    and p.prosrc ~ 'set_config\(\s*''grimoire\.(spell_limits|pm_ruleset_transition)'''
    and (n.nspname, p.proname) not in (('private', 'convert_party_member_ruleset'), ('private', 'copy_party_member'),
                                       ('private', 'repoint_party_member_content'), ('private', 'restore_subclass_picks'))
$q$, 'only the conversion, the copy, a re-point and a subclass pick handed back may suspend the spell limit or admit a ruleset write');

-- ── One reader, structurally ─────────────────────────────────────────────────
-- Body-based on purpose: an outcome test covers only the functions someone
-- remembered to route through the resolver, and what went wrong in
-- 20261001220509 was fifteen that each resolved it themselves.

select is_empty($q$
  select n.nspname || '.' || p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
    and p.prosrc ~* 'coalesce\(\s*\w+\.ruleset\s*,'
$q$, 'no function defaults a ruleset inline');

select * from finish();
rollback;
